import { Bodies, Body, Common, Composite, Vector } from "matter-js";
import { runningGames } from ".";
import { BOUNDARY_CATEGORY, CIVILIAN_CATEGORY, ENEMY_CATEGORY, GOO_CATEGORY, PLAYER_CATEGORY, PLAYER_INITIAL, PLAYER_INVINCIBLE_TIME, PLAYER_SIZE, PLAYER_SPAWN_AREA, SWORD_LENGHT } from "../constants";
import { GameSocket, Player, PlayerInfos, Room } from "../types";
import { getSockets } from "../rooms";

export const spawnPlayer = (socket: GameSocket) => {
  const room = socket.data.user!.room;
  if (!runningGames.hasOwnProperty(room)) {
    throw new Error('Cannot spawn player yet');
  }
  const x = Common.random(PLAYER_SPAWN_AREA.minX, PLAYER_SPAWN_AREA.maxX);
  const y = Common.random(PLAYER_SPAWN_AREA.minY, PLAYER_SPAWN_AREA.maxY);
  const body = Bodies.rectangle(x, y, PLAYER_SIZE.width, PLAYER_SIZE.height, {
    slop: 0.0001,
    collisionFilter: {
      category: PLAYER_CATEGORY,
      mask: BOUNDARY_CATEGORY | CIVILIAN_CATEGORY | ENEMY_CATEGORY | GOO_CATEGORY,
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

export const updatePlayers = (room: Room) => {
  for (const socket of getSockets(room)) {
    const game = socket.data.game;
    if (!game) {
      continue;
    }
    const sword = game.playerWithSword.bodies.find((body) => body.label == 'sword');
    if (sword) {
      if (game.player.facing == 'up') {
        Body.setPosition(sword, Vector.sub(game.player.body.position, {
          x: 0,
          y: PLAYER_SIZE.height / 2 + 2 * SWORD_LENGHT / 3
        }));
        Body.setAngle(sword, 0);
      } else if (game.player.facing == 'down') {
        Body.setPosition(sword, Vector.add(game.player.body.position, {
          x: 0,
          y: PLAYER_SIZE.height / 2 + 2 * SWORD_LENGHT / 3
        }));
        Body.setAngle(sword, Math.PI);
      } else if (game.player.facing == 'left') {
        Body.setPosition(sword, Vector.sub(game.player.body.position, {
          x: PLAYER_SIZE.width / 2 + 2 * SWORD_LENGHT / 3,
          y: 0
        }));
        Body.setAngle(sword, 3 * Math.PI / 2);
      } else {
        Body.setPosition(sword, Vector.add(game.player.body.position, {
          x: PLAYER_SIZE.width / 2 + 2 * SWORD_LENGHT / 3,
          y: 0,
        }));
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
      ([username, { body, stuckTimeout, ...player }]) => [username, {
        position: body.position,
        stuck: !!stuckTimeout,
        ...player,
      }]
    )
  )
}
