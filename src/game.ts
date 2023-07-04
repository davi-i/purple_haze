import { Bodies, Body, Common, Composite, Engine, Events, Pair, Vector } from "matter-js";
import { io } from "./socketIo";
import { Enemy, Game, GameSocket, Player, PlayerInfos, Room } from "./types"
import { ENEMY_CATEGORY, ENEMY_HEALTH, ENEMY_SIZE, ENEMY_SPAWN_INTERVAL, ENEMY_SPEED, PLAYER_CATEGORY, PLAYER_HEALTH, PLAYER_SIZE, PLAYER_SPEED, PLAYER_SPAWN_AREA, SWORD_COOLDOWN, SWORD_TIME, TOTAL_ENEMIES, PLAYER_INVINCIBLE_TIME } from "./constants";
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
      mask: ENEMY_CATEGORY,
    },
    label: 'player'
  });
  const player: Player = {
    body,
    health: PLAYER_HEALTH,
    facing: 'up',
    invincible: true,
  };
  setTimeout(() => {
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
  for (const socket of Object.values(getSockets(room))) {
    const game = socket.data.game;
    if (!game) {
      continue;
    }
    if (game.player.health <= 0) {
      Composite.remove(runningGames[room].engine.world, game.playerWithSword);
      socket.data.game = undefined;
      socket.emit('gameOver', (response) => {
        if (response == 'restart') {
          spawnPlayer(socket);
        } else {
          socket.leave(room);
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
      ([username, player]) => [username, {
        position: player.body.position,
        health: player.health,
        facing: player.facing,
        invincible: player.invincible
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
      Composite.remove(game.engine.world, enemy.body);
      game.enemies.splice(i--, 1);
    } else if (enemy.targetPlayer && enemy.targetPlayer.health > 0) {
      // Calculate the vector towards the target player
      const direction = Vector.sub(enemy.targetPlayer.body.position, enemy.body.position);
      // Normalize the vector to get a unit vector
      const normalizedDirection = Vector.normalise(direction);
      // Multiply the normalized vector by a speed factor to control the enemy's movement speed
      const velocity = Vector.mult(normalizedDirection, ENEMY_SPEED);
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

  if (game.enemies.length >= TOTAL_ENEMIES) {
    // Too many enemies
    return;
  }
  const x = Math.random() * 800;
  const y = -50;

  const body = Bodies.rectangle(x, y, ENEMY_SIZE.width, ENEMY_SIZE.height, {
    label: 'enemy',
    collisionFilter: {
      category: ENEMY_CATEGORY,
      mask: PLAYER_CATEGORY | ENEMY_CATEGORY,
    }
  });

  const enemy: Enemy = {
    body,
    health: ENEMY_HEALTH,
  };

  findTarget(enemy, room);

  Composite.add(game.engine.world, enemy.body);

  game.enemies.push(enemy);
  game.spawnTimer = 0;
}

const hasLabel = (pair: Pair, label1: string, label2: string) => {
  return (pair.bodyA.label == label1 && pair.bodyB.label == label2)
    || (pair.bodyA.label == label2 && pair.bodyB.label == label1);
}

export const setupGame = (socket: GameSocket) => {
  socket.on('startGame', async () => {
    const user = socket.data.user!;
    if (!user.isCreator) {
      console.log(`user ${user.username} tried to start game`);
      return;
    }

    const room = user.room;

    runningGames[room] = {
      engine: Engine.create({
        gravity: {
          scale: 0
        }
      }),
      interval: setInterval(() => gameLoop(room), 1000 / 60),
      enemies: [],
      spawnTimer: 0,
    };

    Events.on(runningGames[room].engine, 'collisionStart', function(event) {
      var pairs = event.pairs;

      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i];

        // Check if the sensor has collided with another body
        if (hasLabel(pair, 'sword', 'enemy')) {
          const enemy = runningGames[room].enemies.find(
            (enemy) => enemy.body.id === pair.bodyA.id || enemy.body.id === pair.bodyB.id
          )!;
          enemy.health -= 1;
        } else if (hasLabel(pair, 'player', 'enemy')) {
          const player = Object.values(getPlayers(room)).find(
            (player) => player.body.id === pair.bodyA.id || player.body.id === pair.bodyB.id
          )!;
          if (!player.invincible) {
            player.health -= 1;
            player.invincible = true;
            setTimeout(() => {
              player.invincible = false;
            }, PLAYER_INVINCIBLE_TIME);
          }
        }
      }
    });

    const positions = Array.from(io.of('/').adapter.rooms.get(room) || [])
      .map((id) => io.of('/').sockets.get(id))
      .filter((socket) => socket && socket.data.user)
      .reduce((infos: PlayerInfos, socket) => {
        spawnPlayer(socket!);
        const player = socket!.data.game!.player;
        infos[socket!.data.user!.username] = {
          position: player.body.position,
          health: player.health,
          facing: player.facing,
          invincible: player.invincible
        };
        return infos;
      }, {});

    await db.none("UPDATE games SET status = 'started' WHERE name = $1", [room.slice(4)]);

    io.to(room).emit('startGame', { players: positions });
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
    for (const body of Composite.allBodies(game.playerWithSword)) {
      const normalizedDirection = Vector.normalise(movement);
      const velocity = Vector.mult(normalizedDirection, PLAYER_SPEED);
      Body.setVelocity(body, velocity);
    }
  });

  let swordTime: ReturnType<typeof setTimeout> | null = null;
  let swordCooldown: ReturnType<typeof setTimeout> | null = null;
  socket.on('attack', (ack) => {
    if (swordTime) {
      ack({ result: 'error', reason: 'already attacking' });
      return;
    }
    if (swordCooldown) {
      ack({ result: 'error', reason: 'cooldown' });
      return;
    }
    const game = socket.data.game;
    if (!game) {
      ack({ result: 'error', reason: 'unknown' });
      return;
    }
    let centerX, centerY;
    if (game.player.facing == 'up') {
      centerX = game.player.body.position.x;
      centerY = game.player.body.position.y - PLAYER_SIZE.height / 2;
    } else if (game.player.facing == 'down') {
      centerX = game.player.body.position.x;
      centerY = game.player.body.position.y + PLAYER_SIZE.height / 2;
    } else if (game.player.facing == 'left') {
      centerX = game.player.body.position.x - PLAYER_SIZE.width / 2;
      centerY = game.player.body.position.y;
    } else {
      centerX = game.player.body.position.x + PLAYER_SIZE.width / 2;
      centerY = game.player.body.position.y;
    }
    const sword = Bodies.circle(centerX, centerY, (PLAYER_SIZE.height - 10) / 2, {
      isSensor: true,
      collisionFilter: {
        category: PLAYER_CATEGORY,
        mask: ENEMY_CATEGORY,
      },
      label: 'sword',
    });
    Composite.add(game.playerWithSword, sword);
    ack({
      result: {
        endTime: new Date().getTime() + SWORD_TIME
      }
    });
    swordTime = setTimeout(() => {
      Composite.remove(game.playerWithSword, sword);
      swordTime = null;
      swordCooldown = setTimeout(() => {
        swordCooldown = null;
      }, SWORD_COOLDOWN);
    }, SWORD_TIME);
  });
}

const gameLoop = (room: Room) => {
  const game = runningGames[room];
  const delta = 1000 / 60;

  spawnEnemies(delta, room);
  updateEnemies(room);

  updatePlayers(room);

  Engine.update(game.engine, delta);

  io.to(room).emit('objects', {
    players: getPlayersInfos(room),
    enemies: runningGames[room].enemies.map(({ body, health }) => ({ position: body.position, health }))
  });
}
