import { Server, Socket } from "socket.io";
import { Body, Composite, Engine, Vector } from 'matter-js';

export type WithPassword<T> = T & { password: string };
export type WithId<T> = T & { id: number };

export type User = { email: string, username: string };
export type GameRoom = {
  name: string,
};

export type Chat = {
  username: string,
  message: string,
}

export type Players = { [key: string]: Player };
export type PlayerInfos = { [key: string]: Info<Player> };
interface ServerToClientEvents {
  chat: (message: Chat) => void,
  games: (games: GameRoom[]) => void,
  newAdmin: (username: string) => void,
  promoted: () => void,
  startGame: (objects: {
    players: PlayerInfos,
  }) => void,
  objects: (objects: {
    players: PlayerInfos
    enemies: EnemyInfo[],
  }) => void,
  users: (users: string[]) => void,
  gameOver: (ack: (response: 'restart' | 'leave') => void) => void,
  attack_end: () => void,
}

type Ack<T, E = { reason: string }> = (data: { result: T } | ({ result: 'error' } & E)) => void;

interface ClientToServerEvents {
  chat: (message: string) => void,
  createGame: (game: WithPassword<GameRoom> & { canEnterAfterStart: boolean }, ack: Ack<'created'>) => void,
  joinGame: (game: WithPassword<GameRoom>, ack: Ack<'joined' | 'started'>) => void,
  leaveGame: () => void,
  startGame: () => void,
  move: (movement: Vector) => void,
  attack: (ack: Ack<{ endTime: number }>) => void,
}

export type Room = 'lobby' | `game${string}`;

interface SocketData {
  user: WithId<User> & {
    room: Room,
    isCreator: boolean,
  },
  game: {
    playerWithSword: Composite,
    player: Player,
  }
}

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents, never, SocketData>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, never, SocketData>;

export type Direction = 'up' | 'down' | 'left' | 'right';

export type Info<T, U extends string = never> = Omit<T, 'body' | U> & { position: Vector };

export type Player = {
  body: Body,
  health: number,
  facing: Direction,
  invincible: boolean,
}

export type Enemy = {
  body: Body,
  targetPlayer?: Player,
  health: number,
}

export type EnemyInfo = Info<Enemy, 'targetPlayer'>;

export type Game = {
  engine: Engine,
  interval: ReturnType<typeof setInterval>,
  enemies: Enemy[],
  spawnTimer: number,
};
