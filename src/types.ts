import { Server } from "socket.io";

export type WithPassword<T> = T & { password: string };
export type WithId<T> = T & { id: number };

export type User = { email: string, username: string };
export type Game = {
  name: string,
};

export type Chat = {
  username: string,
  message: string,
}

interface ServerToClientEvents {
  chat: (message: Chat) => void,
  games: (games: Game[]) => void,
  newAdmin: (username: string) => void,
  promoted: () => void,
}

interface GameRoom {
  name: string,
  password: string,
}

type AckData<T, E = { reason: string }> = { result: T } | ({ result: 'error' } & E);

interface ClientToServerEvents {
  chat: (message: string) => void,
  createGame: (game: GameRoom, ack: (data: AckData<'created'>) => void) => void,
  joinGame: (game: GameRoom, ack: (data: AckData<'joined'>) => void) => void,
  leaveGame: () => void,
}

export type Room = 'lobby' | `game${string}`;

interface SocketData {
  room: Room,
  user: WithId<User>,
  isCreator: boolean,
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
