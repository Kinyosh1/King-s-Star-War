import { GameTranslations } from './types';

export const GAME_WIDTH = 1000;
export const GAME_HEIGHT = 700;

export const INITIAL_CITIES = 6;
export const TURRET_CONFIGS = [
  { id: 0, x: 100, maxAmmo: 20 },
  { id: 1, x: 500, maxAmmo: 40 },
  { id: 2, x: 900, maxAmmo: 20 },
];

export const EXPLOSION_MAX_RADIUS = 70;
export const ENEMY_EXPLOSION_RADIUS = 90; // 3x of original base (30 * 3)
export const EXPLOSION_GROWTH_SPEED = 2.5;
export const MISSILE_SPEED = 10;
export const SUPER_MISSILE_SPEED_MULT = 3;
export const SUPER_MISSILE_RADIUS_MULT = 5;
export const ROCKET_BASE_SPEED = 1.5;
export const ROCKET_MAX_SPEED = 3.5;
export const SPAWN_RATE_MIN = 200; // ms
export const SPAWN_RATE_START = 1000; // ms

export const WIN_SCORE = 1000;

export const TRANSLATIONS: Record<'en' | 'cn', GameTranslations> = {
  en: {
    title: "King's Star War",
    start: "INITIATE DEFENSE",
    victory: "GALAXY SAVED!",
    defeat: "SYSTEM COLLAPSE",
    playAgain: "REBOOT SYSTEM",
    score: "SCORE",
    ammo: "AMMO",
    level: "WAVE",
    classicMode: "CLASSIC",
    endlessMode: "ENDLESS",
    instructions: "1. Click to launch interceptors.\n2. Aim ahead of the targets.\n3. Explosions destroy nearby rockets.\n4. Protect the 6 cities and 3 bases.\n5. Score 1000 to win (Classic) or survive as long as possible (Endless)!\n\nPOWER-UPS (Endless Mode Only - Hit to collect):\n❤️ Health: Heal/Revive turret or city.\n🛡️ Shield: Protect turret from 1 hit.\n🔋 Ammo: +10 ammo to all bases.\n⚡ Super: 5x Explosion & 3x Speed.",
  },
  cn: {
    title: "King的星际战争",
    start: "启动防御系统",
    victory: "银河系已拯救！",
    defeat: "防御系统崩溃",
    playAgain: "重启系统",
    score: "得分",
    ammo: "弹药",
    level: "波次",
    classicMode: "经典模式",
    endlessMode: "无尽模式",
    instructions: "1. 点击屏幕发射拦截导弹。\n2. 预判敌方轨迹进行提前瞄准。\n3. 爆炸产生的范围伤害可摧毁火箭。\n4. 保护底部的6座城市和3个基地。\n5. 经典模式1000分获胜，无尽模式挑战极限！\n\n道具系统 (仅限无尽模式 - 击中获取):\n❤️ 医疗: 恢复/复活炮塔或城市。\n🛡️ 护盾: 蓝色护盾抵御一次攻击。\n🔋 弹药: 所有炮塔弹药+10。\n⚡ 强化: 5倍爆炸范围 & 3倍飞行速度。",
  }
};
