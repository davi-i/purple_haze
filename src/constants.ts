import { Upgrade } from "./types";

export const GAME_BORDER = {
  minX: -9,
  maxX: 9,
  minY: -5,
  maxY: 27,
}
export const BOUNDARY_CATEGORY = 0x0004;

export const PLAYER_SIZE = {
  width: 1,
  height: 1,
}
export const PLAYER_INITIAL = {
  maxHealth: 3,
  speed: 0.03,
  attack: 1,
}
export const PLAYER_UPGRADES = {
  maxHealth: 1,
  speed: 0.015,
  attack: 0.2,
}

export const itemsPrices = (upgrades: { [item in Upgrade]: number }) => {
  return {
    maxHealth: INITIAL_PRICES.maxHealth + PRICE_INCREASE * upgrades.maxHealth,
    speed: INITIAL_PRICES.speed + PRICE_INCREASE * upgrades.speed,
    attack: INITIAL_PRICES.attack + PRICE_INCREASE * upgrades.attack,
  };
}

export const PLAYER_CATEGORY = 0x0001;
export const PLAYER_SPAWN_AREA = {
  minX: -2,
  maxX: 2,
  minY: -2,
  maxY: 2,
}
export const PLAYER_INVINCIBLE_TIME = 3000 // ms

export const ENEMY_SIZE = {
  width: 1,
  height: 1,
}
export const ENEMY_CATEGORY = 0x0002;
export const ENEMY_SPAWN_GAP = 3;
export const ENEMY_SPAWN_INTERVAL = 2000; // ms
export const INITIAL_ENEMY_HEALTH = 3;
export const enemyHealth = (level: number) => {
  if (level == TOTAL_LEVELS) {
    return INITIAL_ENEMY_HEALTH;
  }
  return INITIAL_ENEMY_HEALTH + 1 * level;
}
export const INITIAL_ENEMY_SPEED = 0.02;
export const enemySpeed = (level: number) => {
  if (level == TOTAL_LEVELS) {
    return INITIAL_ENEMY_SPEED;
  }
  return INITIAL_ENEMY_SPEED + 0.01 * level;
}
export const INITIAL_MAX_ENEMIES = 5;
export const maxEnemies = (level: number) => {
  if (level == TOTAL_LEVELS) {
    return Infinity;
  }
  return INITIAL_MAX_ENEMIES + 1 * level;
}
export const INITIAL_ENEMIES = 10;
export const enemies = (level: number) => {
  if (level == TOTAL_LEVELS) {
    return 3;
  }
  return INITIAL_ENEMIES + 2 * level;
}

export const SWORD_DELAY = 80; // ms
export const SWORD_TIME = 300 // ms
export const SWORD_COOLDOWN = 400; // ms
export const SWORD_LENGHT = 1;
export const SWORD_RANGE = 2 * PLAYER_SIZE.height;
export const SWORD_CATEGORY = 0x0020;

export const SHOP_POSITION = {
  x: 5,
  y: 10,
}

export const MISSION_POSITION = {
  x: -5,
  y: 10,
}

export const CIVILIAN_CATEGORY = 0x0008;

export const INITIAL_PRICES = {
  maxHealth: 5,
  attack: 5,
  speed: 5,
};

export const PRICE_INCREASE = 2;

export const COIN_SIZE = {
  width: 0.3,
  height: 0.3,
};
export const GOLD_PER_ENEMY = 1;

export const TOTAL_LEVELS = 2;

export const BOSS_RADIUS = 2;
export const BOSS_HEALTH = 30;
export const BOSS_SPEED = 0.01;
export const BOSS_GOO_ATTACK_POS = { x: 0, y: 20 };

export const GOO_CATEGORY = 0x0010;
export const GOO_SPAWN_INTERVAL = 4000; //ms
export const GOO_SPEED = 0.08;
export const GOO_TIME = 5000; // ns
