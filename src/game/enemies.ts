import { Bodies, Body, Common, Composite, Composites, Sleeping, Vector } from "matter-js";
import { Boss, Enemy, Player, Room } from "../types";
import { getPlayers } from "./players";
import { endLevel, runningGames } from ".";
import { io } from "../socketIo";
import { BOSS_HEALTH, BOSS_RADIUS, BOSS_SPEED, BOUNDARY_CATEGORY, CIVILIAN_CATEGORY, COIN_SIZE, ENEMY_CATEGORY, ENEMY_SIZE, ENEMY_SPAWN_GAP, ENEMY_SPAWN_INTERVAL, GOO_CATEGORY, GOO_SPAWN_INTERVAL, GOO_SPEED, PLAYER_CATEGORY, PLAYER_SPAWN_AREA, SWORD_CATEGORY, TOTAL_LEVELS, enemies, enemyHealth, enemySpeed, maxEnemies } from "../constants";

const moveTo = (body: Body, point: Vector, speed: number) => {
  const direction = Vector.sub(point, body.position);
  const normalizedDirection = Vector.normalise(direction);
  const velocity = Vector.mult(normalizedDirection, speed);
  Body.setVelocity(body, velocity);
}

const findTarget = (enemy: Enemy, room: Room) => {
  let nearestPlayer: Player | undefined = undefined;
  let shortestDistance = Infinity;
  const players = getPlayers(room);
  for (const [_, player] of Object.entries(players)) {
    const distance = Vector.magnitude(Vector.sub(player.body.position, enemy.body.position));
    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestPlayer = player;
    }
  }

  enemy.targetPlayer = nearestPlayer;
}

export const updateEnemies = (room: Room) => {
  const game = runningGames[room];
  for (let i = 0; i < game.enemies.length; i++) {
    const enemy = game.enemies[i];
    if (enemy.health <= 0) {
      io.to(room).emit("enemyKilled", enemy.body.id);
      Composite.remove(game.engine.world, enemy.body);
      game.enemies.splice(i--, 1);
      if (game.enemies.length == 0 && game.enemiesSpawned >= enemies(game.level)) {
        if (game.level < TOTAL_LEVELS) {
          endLevel(room);
        }
      }

      const coin = Bodies.rectangle(
        enemy.body.position.x,
        enemy.body.position.y,
        COIN_SIZE.width,
        COIN_SIZE.height,
        {
          label: "coin",
          isStatic: true,
          isSensor: true,
          collisionFilter: {
            category: CIVILIAN_CATEGORY,
            mask: PLAYER_CATEGORY,
          }
        }
      );

      Composite.add(game.engine.world, coin);
    } else if (enemy.targetPlayer && enemy.targetPlayer.health > 0) {
      moveTo(enemy.body, enemy.targetPlayer.body.position, enemy.speed);
    } else {
      findTarget(enemy, room);
    }
  }
}

export const spawnEnemies = (delta: number, room: Room) => {
  const game = runningGames[room];
  game.enemySpawnTimer += delta;

  if (game.enemySpawnTimer < ENEMY_SPAWN_INTERVAL) {
    // Not enough time has passed to spawn;
    return;
  }

  if (game.enemies.length >= maxEnemies(game.level)) {
    // Too many enemies
    return;
  }

  if (game.enemiesSpawned >= enemies(game.level)) {
    // No more enemies to spawn
    return;
  }
  // 0 means up, 1 means down, 2 means left and 3 means right
  const spawnSide = Math.floor(Math.random() * 4);
  let minX = PLAYER_SPAWN_AREA.minX - ENEMY_SPAWN_GAP;
  let maxX = PLAYER_SPAWN_AREA.maxX + ENEMY_SPAWN_GAP;
  let minY = PLAYER_SPAWN_AREA.minY - ENEMY_SPAWN_GAP;
  let maxY = PLAYER_SPAWN_AREA.maxY + ENEMY_SPAWN_GAP;
  if (spawnSide == 0) {
    maxY = PLAYER_SPAWN_AREA.minY;
  } else if (spawnSide == 1) {
    minY = PLAYER_SPAWN_AREA.maxY;
  } else if (spawnSide == 2) {
    maxX = PLAYER_SPAWN_AREA.minX;
  } else if (spawnSide == 3) {
    minX = PLAYER_SPAWN_AREA.maxX;
  }
  const x = Common.random(minX, maxX);
  const y = Common.random(minY, maxY);

  const body = Bodies.rectangle(x, y, ENEMY_SIZE.width, ENEMY_SIZE.height, {
    slop: 0.0001,
    label: 'enemy',
    collisionFilter: {
      category: ENEMY_CATEGORY,
      mask: PLAYER_CATEGORY | ENEMY_CATEGORY | BOUNDARY_CATEGORY | SWORD_CATEGORY,
    }
  });

  const enemy: Enemy = {
    body,
    health: enemyHealth(game.level),
    speed: enemySpeed(game.level),
  };

  findTarget(enemy, room);

  Composite.add(game.engine.world, enemy.body);

  game.enemies.push(enemy);
  game.enemySpawnTimer = 0;
  game.enemiesSpawned += 1;
}

export const spawnBoss = (room: Room) => {
  const game = runningGames[room];

  const body = Bodies.circle(0, 20, BOSS_RADIUS, {
    slop: 0.0001,
    label: 'boss',
    collisionFilter: {
      category: ENEMY_CATEGORY,
      mask: PLAYER_CATEGORY | ENEMY_CATEGORY | BOUNDARY_CATEGORY | SWORD_CATEGORY,
    }
  });

  const boss: Boss = {
    body,
    health: BOSS_HEALTH,
    speed: BOSS_SPEED,
    stage: 0,
  };

  findTarget(boss, room);

  Composite.add(game.engine.world, boss.body);

  game.boss = boss;
}

export const updateBoss = (delta: number, room: Room) => {
  const boss = runningGames[room].boss;
  if (!boss) {
    return;
  }
  if (boss.health <= 0) {
    io.to(room).emit("bossKilled");
    endLevel(room);
    return;
  }

  if (boss.stage == 0) {
    moveToPlayerUntilHealth(boss, room, 2 * BOSS_HEALTH / 3);
  } else if (boss.stage == 1) {
    Sleeping.set(boss.body, true);
    spawnGoo(room, boss, delta);
    if (boss.health <= BOSS_HEALTH / 2) {
      boss.stage++;
      io.to(room).emit("bossEnraged");
      boss.speed += 0.02;
    }
  } else if (boss.stage == 2) {
    Sleeping.set(boss.body, false);
    moveToPlayerUntilHealth(boss, room, BOSS_HEALTH / 3);
  } else if (boss.stage == 3) {
    Sleeping.set(boss.body, true);
    spawnGoo(room, boss, delta);
  }
}

const moveToPlayerUntilHealth = (boss: Boss, room: Room, health: number) => {
  if (boss.targetPlayer && boss.targetPlayer.health > 0) {
    moveTo(boss.body, boss.targetPlayer.body.position, boss.speed);
  } else {
    findTarget(boss, room);
  }
  if (boss.health <= health) {
    boss.stage++;
  }
}


const spawnGoo = (room: Room, boss: Boss, delta: number) => {
  const game = runningGames[room];
  game.gooSpawnTimer += delta;

  if (game.gooSpawnTimer < GOO_SPAWN_INTERVAL) {
    // Not enough time has passed to spawn;
    return;
  }
  const position = boss.body.position;
  for (let i = 0; i < 8; i++) {
    const body = Bodies.circle(position.x, position.y, .2, {
      isSensor: true,
      friction: 0,
      frictionAir: 0,
      frictionStatic: 0,
      label: 'goo',
      collisionFilter: {
        category: GOO_CATEGORY,
        mask: PLAYER_CATEGORY,
      }
    });

    Composite.add(game.engine.world, body);

    const angle = i * (Math.PI / 4) + Common.random(0, Math.PI / 4);
    const direction = {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
    const normalizedDirection = Vector.normalise(direction);
    const velocity = Vector.mult(normalizedDirection, GOO_SPEED);
    Body.setVelocity(body, velocity)

    setTimeout(() => {
      if (Composite.get(game.engine.world, body.id, "body")) {
        Composite.remove(game.engine.world, body);
        io.to(room).emit("gooDestroyed", body.id);
      }
    }, 5000);
  }

  game.gooSpawnTimer = 0;
}

