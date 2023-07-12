import { Body, Composite, Events, Pair, Sleeping } from "matter-js";
import { GameSocket, Room } from "../types";
import { runningGames, startLevel } from ".";
import { io } from "../socketIo";
import { GAME_BORDER, GOLD_PER_ENEMY, GOO_TIME, PLAYER_INVINCIBLE_TIME, enemies, itemsPrices } from "../constants";
import { getSockets } from "../rooms";

// Do something with a body if it collides with another body that has label
const onAnyCollisionWithLabel = (pair: Pair, label: string, func: (body: Body, collisor: Body) => void) => {
  if (pair.bodyA.label == label) {
    func(pair.bodyB, pair.bodyA);
  } else if (pair.bodyB.label == label) {
    func(pair.bodyA, pair.bodyB);
  }
}

// Do something with a body that has myLabel if it collides with another body that has label
const onCollisionWithLabel = (pair: Pair, label: string, myLabel: string, func: (body: Body, collisor: Body) => void) => {
  if (pair.bodyA.label == label && pair.bodyB.label == myLabel) {
    func(pair.bodyB, pair.bodyA);
  } else if (pair.bodyB.label == label && pair.bodyA.label == myLabel) {
    func(pair.bodyA, pair.bodyB);
  }
}

// Do something with a body that has myLabel if it collides with another body that has label
const onCollisionWithLabels = (pair: Pair, labels: string[], myLabel: string, func: (body: Body, collisor: Body) => void) => {
  if (labels.includes(pair.bodyA.label) && pair.bodyB.label == myLabel) {
    func(pair.bodyB, pair.bodyA);
  } else if (labels.includes(pair.bodyB.label) && pair.bodyA.label == myLabel) {
    func(pair.bodyA, pair.bodyB);
  }
}

// Do something with a player if it collides with another body that has label
const onPlayerCollisionWithLabel = (room: Room, pair: Pair, label: string, func: (socket: GameSocket, collisor: Body) => void) => {
  onCollisionWithLabel(pair, label, 'player', (body, collisor) => {
    const socket = getSockets(room)
      .find((socket) => socket.data.game && socket.data.game.player.body.id === body.id)!;
    func(socket, collisor);
  });
}

// Do something with a player if it collides with another body that has label
const onPlayerCollisionWithLabels = (room: Room, pair: Pair, labels: string[], func: (socket: GameSocket, collisor: Body) => void) => {
  onCollisionWithLabels(pair, labels, 'player', (body, collisor) => {
    const socket = getSockets(room)
      .find((socket) => socket.data.game && socket.data.game.player.body.id === body.id)!;
    func(socket, collisor);
  });
}

export const setupCollisions = (room: Room) => {
  const game = runningGames[room];
  Events.on(game.engine, 'collisionStart', (event) => {
    const pairs = event.pairs;

    for (var i = 0; i < pairs.length; i++) {
      const pair = pairs[i];

      onCollisionWithLabel(pair, 'sword', 'enemy', (body) => {
        const enemy = game.enemies.find((enemy) => enemy.body.id === body.id)!;
        enemy.health -= 1;
        io.to(room).emit("enemyHurt", enemy.body.id);
      });
      onCollisionWithLabel(pair, 'sword', 'boss', () => {
        game.boss!.health -= 1;
        io.to(room).emit("bossHurt");
      });
      onPlayerCollisionWithLabels(room, pair, ['enemy', 'boss'], (socket) => {
        const player = socket.data.game!.player;
        if (!player.invincible) {
          player.health -= 1;
          player.invincible = true;
          setTimeout(() => {
            player.invincible = false;
          }, PLAYER_INVINCIBLE_TIME);
        }
      });
      onPlayerCollisionWithLabel(room, pair, 'shoper', (socket) => {
        const player = socket.data.game!.player;
        const items = itemsPrices(player.upgrades);
        socket.emit("shop", items, player.gold)
      });
      onPlayerCollisionWithLabel(room, pair, 'mission', (socket) => {
        socket.emit('mission', enemies(game.level), (response) => {
          if (response == "start") {
            console.log("start level");
            startLevel(room);
          }
        });
      });
      onPlayerCollisionWithLabel(room, pair, 'coin', (socket, coin) => {
        const player = socket.data.game!.player;
        player.gold += GOLD_PER_ENEMY;
        Composite.remove(game.engine.world, coin);
        io.to(room).emit("coinCollected", coin.id);
      });
      onPlayerCollisionWithLabel(room, pair, 'goo', (socket, goo) => {
        const gameData = socket.data.game!;
        const sword = Composite.allBodies(gameData.playerWithSword)
          .find((body) => body.label == 'sword');
        if (sword) {
          Composite.remove(gameData.playerWithSword, sword);
        }
        Sleeping.set(gameData.player.body, true);
        gameData.player.stuckTimeout = setTimeout(() => {
          Sleeping.set(gameData.player.body, false);
          gameData.player.stuckTimeout = undefined;
          gameData.player.health -= 2;
        }, GOO_TIME);
        Composite.remove(game.engine.world, goo);
        io.to(room).emit("gooDestroyed", goo.id);
      });
      onPlayerCollisionWithLabel(room, pair, 'sword', (socket) => {
        const game = socket.data.game!;
        Sleeping.set(game.player.body, false);
        if (game.player.stuckTimeout) {
          clearTimeout(game.player.stuckTimeout);
        }
        game.player.stuckTimeout = undefined;
      });
    }
  });

  Events.on(game.engine, "collisionActive", (event) => {
    const pairs = event.pairs;

    for (var i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      onAnyCollisionWithLabel(pair, "boundary", (body) => {
        const sizeX = body.bounds.max.x - body.bounds.min.x;
        const sizeY = body.bounds.max.y - body.bounds.min.y;
        Body.setPosition(body, {
          x: Math.min(Math.max(body.position.x, GAME_BORDER.minX + sizeX / 2 - 0.5), GAME_BORDER.maxX - sizeX / 2 + 0.5),
          y: Math.min(Math.max(body.position.y, GAME_BORDER.minY + sizeY / 2 - 0.5), GAME_BORDER.maxY - sizeY / 2 + 0.5),
        });
      });
    }
  });
}
