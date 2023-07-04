import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { getGames, setupRooms, setupRoomsForServer } from './rooms';
import { GameServer } from './types';
import { server } from './server';
import { setupGame } from './game';

export let io: GameServer;

export const startSocketIo = () => {
  io = new Server(server);
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
      socket.data.user = {
        ...user,
        room: 'lobby',
        isCreator: false,
      };
      next();
    });
  });

  io.on("connection", async (socket) => {
    console.log("user", socket.data.user?.username, "connected");

    socket.join('lobby');
    socket.emit('games', await getGames());

    socket.on("chat", (message) => {
      if (socket.data.user) {
        io.to(socket.data.user.room).emit("chat", {
          username: socket.data.user.username,
          message,
        });
      }
    });

    setupRooms(socket);
    setupGame(socket);
  });

  setupRoomsForServer();
}
