import { Bodies, Body, Composite, Engine, Vector } from "matter-js";
import { io } from "../socketIo";
import { Game, GameSocket, Room } from "../types"
import { ENEMY_CATEGORY, PLAYER_CATEGORY, PLAYER_SIZE, SWORD_COOLDOWN, SWORD_TIME, SWORD_RANGE, SWORD_LENGHT, GAME_BORDER, BOUNDARY_CATEGORY, PLAYER_UPGRADES, PLAYER_INITIAL, SHOP_POSITION, CIVILIAN_CATEGORY, MISSION_POSITION, itemsPrices, SWORD_CATEGORY, TOTAL_LEVELS, SWORD_DELAY } from "../constants";
import { db } from "../database";
import { getPlayers, getPlayersInfos, spawnPlayer, updatePlayers } from "./players";
import { spawnBoss, spawnEnemies, updateBoss, updateEnemies } from "./enemies";
import { setupCollisions } from "./collisions";

export let runningGames: {
  [game: string]: Game,
} = {};

const createCivilians = () => {
  const civilianOptions = {
    isStatic: true,
    slop: 0.0001,
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

const createBoundaries = () => {
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

  return [minXBoundary, maxXBoundary, minYBoundary, maxYBoundary];
}

export const startLevel = (room: Room) => {
  const game = runningGames[room];
  Composite.remove(game.engine.world, [game.shoper, game.mission]);
  game.levelRunning = true;

  if (game.level == TOTAL_LEVELS) {
    spawnBoss(room);
  }

  io.to(room).emit("startLevel");
}

export const endLevel = async (room: Room) => {
  const game = runningGames[room];
  if (game.level == TOTAL_LEVELS) {
    await endGame(room);
    return;
  }
  game.levelRunning = false;
  game.level += 1;
  game.enemiesSpawned = 0;
  for (const player of Object.values(getPlayers(room))) {
    player.health = player.maxHealth;
  }
  Composite.add(game.engine.world, [game.shoper, game.mission]);

  io.to(room).emit("endLevel");
}

export const endGame = async (room: Room) => {
  io.to(room).emit("endGame");
  await db.none("UPDATE games SET status = 'finished' WHERE name = $1", [room.slice(4)]);
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
      enemySpawnTimer: 0,
      gooSpawnTimer: 0,
      level: 0,
      levelRunning: false,
      enemiesSpawned: 0,
    };
    Composite.add(runningGames[room].engine.world, [shoper, mission]);

    const boundaries = createBoundaries();
    Composite.add(runningGames[room].engine.world, boundaries);

    for (const id of io.of('/').adapter.rooms.get(room) || []) {
      const socket = io.of('/').sockets.get(id);
      if (!socket || !socket.data.user) {
        continue;
      }
      spawnPlayer(socket);
    }

    setupCollisions(room);

    await db.none("UPDATE games SET status = 'started' WHERE name = $1", [room.slice(4)]);

    io.to(room).emit('startGame');
  });

  socket.on('move', (movement) => {
    const game = socket.data.game;
    if (!game) {
      return;
    }
    if (game.player.stuckTimeout) {
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
    if (game.player.stuckTimeout) {
      return;
    }

    // The sword is a triangle
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
        category: SWORD_CATEGORY,
        mask: ENEMY_CATEGORY | PLAYER_CATEGORY,
      },
      label: 'sword',
    });

    // Add sword to game after a time (to sync with client)
    // and remove after a time
    // Also, start a cooldown so the player can't
    // spam attack
    game.player.endAttackTime = new Date().getTime() + SWORD_TIME;
    setTimeout(() => {
      Composite.add(game.playerWithSword, sword);
      swordTime = setTimeout(() => {
        Composite.remove(game.playerWithSword, sword);
        swordTime = null;
        game.player.endAttackTime = undefined;
        swordCooldown = setTimeout(() => {
          swordCooldown = null;
        }, SWORD_COOLDOWN);
      }, SWORD_TIME);
    }, SWORD_DELAY);
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
    updateBoss(delta, room);
  }
  updatePlayers(room);


  Engine.update(game.engine, delta);

  const coins = Object.fromEntries(Composite.allBodies(game.engine.world)
    .filter((body) => body.label == "coin")
    .map((body) => [body.id, body.position])
  );

  const goo = Object.fromEntries(Composite.allBodies(game.engine.world)
    .filter((body) => body.label == "goo")
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
    boss: game.boss?.body.position,
    coins,
    goo,
  });
}
