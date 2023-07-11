import { Composite } from "matter-js";
import { db } from "./database";
import { getPlayersInfos, runningGames, spawnPlayer } from "./game";
import { io } from "./socketIo";
import { GameRoom, GameSocket, Room } from "./types";
import { sanatizeString } from "./utils";

export const getGames = async (): Promise<GameRoom[]> => {
  return await db.manyOrNone(
    "SELECT name FROM games"
  );
}

const emitGamesAndUsers = async () => {
  const games = await getGames();
  for (const game of games) {
    const room: Room = `game${game.name}`;
    const users = getSockets(room).map((socket) => socket.data.user!.username);
    io.to(room).emit('users', users);
  }
  io.to('lobby').emit('games', games);
}


export const setupRooms = (socket: GameSocket) => {
  socket.on("createGame", async ({ name, password, canEnterAfterStart }, ack) => {
    name = sanatizeString(name);
    password = sanatizeString(password);
    const game = await db.oneOrNone("SELECT * FROM games WHERE name = $1", [name]);
    if (game) {
      ack({ result: 'error', reason: 'game with this name already exists' });
    } else {
      const user = socket.data.user!;
      socket.leave(user.room);
      socket.join('game' + name);
      user.isCreator = true;

      await db.none(
        'INSERT INTO games(name, password, can_enter_during_game) VALUES($1, $2, $3)',
        [name, password, canEnterAfterStart]
      );

      ack({ result: 'created' });
    }
  });

  socket.on("joinGame", async ({ name, password }, ack) => {
    name = sanatizeString(name);
    password = sanatizeString(password);
    const game = await db.oneOrNone("SELECT * FROM games WHERE name = $1", [name]);
    if (!game) {
      ack({ result: 'error', reason: 'game does not exist' });
    } else if (game.status == 'ended') {
      ack({ result: 'error', reason: 'this game has ended' });
    } else if (game.status === 'started' && !game.can_enter_during_game) {
      ack({ result: 'error', reason: 'this game has already started' });
    } else if (game.password != password) {
      ack({ result: 'error', reason: 'wrong password' });
    } else {
      socket.leave(socket.data.user!.room);
      const room: `game${string}` = `game${name}`;
      socket.join(room);

      if (game.status == 'started') {
        spawnPlayer(socket);
        socket.emit('startGame', { players: getPlayersInfos(room) });
        ack({ result: 'started' });
      } else {
        ack({ result: 'joined' });
      }
    }
  });

  socket.on("leaveGame", () => {
    const user = socket.data.user!;
    if (user.room != 'lobby') {
      socket.leave(user.room);
    }
    user.isCreator = false;
  });
}

export const setupRoomsForServer = () => {

  io.of('/').adapter.on("join-room", (room: Room, id: string) => {
    const socket = io.of('/').sockets.get(id)!;
    console.log(socket.data.user?.username, "joined room", room);
    socket.data.user!.room = room;
  });

  io.of('/').adapter.on("leave-room", async (room: string, id: string) => {
    const socket = io.of('/').sockets.get(id)!;
    console.log(socket.data.user?.username, "left room", room);
    if (room.startsWith('game')) {
      socket.join('lobby');
      if (socket.data.game && runningGames.hasOwnProperty(room)) {
        Composite.remove(runningGames[room].engine.world, socket.data.game.playerWithSword);
      }
      if (!socket.data.user?.isCreator) {
        return;
      }
      const ids = io.of('/').adapter.rooms.get(room)?.keys();
      let next = ids?.next();
      if (next && !next.done) {
        const sid = next.value;
        const socket = io.of('/').sockets.get(sid)!;
        const user = socket.data.user!;
        user.isCreator = true;
        socket.emit('promoted');
        socket.broadcast.to(room).emit('newAdmin', user.username);
      }
    }
  });

  io.of('/').adapter.on("delete-room", async (room: string) => {
    console.log("deleted room", room);
    if (room.startsWith('game')) {
      await db.none('DELETE FROM games WHERE name = $1', [room.slice(4)]);
      if (runningGames.hasOwnProperty(room)) {
        clearInterval(runningGames[room].interval);
        delete runningGames[room];
      }
    }
  });

  setInterval(emitGamesAndUsers, 3000);
}

export const getSockets = (room: Room): GameSocket[] => {
  return Array.from(io.of('/').adapter.rooms.get(room) || [])
    .map((id) => io.of('/').sockets.get(id))
    .filter((socket) => socket)
    .map((socket) => socket!)
}
