export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
  ROUND_END = 'ROUND_END'
}

export enum GameMode {
  CLASSIC = 'CLASSIC',
  ENDLESS = 'ENDLESS'
}

export enum PowerUpType {
  HEALTH = 'HEALTH',
  SHIELD = 'SHIELD',
  AMMO = 'AMMO',
  SUPER_MISSILE = 'SUPER_MISSILE'
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  x: number;
  y: number;
  timer: number;
  collected: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rocket {
  id: string;
  start: Point;
  end: Point;
  current: Point;
  speed: number;
  destroyed: boolean;
}

export interface Missile {
  id: string;
  start: Point;
  target: Point;
  current: Point;
  speed: number;
  exploded: boolean;
  turretIndex: number;
  isSuper?: boolean;
}

export interface Explosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  growing: boolean;
  done: boolean;
}

export interface City {
  id: number;
  x: number;
  y: number;
  destroyed: boolean;
}

export interface Turret {
  id: number;
  x: number;
  y: number;
  ammo: number;
  maxAmmo: number;
  health: number;
  maxHealth: number;
  destroyed: boolean;
  hasShield: boolean;
}

export interface GameTranslations {
  title: string;
  start: string;
  victory: string;
  defeat: string;
  playAgain: string;
  score: string;
  ammo: string;
  level: string;
  instructions: string;
  classicMode: string;
  endlessMode: string;
}
