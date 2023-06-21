import jwt from 'jsonwebtoken';
import { Game, GameServer, Room } from './types';
import { Server } from 'socket.io';
import { db } from './database';

export const startSocketIo = (server: any) => {
  const io: GameServer = new Server(server);

  const emitGames = async () => {
    const games: Game[] = await db.manyOrNone(
      "SELECT name FROM games"
    );
    io.to('lobby').emit('games', games);
  }

  io.use((socket, next) => {
    console.log('Trying to connect');
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY || '', (err: any, user: any) => {
      if (err) {
        return next(new Error('Authentication error'));
      }
      socket.data.user = user;
      next();
    });
  });

  io.on("connection", (socket) => {
    console.log("user", socket.data.user?.username, "connected");

    socket.data.room = 'lobby';
    socket.join('lobby');

    socket.on("chat", (message) => {
      if (socket.data.room) {
        io.to(socket.data.room).emit("chat", message);
      }
    });

    socket.on("createGame", async ({ name, password }, ack) => {
      const game = await db.oneOrNone("SELECT * FROM games WHERE name = $1", [name]);
      if (game) {
        ack({ result: 'error', reason: 'game with this name already exists' });
      } else {
        if (socket.data.room) {
          socket.leave(socket.data.room);
        }
        socket.join('game' + name);
        socket.data.isCreator = true;

        await db.none(
          'INSERT INTO games(name, password, creator_id) VALUES($1, $2, $3)',
          [name, password, socket.data.user?.id]
        );
        emitGames();

        ack({ result: 'created' });
      }
    });

    socket.on("joinGame", async ({ name, password }, ack) => {
      const game = await db.oneOrNone("SELECT * FROM games WHERE name = $1", [name]);
      if (!game) {
        ack({ result: 'error', reason: 'game does not exist' });
      } else if (game.password != password) {
        ack({ result: 'error', reason: 'wrong password' });
      } else {
        if (socket.data.room) {
          socket.leave(socket.data.room);
        }
        socket.join('game' + name);

        emitGames();

        ack({ result: 'joined' });
      }
    });

    socket.on("leaveGame", () => {
      if (socket.data.room && socket.data.room != 'lobby') {
        socket.leave(socket.data.room);
      }
      socket.data.isCreator = false;
    });

  });

  io.of('/').adapter.on("join-room", (room: Room, id: string) => {
    const socket = io.of('/').sockets.get(id)!;
    console.log(socket.data.user?.username, "joined room", room);
    socket.data.room = room;
  });


  io.of('/').adapter.on("leave-room", async (room: string, id: string) => {
    const socket = io.of('/').sockets.get(id)!;
    console.log(socket.data.user?.username, "left room", room);
    if (room.startsWith('game')) {
      socket.join('lobby');
      if (!socket.data.isCreator) {
        return;
      }
      const ids = io.of('/').adapter.rooms.get(room)?.keys();
      let next = ids?.next();
      if (next && !next.done) {
        const sid = next.value;
        const socket = io.of('/').sockets.get(sid)!;
        socket.data.isCreator = true;
        const user = socket.data.user!;
        await db.none(
          "UPDATE games SET creator_id = $1 WHERE name = $2",
          [user.id, room.slice(4)]
        );
        socket.emit('promoted');
        socket.broadcast.to(room).emit('newAdmin', user.username);
      }
    }
  });

  io.of('/').adapter.on("delete-room", async (room: string) => {
    console.log("deleted room", room);
    if (room.startsWith('game')) {
      await db.none('DELETE FROM games WHERE name = $1', [room.slice(4)]);
      emitGames();
    }
  });
}
