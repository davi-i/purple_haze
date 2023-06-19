import { Server } from "socket.io";

export type User = { username: string, iat: number };

type Game = string;
export type Games = Map<string, Game>;

interface ServerToClientEvents {
  chat: (message: string) => void,
  games: (games: string[]) => void,
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

interface SocketData {
  room: 'lobby' | `game${string}`,
  user: User,
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
