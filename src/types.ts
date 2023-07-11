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

export type Upgrade = 'maxHealth' | 'attack' | 'speed';

export type Shop = {
  [item in Upgrade]: number
};

export type Players = { [key: string]: Player };
export type PlayerInfos = { [key: string]: Info<Player> };

export type FromIds<T> = { [id: number]: T };

interface ServerToClientEvents {
  chat: (message: Chat) => void,
  games: (games: GameRoom[]) => void,
  newAdmin: (username: string) => void,
  promoted: () => void,
  startGame: () => void,
  objects: (objects: {
    players: PlayerInfos
    enemies: FromIds<EnemyInfo>,
    shoper?: Vector,
    mission?: Vector,
    coins: FromIds<Vector>,
  }) => void,
  users: (users: string[]) => void,
  gameOver: (ack: (response: 'restart' | 'leave') => void) => void,
  enemyHurt: (id: number) => void,
  enemyKilled: (id: number) => void,
  shop: (items: Shop, coins: number) => void,
  shopError: () => void,
  mission: (monsters: number, ack: (response: 'start' | 'cancel') => void) => void
  startLevel: () => void,
  endLevel: () => void,
  coinCollected: (id: number) => void,
}

type Ack<Result extends string, Ok = {}, Error = { reason: string }> = (data: { result: Result } & Ok | ({ result: 'error' } & Error)) => void;

export interface ClientToServerEvents {
  chat: (message: string) => void,
  createGame: (game: WithPassword<GameRoom> & { canEnterAfterStart: boolean }, ack: Ack<'created'>) => void,
  joinGame: (game: WithPassword<GameRoom>, ack: Ack<'joined' | 'started'>) => void,
  leaveGame: () => void,
  startGame: () => void,
  games: () => void
  move: (movement: Vector) => void,
  attack: () => void,
  shop: (response: Upgrade | 'cancel', ack: Ack<'bought', { items: Shop, coins: number }>) => void
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
  maxHealth: number,
  health: number,
  speed: number,
  attack: number,
  facing: Direction,
  invincible: boolean,
  endAttackTime?: number,
  gold: number,
  upgrades: {
    speed: number,
    maxHealth: number,
    attack: number,
  }
}

export type Enemy = {
  body: Body,
  targetPlayer?: Player,
  health: number,
  speed: number,
}

export type EnemyInfo = Info<Enemy, 'targetPlayer'>;

export type Game = {
  engine: Engine,
  interval: ReturnType<typeof setInterval>,
  enemies: Enemy[],
  shoper: Body,
  mission: Body,
  spawnTimer: number,
  level: number,
  levelRunning: boolean,
  enemiesSpawned: number,
};
