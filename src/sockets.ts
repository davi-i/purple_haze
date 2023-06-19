import jwt from 'jsonwebtoken';
import { Games, GameServer } from './types';
import { Server } from 'socket.io';

let games: Games = new Map();

export const startSocketIo = (server: any) => {
  const io: GameServer = new Server(server);

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

    socket.on("createGame", ({ name, password }, ack) => {
      if (games.has(name)) {
        ack({ result: 'error', reason: 'game with this name already exists' });
      } else {
        if (socket.data.room) {
          socket.leave(socket.data.room);
        }
        socket.join('game' + name);
        socket.data.room = `game${name}`;

        games.set(name, password);

        io.to('lobby').emit('games', Array.from(games.keys()));

        ack({ result: 'created' });
      }
    });

    socket.on("joinGame", ({ name, password }, ack) => {
      if (!games.has(name)) {
        ack({ result: 'error', reason: 'game does not exist' });
      } else if (games.get(name) != password) {
        ack({ result: 'error', reason: 'wrong password' });
      } else {
        if (socket.data.room) {
          socket.leave(socket.data.room);
        }
        socket.join('game' + name);
        socket.data.room = `game${name}`;

        ack({ result: 'joined' });
      }
    });

    socket.on("leaveGame", () => {
      if (socket.data.room && socket.data.room != 'lobby') {
        socket.leave(socket.data.room);
      }
    })

    io.of('/').adapter.on("delete-room", (room: string) => {
      if (room.startsWith('game')) {
        games.delete(room.slice(4));
        io.to('lobby').emit('games', Array.from(games.keys()));
      }
    });
  });
}
