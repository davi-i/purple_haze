import { Bodies, Body, Common, Composite, Engine, Events, Pair, Vector } from "matter-js";
import { io } from "./socketIo";
import { Enemy, Game, GameSocket, Player, PlayerInfos, Room } from "./types"
import { ENEMY_CATEGORY, ENEMY_SIZE, ENEMY_SPAWN_INTERVAL, PLAYER_CATEGORY, PLAYER_SIZE, PLAYER_SPAWN_AREA, SWORD_COOLDOWN, SWORD_TIME, PLAYER_INVINCIBLE_TIME, ENEMY_SPAWN_GAP, SWORD_RANGE, SWORD_LENGHT, GAME_BORDER, BOUNDARY_CATEGORY, maxEnemies, enemies, enemyHealth, enemySpeed, PLAYER_UPGRADES, PLAYER_INITIAL, SHOP_POSITION, CIVILIAN_CATEGORY, MISSION_POSITION, INITIAL_PRICES, PRICE_INCREASE, COIN_SIZE, GOLD_PER_ENEMY, itemsPrices } from "./constants";
import { db } from "./database";
import { getSockets } from "./rooms";

export let runningGames: {
  [game: string]: Game,
} = {};


export const spawnPlayer = (socket: GameSocket) => {
  const room = socket.data.user!.room;
  if (!runningGames.hasOwnProperty(room)) {
    throw new Error('Cannot spawn player yet');
  }
  const x = Common.random(PLAYER_SPAWN_AREA.minX, PLAYER_SPAWN_AREA.maxX);
  const y = Common.random(PLAYER_SPAWN_AREA.minY, PLAYER_SPAWN_AREA.maxY);
  const body = Bodies.rectangle(x, y, PLAYER_SIZE.width, PLAYER_SIZE.height, {
    collisionFilter: {
      category: PLAYER_CATEGORY,
      mask: BOUNDARY_CATEGORY | CIVILIAN_CATEGORY,
    },
    label: 'player'
  });
  const player: Player = {
    body,
    health: PLAYER_INITIAL.maxHealth,
    facing: 'up',
    invincible: true,
    gold: 0,
    upgrades: {
      speed: 0,
      maxHealth: 0,
      attack: 0,
    },
    ...PLAYER_INITIAL
  };
  setTimeout(() => {
    player.body.collisionFilter.mask! |= ENEMY_CATEGORY;
    player.invincible = false;
  }, PLAYER_INVINCIBLE_TIME);
  const playerWithSword = Composite.create();
  Composite.add(playerWithSword, player.body);
  socket.data.game = {
    playerWithSword,
    player
  };
  Composite.add(runningGames[room].engine.world, playerWithSword);
}

const updatePlayers = (room: Room) => {
  for (const socket of getSockets(room)) {
    const game = socket.data.game;
    if (!game) {
      continue;
    }
    const sword = game.playerWithSword.bodies.find((body) => body.label == 'sword');
    if (sword) {
      if (game.player.facing == 'up') {
        Body.setPosition(sword, {
          x: game.player.body.position.x,
          y: game.player.body.position.y - PLAYER_SIZE.height / 2 - 2 * SWORD_LENGHT / 3
        });
        Body.setAngle(sword, 0);
      } else if (game.player.facing == 'down') {
        Body.setPosition(sword, {
          x: game.player.body.position.x,
          y: game.player.body.position.y + PLAYER_SIZE.height / 2 + 2 * SWORD_LENGHT / 3
        });
        Body.setAngle(sword, Math.PI);
      } else if (game.player.facing == 'left') {
        Body.setPosition(sword, {
          x: game.player.body.position.x - PLAYER_SIZE.width / 2 - 2 * SWORD_LENGHT / 3,
          y: game.player.body.position.y
        });
        Body.setAngle(sword, 3 * Math.PI / 2);
      } else {
        Body.setPosition(sword, {
          x: game.player.body.position.x + PLAYER_SIZE.width / 2 + 2 * SWORD_LENGHT / 3,
          y: game.player.body.position.y
        });
        Body.setAngle(sword, Math.PI / 2);
      }
    }
    if (game.player.health <= 0) {
      Composite.remove(runningGames[room].engine.world, game.playerWithSword);
      socket.data.game = undefined;
      socket.emit('gameOver', (response) => {
        if (response == 'leave') {
          socket.leave(room);
        } else {
          spawnPlayer(socket);
        }
      });
    }
  }
}

export const getPlayers = (room: Room) => {
  return Object.fromEntries(getSockets(room)
    .filter((socket) => socket.data && socket.data.user && socket.data.game)
    .map((socket) => [socket.data!.user!.username, socket.data!.game!.player]));
}

export const getPlayersInfos = (room: Room): PlayerInfos => {
  return Object.fromEntries(
    Object.entries(getPlayers(room)).map(
      ([username, { body, ...player }]) => [username, {
        position: body.position,
        ...player,
      }]
    )
  )
}

const findTarget = (enemy: Enemy, room: Room) => {
  // Find the nearest player
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

const updateEnemies = (room: Room) => {
  const game = runningGames[room];
  for (let i = 0; i < game.enemies.length; i++) {
    const enemy = game.enemies[i];
    if (enemy.health <= 0) {
      io.to(room).emit("enemyKilled", enemy.body.id);
      Composite.remove(game.engine.world, enemy.body);
      game.enemies.splice(i--, 1);
      if (game.enemies.length == 0 && game.enemiesSpawned >= enemies(game.level)) {
        endLevel(room);
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
      // Calculate the vector towards the target player
      const direction = Vector.sub(enemy.targetPlayer.body.position, enemy.body.position);
      // Normalize the vector to get a unit vector
      const normalizedDirection = Vector.normalise(direction);
      // Multiply the normalized vector by a speed factor to control the enemy's movement speed
      const velocity = Vector.mult(normalizedDirection, enemy.speed);
      // Apply the velocity to the enemy's body
      Body.setVelocity(enemy.body, velocity);
    } else {
      findTarget(enemy, room);
    }
  }
}

const spawnEnemies = (delta: number, room: Room) => {
  const game = runningGames[room];
  game.spawnTimer += delta;

  if (game.spawnTimer < ENEMY_SPAWN_INTERVAL) {
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
    label: 'enemy',
    collisionFilter: {
      category: ENEMY_CATEGORY,
      mask: PLAYER_CATEGORY | ENEMY_CATEGORY | BOUNDARY_CATEGORY,
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
  game.spawnTimer = 0;
  game.enemiesSpawned += 1;
}

const createCivilians = () => {
  const civilianOptions = {
    isSensor: true,
    isStatic: true,
    collisionFilter: {
      category: CIVILIAN_CATEGORY,
      mask: PLAYER_CATEGORY,
    }
  };
  const shoper = Bodies.rectangle(SHOP_POSITION.x, SHOP_POSITION.y, 1, 1, {
    label: "shoper",
    ...civilianOptions
  });
  const mission = Bodies.rectangle(MISSION_POSITION.x, MISSION_POSITION.y, 1, 1, {
    label: "mission",
    ...civilianOptions
  });
  return { shoper, mission };
}

const startLevel = (room: Room) => {
  const game = runningGames[room];
  Composite.remove(game.engine.world, [game.shoper, game.mission]);
  game.levelRunning = true;

  io.to(room).emit("startLevel");
}

const endLevel = (room: Room) => {
  const game = runningGames[room];
  game.levelRunning = false;
  game.level += 1;
  game.enemiesSpawned = 0;
  for (const player of Object.values(getPlayers(room))) {
    player.health = player.maxHealth;
  }
  Composite.add(game.engine.world, [game.shoper, game.mission]);

  io.to(room).emit("endLevel");
}

const onAnyCollisionWithLabel = (pair: Pair, label: string, func: (body: Body) => void) => {
  if (pair.bodyA.label == label) {
    func(pair.bodyB);
  } else if (pair.bodyB.label == label) {
    func(pair.bodyA);
  }
}

const onCollisionWithLabel = (pair: Pair, label: string, myLabel: string, func: (body: Body, collisor: Body) => void) => {
  if (pair.bodyA.label == label && pair.bodyB.label == myLabel) {
    func(pair.bodyB, pair.bodyA);
  } else if (pair.bodyB.label == label && pair.bodyA.label == myLabel) {
    func(pair.bodyA, pair.bodyB);
  }
}

const onPlayerCollisionWithLabel = (room: Room, pair: Pair, label: string, func: (socket: GameSocket, collisor: Body) => void) => {
  onCollisionWithLabel(pair, label, 'player', (body, collisor) => {
    const socket = getSockets(room)
      .find((socket) => socket.data.game && socket.data.game.player.body.id === body.id)!;
    func(socket, collisor);
  });
}

export const setupGame = (socket: GameSocket) => {
  socket.on('startGame', async () => {
    const user = socket.data.user!;
    if (!user.isCreator) {
      console.log(`user ${user.username} tried to start game`);
      return;
    }

    const room = user.room;

    const { shoper, mission } = createCivilians();

    runningGames[room] = {
      engine: Engine.create({
        gravity: {
          scale: 0
        }
      }),
      interval: setInterval(() => gameLoop(room), 1000 / 60),
      enemies: [],
      shoper,
      mission,
      spawnTimer: 0,
      level: 0,
      levelRunning: false,
      enemiesSpawned: 0,
    };
    Composite.add(runningGames[room].engine.world, [shoper, mission]);
    const boundaryOptions = {
      label: "boundary",
      isStatic: true,
      isSensor: true,
      collisionFilter: {
        category: BOUNDARY_CATEGORY,
        mask: ~BOUNDARY_CATEGORY,
      },
    };

    const minXBoundary = Bodies.rectangle(
      GAME_BORDER.minX,
      (GAME_BORDER.minY + GAME_BORDER.maxY) / 2,
      0.1,
      GAME_BORDER.maxY - GAME_BORDER.minY,
      boundaryOptions
    );
    const maxXBoundary = Bodies.rectangle(
      GAME_BORDER.maxX,
      (GAME_BORDER.minY + GAME_BORDER.maxY) / 2,
      0.1,
      GAME_BORDER.maxY - GAME_BORDER.minY,
      boundaryOptions
    );
    const minYBoundary = Bodies.rectangle(
      (GAME_BORDER.minX + GAME_BORDER.maxX) / 2,
      GAME_BORDER.minY,
      GAME_BORDER.maxX - GAME_BORDER.minX,
      0.1,
      boundaryOptions
    );
    const maxYBoundary = Bodies.rectangle(
      (GAME_BORDER.minX + GAME_BORDER.maxX) / 2,
      GAME_BORDER.maxY,
      GAME_BORDER.maxX - GAME_BORDER.minX,
      0.1,
      boundaryOptions
    );

    Composite.add(runningGames[room].engine.world, [minXBoundary, maxXBoundary, minYBoundary, maxYBoundary]);

    Events.on(runningGames[room].engine, 'collisionStart', (event) => {
      const pairs = event.pairs;

      for (var i = 0; i < pairs.length; i++) {
        const pair = pairs[i];

        onCollisionWithLabel(pair, 'sword', 'enemy', (body) => {
          const enemy = runningGames[room].enemies.find((enemy) => enemy.body.id === body.id)!;
          enemy.health -= 1;
          io.to(room).emit("enemyHurt", enemy.body.id);
        });
        onPlayerCollisionWithLabel(room, pair, 'enemy', (socket) => {
          const player = socket.data.game!.player;
          if (!player.invincible) {
            player.health -= 1;
            player.invincible = true;
            player.body.collisionFilter.mask! &= ~ENEMY_CATEGORY;
            setTimeout(() => {
              player.invincible = false;
              player.body.collisionFilter.mask! |= ENEMY_CATEGORY;
            }, PLAYER_INVINCIBLE_TIME);
          }
        });
        onPlayerCollisionWithLabel(room, pair, 'shoper', (socket) => {
          const player = socket.data.game!.player;
          const items = itemsPrices(player.upgrades);
          socket.emit("shop", items, player.gold)
        });
        onPlayerCollisionWithLabel(room, pair, 'mission', (socket) => {
          socket.emit('mission', enemies(runningGames[room].level), (response) => {
            if (response == "start") {
              console.log("start level");
              startLevel(room);
            }
          });
        });
        onPlayerCollisionWithLabel(room, pair, 'coin', (socket, coin) => {
          const player = socket.data.game!.player;
          player.gold += GOLD_PER_ENEMY;
          Composite.remove(runningGames[room].engine.world, coin);
          io.to(room).emit("coinCollected", coin.id);
        });
      }
    });

    Events.on(runningGames[room].engine, "collisionActive", (event) => {
      const pairs = event.pairs;

      for (var i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        onAnyCollisionWithLabel(pair, "boundary", (body) => {
          Body.setPosition(body, {
            x: Math.min(Math.max(body.position.x, GAME_BORDER.minX), GAME_BORDER.maxX),
            y: Math.min(Math.max(body.position.y, GAME_BORDER.minY), GAME_BORDER.maxY),
          });
        });
        onPlayerCollisionWithLabel(room, pair, 'shoper', (socket) => {
          const body = socket.data.game!.player.body;
          Body.setPosition(body, {
            x: Math.min(Math.max(body.position.x, SHOP_POSITION.x - 1), SHOP_POSITION.x + 1),
            y: Math.min(Math.max(body.position.y, SHOP_POSITION.y - 1), SHOP_POSITION.y + 1),
          });
        });
      }
    });

    for (const id of io.of('/').adapter.rooms.get(room) || []) {
      const socket = io.of('/').sockets.get(id);
      if (!socket || !socket.data.user) {
        continue;
      }
      spawnPlayer(socket);
    }

    await db.none("UPDATE games SET status = 'started' WHERE name = $1", [room.slice(4)]);

    io.to(room).emit('startGame');
  });

  socket.on('move', (movement) => {
    const game = socket.data.game;
    if (!game) {
      return;
    }
    if (movement.y < 0) {
      game.player.facing = 'up';
    } else if (movement.y > 0) {
      game.player.facing = 'down';
    } else if (movement.x < 0) {
      game.player.facing = 'left';
    } else if (movement.x > 0) {
      game.player.facing = 'right';
    }
    const normalizedDirection = Vector.normalise(movement);
    const velocity = Vector.mult(normalizedDirection, game.player.speed);
    Body.setVelocity(game.player.body, velocity);
  });

  let swordTime: ReturnType<typeof setTimeout> | null = null;
  let swordCooldown: ReturnType<typeof setTimeout> | null = null;
  socket.on('attack', () => {
    if (swordTime || swordCooldown) {
      return;
    }
    const game = socket.data.game;
    if (!game) {
      return;
    }
    const vertices = [[
      { x: -SWORD_RANGE / 2, y: 0 },
      { x: SWORD_RANGE / 2, y: 0 },
      { x: 0, y: SWORD_LENGHT },
    ]];
    const centerX = game.player.body.position.x;
    const centerY = game.player.body.position.y - PLAYER_SIZE.height / 2 - 2 * SWORD_LENGHT / 3;
    const sword = Bodies.fromVertices(centerX, centerY, vertices, {
      isSensor: true,
      collisionFilter: {
        category: PLAYER_CATEGORY,
        mask: ENEMY_CATEGORY,
      },
      label: 'sword',
    });


    Composite.add(game.playerWithSword, sword);
    game.player.endAttackTime = new Date().getTime() + SWORD_TIME;
    swordTime = setTimeout(() => {
      Composite.remove(game.playerWithSword, sword);
      swordTime = null;
      game.player.endAttackTime = undefined;
      swordCooldown = setTimeout(() => {
        swordCooldown = null;
      }, SWORD_COOLDOWN);
    }, SWORD_TIME);
  });
  socket.on("shop", (item, ack) => {
    if (item == "cancel") {
      ack({ result: "error", reason: "cancel" });
      return;
    }
    const player = socket.data.game!.player;
    const items = itemsPrices(player.upgrades);
    if (player.gold < items[item]) {
      ack({ result: "error", reason: "not enough gold" });
      return;
    }
    player.gold -= items[item];
    player.upgrades[item]++;
    player[item] = PLAYER_INITIAL[item] + PLAYER_UPGRADES[item] * player.upgrades[item];
    player.health = player.maxHealth;
    ack({ result: "bought", items: itemsPrices(player.upgrades), coins: player.gold });
  });
}

const gameLoop = async (room: Room) => {
  const game = runningGames[room];
  const delta = 1000 / 60;

  if (game.levelRunning) {
    spawnEnemies(delta, room);
    updateEnemies(room);
  }
  updatePlayers(room);


  Engine.update(game.engine, delta);

  const coins = Object.fromEntries(Composite.allBodies(game.engine.world)
    .filter((body) => body.label == "coin")
    .map((body) => [body.id, body.position])
  );

  io.to(room).emit('objects', {
    players: getPlayersInfos(room),
    enemies: Object.fromEntries(
      runningGames[room].enemies.map(({ body, targetPlayer, ...enemy }) => [
        body.id,
        { position: body.position, ...enemy }
      ])
    ),
    shoper: game.levelRunning ? undefined : game.shoper.position,
    mission: game.levelRunning ? undefined : game.mission.position,
    coins,
  });
}
