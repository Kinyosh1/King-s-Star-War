/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Zap, Trophy, RefreshCw, Languages, Info, Rocket as RocketIcon } from 'lucide-react';
import { 
  GameState, 
  GameMode,
  PowerUpType,
  Point, 
  Rocket, 
  Missile, 
  Explosion, 
  City, 
  Turret,
  PowerUp
} from './types';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  INITIAL_CITIES, 
  TURRET_CONFIGS, 
  EXPLOSION_MAX_RADIUS, 
  ENEMY_EXPLOSION_RADIUS,
  EXPLOSION_GROWTH_SPEED, 
  MISSILE_SPEED, 
  SUPER_MISSILE_SPEED_MULT,
  SUPER_MISSILE_RADIUS_MULT,
  ROCKET_BASE_SPEED, 
  ROCKET_MAX_SPEED,
  SPAWN_RATE_MIN,
  SPAWN_RATE_START,
  WIN_SCORE, 
  TRANSLATIONS 
} from './constants';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.CLASSIC);
  const [score, setScore] = useState(0);
  const [displayTime, setDisplayTime] = useState(0); // Only for UI
  const [lang, setLang] = useState<'en' | 'cn'>('cn');
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Game Objects Refs - These don't trigger re-renders
  const rocketsRef = useRef<Rocket[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const citiesRef = useRef<City[]>([]);
  const turretsRef = useRef<Turret[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  
  const requestRef = useRef<number>();
  const startTimeRef = useRef<number>(0);
  const gameTimeRef = useRef<number>(0);
  const lastPowerUpScoreRef = useRef<number>(0);
  const superMissileTimerRef = useRef<number>(0);
  const t = TRANSLATIONS[lang];

  // Stars for background
  const stars = useRef(Array.from({ length: 100 }).map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 1,
    duration: Math.random() * 3 + 2
  })));

  // Initialize Game
  const initGame = useCallback((mode: GameMode = GameMode.CLASSIC) => {
    const groundY = GAME_HEIGHT - 40;
    setGameMode(mode);
    
    // Setup Cities
    const cities: City[] = [];
    const cityPositions = [200, 300, 400, 600, 700, 800];
    cityPositions.forEach((x, i) => {
      cities.push({ id: i, x, y: groundY, destroyed: false });
    });
    citiesRef.current = cities;

    // Setup Turrets
    turretsRef.current = TURRET_CONFIGS.map(config => ({
      ...config,
      y: groundY,
      ammo: config.maxAmmo,
      health: 3,
      maxHealth: 3,
      destroyed: false,
      hasShield: false
    }));

    rocketsRef.current = [];
    missilesRef.current = [];
    explosionsRef.current = [];
    powerUpsRef.current = [];
    setScore(0);
    setDisplayTime(0);
    gameTimeRef.current = 0;
    lastPowerUpScoreRef.current = 0;
    superMissileTimerRef.current = 0;
    startTimeRef.current = Date.now();
    setGameState(GameState.PLAYING);
  }, []);

  const spawnRocket = useCallback(() => {
    // We use gameTimeRef instead of state to avoid dependency issues
    const startX = Math.random() * GAME_WIDTH;
    const targets = [...citiesRef.current.filter(c => !c.destroyed), ...turretsRef.current.filter(t => !t.destroyed)];
    
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    const id = Math.random().toString(36).substr(2, 9);
    
    const timeFactor = Math.min(gameTimeRef.current / 60, 1);
    const speed = ROCKET_BASE_SPEED + (timeFactor * (ROCKET_MAX_SPEED - ROCKET_BASE_SPEED));

    rocketsRef.current.push({
      id,
      start: { x: startX, y: 0 },
      end: { x: target.x, y: target.y },
      current: { x: startX, y: 0 },
      speed: speed,
      destroyed: false
    });
  }, []);

  const spawnPowerUp = useCallback(() => {
    const types = [
      PowerUpType.HEALTH, 
      PowerUpType.SHIELD, 
      PowerUpType.AMMO, 
      PowerUpType.AMMO, // Higher probability for ammo
      PowerUpType.SUPER_MISSILE
    ];
    const type = types[Math.floor(Math.random() * types.length)];
    const speed = ROCKET_MAX_SPEED * 1.5;
    
    powerUpsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: -50,
      y: 50 + Math.random() * 150,
      speed,
      collected: false
    });
  }, []);

  const applyPowerUp = useCallback((type: PowerUpType) => {
    switch (type) {
      case PowerUpType.HEALTH: {
        // Heal/Revive Turret
        const turrets = turretsRef.current;
        const targetTurret = turrets.find(t => t.health < t.maxHealth);
        if (targetTurret) {
          if (targetTurret.destroyed) {
            targetTurret.destroyed = false;
            targetTurret.health = 1;
          } else {
            targetTurret.health = Math.min(targetTurret.maxHealth, targetTurret.health + 1);
          }
        } else {
          // Heal/Revive City
          const cities = citiesRef.current;
          const targetCity = cities.find(c => c.destroyed);
          if (targetCity) {
            targetCity.destroyed = false;
          }
        }
        break;
      }
      case PowerUpType.SHIELD: {
        const turrets = turretsRef.current.filter(t => !t.destroyed && !t.hasShield);
        if (turrets.length > 0) {
          const randomTurret = turrets[Math.floor(Math.random() * turrets.length)];
          randomTurret.hasShield = true;
        }
        break;
      }
      case PowerUpType.AMMO: {
        turretsRef.current.forEach(t => {
          if (!t.destroyed) {
            t.ammo = Math.min(t.maxAmmo, t.ammo + 10);
          }
        });
        break;
      }
      case PowerUpType.SUPER_MISSILE: {
        superMissileTimerRef.current = 10; // 10 seconds of super missiles
        break;
      }
    }
  }, []);

  // Game Loop
  const animate = useCallback(() => {
    if (gameState !== GameState.PLAYING) {
      requestRef.current = requestAnimationFrame(animate);
      return;
    }

    // Update game time ref
    const now = Date.now();
    const deltaTime = (now - (startTimeRef.current + gameTimeRef.current * 1000)) / 1000;
    gameTimeRef.current = (now - startTimeRef.current) / 1000;
    
    if (superMissileTimerRef.current > 0) {
      superMissileTimerRef.current -= deltaTime;
    }

    // Check for power-up spawn
    const threshold = gameMode === GameMode.CLASSIC ? 200 : 100;
    if (score >= lastPowerUpScoreRef.current + threshold) {
      lastPowerUpScoreRef.current = Math.floor(score / threshold) * threshold;
      spawnPowerUp();
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    // Clear Canvas
    ctx.fillStyle = 'rgba(5, 5, 5, 1)';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Update & Draw Rockets
    rocketsRef.current.forEach((rocket) => {
      const dx = rocket.end.x - rocket.start.x;
      const dy = rocket.end.y - rocket.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * rocket.speed;
      const vy = (dy / dist) * rocket.speed;

      rocket.current.x += vx;
      rocket.current.y += vy;

      ctx.beginPath();
      ctx.moveTo(rocket.start.x, rocket.start.y);
      ctx.lineTo(rocket.current.x, rocket.current.y);
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(rocket.current.x, rocket.current.y, 3, 0, Math.PI * 2);
      ctx.fill();

      if (rocket.current.y >= rocket.end.y) {
        rocket.destroyed = true;
        explosionsRef.current.push({
          id: Math.random().toString(),
          x: rocket.current.x,
          y: rocket.current.y,
          radius: 0,
          maxRadius: ENEMY_EXPLOSION_RADIUS,
          growing: true,
          done: false
        });

        citiesRef.current.forEach(city => {
          if (!city.destroyed && Math.abs(city.x - rocket.current.x) < 30) {
            city.destroyed = true;
          }
        });
        turretsRef.current.forEach(turret => {
          if (!turret.destroyed && Math.abs(turret.x - rocket.current.x) < 30) {
            if (turret.hasShield) {
              turret.hasShield = false;
            } else {
              turret.health--;
              if (turret.health <= 0) {
                turret.destroyed = true;
              }
            }
          }
        });
      }
    });
    rocketsRef.current = rocketsRef.current.filter(r => !r.destroyed);

    // Update & Draw Missiles
    missilesRef.current.forEach((missile) => {
      const dx = missile.target.x - missile.start.x;
      const dy = missile.target.y - missile.start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vx = (dx / dist) * missile.speed;
      const vy = (dy / dist) * missile.speed;

      missile.current.x += vx;
      missile.current.y += vy;

      ctx.beginPath();
      ctx.moveTo(missile.start.x, missile.start.y);
      ctx.lineTo(missile.current.x, missile.current.y);
      ctx.strokeStyle = 'rgba(100, 220, 255, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(missile.target.x - 6, missile.target.y - 6);
      ctx.lineTo(missile.target.x + 6, missile.target.y + 6);
      ctx.moveTo(missile.target.x + 6, missile.target.y - 6);
      ctx.lineTo(missile.target.x - 6, missile.target.y + 6);
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#00f2ff';
      ctx.beginPath();
      ctx.arc(missile.current.x, missile.current.y, 4, 0, Math.PI * 2);
      ctx.fill();

      const distToTarget = Math.sqrt(
        Math.pow(missile.target.x - missile.current.x, 2) + 
        Math.pow(missile.target.y - missile.current.y, 2)
      );

      if (distToTarget < missile.speed) {
        missile.exploded = true;
        const radius = missile.isSuper ? EXPLOSION_MAX_RADIUS * SUPER_MISSILE_RADIUS_MULT : EXPLOSION_MAX_RADIUS;
        explosionsRef.current.push({
          id: Math.random().toString(),
          x: missile.target.x,
          y: missile.target.y,
          radius: 0,
          maxRadius: radius,
          growing: true,
          done: false
        });
      }
    });
    missilesRef.current = missilesRef.current.filter(m => !m.exploded);

    // Update & Draw Power-Ups
    powerUpsRef.current.forEach(pu => {
      pu.x += pu.speed;
      
      // Draw Power-Up
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = pu.type === PowerUpType.HEALTH ? '#ef4444' : pu.type === PowerUpType.SHIELD ? '#3b82f6' : pu.type === PowerUpType.AMMO ? '#10b981' : '#f59e0b';
      
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = pu.type === PowerUpType.HEALTH ? '❤️' : pu.type === PowerUpType.SHIELD ? '🛡️' : pu.type === PowerUpType.AMMO ? '🔋' : '⚡';
      ctx.fillText(icon, pu.x, pu.y);
      ctx.restore();

      if (pu.x > GAME_WIDTH + 50) pu.collected = true;
    });
    powerUpsRef.current = powerUpsRef.current.filter(pu => !pu.collected);

    // Update & Draw Explosions
    explosionsRef.current.forEach(exp => {
      if (exp.growing) {
        exp.radius += EXPLOSION_GROWTH_SPEED;
        if (exp.radius >= exp.maxRadius) exp.growing = false;
      } else {
        exp.radius -= EXPLOSION_GROWTH_SPEED * 0.4;
        if (exp.radius <= 0) exp.done = true;
      }

      const drawRadius = Math.max(0.1, exp.radius);
      const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, drawRadius);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.3, '#00f2ff');
      gradient.addColorStop(0.6, 'rgba(0, 100, 255, 0.5)');
      gradient.addColorStop(1, 'rgba(0, 0, 50, 0)');
      
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, drawRadius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      rocketsRef.current.forEach(rocket => {
        const dist = Math.sqrt(
          Math.pow(rocket.current.x - exp.x, 2) + 
          Math.pow(rocket.current.y - exp.y, 2)
        );
        if (dist < exp.radius) {
          rocket.destroyed = true;
          explosionsRef.current.push({
            id: Math.random().toString(),
            x: rocket.current.x,
            y: rocket.current.y,
            radius: 0,
            maxRadius: ENEMY_EXPLOSION_RADIUS,
            growing: true,
            done: false
          });

          setScore(s => {
            const newScore = s + 20;
            if (gameMode === GameMode.CLASSIC && newScore >= WIN_SCORE) setGameState(GameState.WON);
            return newScore;
          });
        }
      });

      // Power-up collision with explosions
      powerUpsRef.current.forEach(pu => {
        const dist = Math.sqrt(Math.pow(pu.x - exp.x, 2) + Math.pow(pu.y - exp.y, 2));
        if (dist < exp.radius) {
          pu.collected = true;
          applyPowerUp(pu.type);
        }
      });
    });
    explosionsRef.current = explosionsRef.current.filter(e => !e.done);

    // Draw Ground
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 40);
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 1);

    // Draw Cities
    citiesRef.current.forEach(city => {
      if (!city.destroyed) {
        ctx.fillStyle = '#3b82f6';
        ctx.fillRect(city.x - 18, city.y - 20, 36, 20);
        ctx.fillStyle = '#60a5fa';
        ctx.fillRect(city.x - 10, city.y - 25, 20, 10);
        ctx.fillStyle = '#fbbf24';
        for(let i=0; i<3; i++) {
          for(let j=0; j<2; j++) {
            ctx.fillRect(city.x - 14 + i*10, city.y - 16 + j*6, 4, 4);
          }
        }
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(city.x, city.y, 15, Math.PI, 0);
        ctx.fill();
      }
    });

    // Draw Turrets
    turretsRef.current.forEach(turret => {
      if (!turret.destroyed) {
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 25, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#059669';
        ctx.fillRect(turret.x - 5, turret.y - 35, 10, 20);
        
        // Shield
        if (turret.hasShield) {
          ctx.beginPath();
          ctx.arc(turret.x, turret.y, 35, Math.PI, 0);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
          ctx.fill();
        }
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(`${turret.ammo}`, turret.x, turret.y + 15);

        // Health Bar below turret
        const barWidth = 40;
        const barHeight = 4;
        const barY = turret.y + 25;
        ctx.fillStyle = '#333';
        ctx.fillRect(turret.x - barWidth / 2, barY, barWidth, barHeight);
        
        const healthPercent = turret.health / turret.maxHealth;
        ctx.fillStyle = healthPercent > 0.6 ? '#10b981' : healthPercent > 0.3 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(turret.x - barWidth / 2, barY, barWidth * healthPercent, barHeight);
      } else {
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 15, Math.PI, 0);
        ctx.fill();
      }
    });

    if (turretsRef.current.every(t => t.destroyed)) {
      setGameState(GameState.LOST);
    }

    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, displayTime]); // displayTime is used to force re-render HUD, but animate loop is stable

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [animate]);

  // Spawning Logic - Stable Effect
  useEffect(() => {
    if (gameState !== GameState.PLAYING) return;
    
    let spawnTimeout: any;
    const spawnLoop = () => {
      spawnRocket();
      const timeFactor = Math.min(gameTimeRef.current / 60, 1);
      const delay = SPAWN_RATE_START - (timeFactor * (SPAWN_RATE_START - SPAWN_RATE_MIN));
      spawnTimeout = setTimeout(spawnLoop, delay);
    };

    spawnTimeout = setTimeout(spawnLoop, SPAWN_RATE_START);
    return () => clearTimeout(spawnTimeout);
  }, [gameState, spawnRocket]);

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent) => {
    if (gameState !== GameState.PLAYING) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (GAME_WIDTH / rect.width);
    const y = (clientY - rect.top) * (GAME_HEIGHT / rect.height);

    let bestTurret: Turret | null = null;
    let minDist = Infinity;

    turretsRef.current.forEach(turret => {
      if (!turret.destroyed && turret.ammo > 0) {
        const d = Math.abs(turret.x - x);
        if (d < minDist) {
          minDist = d;
          bestTurret = turret;
        }
      }
    });

    if (bestTurret) {
      const turret = bestTurret as Turret;
      turret.ammo--;
      const isSuper = superMissileTimerRef.current > 0;
      missilesRef.current.push({
        id: Math.random().toString(),
        start: { x: turret.x, y: turret.y - 30 },
        target: { x, y },
        current: { x: turret.x, y: turret.y - 30 },
        speed: isSuper ? MISSILE_SPEED * SUPER_MISSILE_SPEED_MULT : MISSILE_SPEED,
        exploded: false,
        turretIndex: turret.id,
        isSuper
      });
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-screen flex flex-col items-center justify-center bg-black overflow-hidden font-sans"
    >
      {/* Background Stars & Nebula */}
      <div className="stars-container absolute inset-0 pointer-events-none">
        {stars.current.map((star, i) => (
          <div 
            key={i} 
            className="star" 
            style={{ 
              left: `${star.x}%`, 
              top: `${star.y}%`, 
              width: `${star.size}px`, 
              height: `${star.size}px`,
              '--duration': `${star.duration}s` 
            } as any} 
          />
        ))}
        <div className="nebula top-1/4 left-1/4"></div>
        <div className="nebula bottom-1/4 right-1/4 bg-indigo-500/10"></div>
        <div className="scanline"></div>
      </div>

      {/* Header HUD - Always visible but lower z-index than overlays */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10 pointer-events-none">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-emerald-400 font-display text-2xl tracking-widest glitch-text">
                <Trophy className="w-6 h-6" />
                <span>{t.score}: {score} {gameMode === GameMode.CLASSIC && `/ ${WIN_SCORE}`}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs uppercase tracking-[0.4em]">
                  <Zap className="w-3 h-3" />
                  <span>{t.level}: {Math.floor(displayTime / 10) + 1}</span>
                </div>
                <div className="px-2 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[10px] text-blue-400 font-mono tracking-widest">
                  {gameMode === GameMode.CLASSIC ? t.classicMode : t.endlessMode}
                </div>
              </div>
            </div>

        {/* HUD Language Toggle - Only visible when playing */}
        {gameState === GameState.PLAYING && (
          <div className="flex gap-4 pointer-events-auto">
            <button 
              onClick={() => setLang(l => l === 'en' ? 'cn' : 'en')}
              className="px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all flex items-center gap-2 text-xs font-mono tracking-widest"
            >
              <Languages className="w-4 h-4" />
              {lang === 'en' ? '中文' : 'ENGLISH'}
            </button>
          </div>
        )}
      </div>

      {/* Game Canvas */}
      <div className="relative group crt-effect game-canvas-container shadow-[0_0_100px_rgba(59,130,246,0.15)] border border-white/10 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          onMouseDown={handleCanvasClick}
          onTouchStart={(e) => {
            e.preventDefault();
            handleCanvasClick(e);
          }}
          className="max-w-full max-h-[80vh] object-contain cursor-crosshair"
        />
      </div>

      {/* Bottom HUD - Ammo Status */}
      <div className="mt-6 flex gap-16 text-zinc-400 font-mono text-xs z-10">
        {turretsRef.current.map((turret, i) => (
          <div key={i} className={`flex flex-col items-center gap-2 ${turret.destroyed ? 'opacity-20' : ''}`}>
            <div className="w-12 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-300 ${turret.ammo < 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${(turret.ammo / turret.maxAmmo) * 100}%` }}
              />
            </div>
            <span className={`tracking-widest ${turret.ammo === 0 ? 'text-red-500 animate-pulse' : ''}`}>
              {i === 1 ? 'CENTER' : i === 0 ? 'LEFT' : 'RIGHT'}: {turret.ammo}
            </span>
          </div>
        ))}
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {gameState === GameState.START && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl p-8 text-center"
          >
            {/* Language Toggle on Start Screen */}
            <div className="absolute top-6 right-6">
              <button 
                onClick={() => setLang(l => l === 'en' ? 'cn' : 'en')}
                className="px-6 py-3 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-all flex items-center gap-3 text-sm font-mono tracking-widest text-white"
              >
                <Languages className="w-5 h-5" />
                {lang === 'en' ? '切换至中文' : 'SWITCH TO ENGLISH'}
              </button>
            </div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mb-12"
            >
              <h1 className="text-7xl md:text-9xl font-display font-bold text-white mb-2 tracking-tighter glitch-text">
                {t.title.split(' ').map((word, i) => (
                  <span key={i} className={i === 0 ? 'text-blue-500' : ''}>{word} </span>
                ))}
              </h1>
              <div className="h-1 w-64 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto"></div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mb-16">
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-left">
                <div className="flex items-center gap-3 text-blue-400 mb-4 font-display">
                  <Info className="w-5 h-5" />
                  <span className="uppercase tracking-widest">{lang === 'cn' ? '玩法说明' : 'HOW TO PLAY'}</span>
                </div>
                <div className="text-zinc-400 text-sm whitespace-pre-line leading-relaxed font-mono">
                  {t.instructions}
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl text-left">
                <div className="flex items-center gap-3 text-emerald-400 mb-4 font-display">
                  <Shield className="w-5 h-5" />
                  <span className="uppercase tracking-widest">{lang === 'cn' ? '防御目标' : 'MISSION'}</span>
                </div>
                <ul className="text-zinc-400 text-sm space-y-3 font-mono">
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                    {lang === 'cn' ? '保护6座蓝色城市建筑' : 'Protect 6 blue city structures'}
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    {lang === 'cn' ? '保护3座绿色导弹发射塔' : 'Defend 3 green missile turrets'}
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                    {lang === 'cn' ? '所有发射塔被毁即失败' : 'Game over if all turrets are lost'}
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6 mb-12">
              <button 
                onClick={() => initGame(GameMode.CLASSIC)}
                className="group relative px-12 py-5 bg-blue-600 hover:bg-blue-500 text-white font-display font-bold text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(37,99,235,0.4)]"
              >
                <span className="relative z-10 uppercase tracking-widest">{t.classicMode}</span>
                <div className="absolute inset-0 rounded-full bg-blue-400 blur-2xl opacity-0 group-hover:opacity-30 transition-opacity"></div>
              </button>
              <button 
                onClick={() => initGame(GameMode.ENDLESS)}
                className="group relative px-12 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-display font-bold text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(79,70,229,0.4)]"
              >
                <span className="relative z-10 uppercase tracking-widest">{t.endlessMode}</span>
                <div className="absolute inset-0 rounded-full bg-indigo-400 blur-2xl opacity-0 group-hover:opacity-30 transition-opacity"></div>
              </button>
            </div>
          </motion.div>
        )}

        {(gameState === GameState.WON || gameState === GameState.LOST) && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl p-8 text-center"
          >
            <div className={`text-8xl md:text-[10rem] font-display font-bold mb-8 tracking-tighter glitch-text ${gameState === GameState.WON ? 'text-emerald-500' : 'text-red-500'}`}>
              {gameState === GameState.WON ? t.victory : t.defeat}
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 mb-16">
              <div className="bg-white/5 border border-white/10 rounded-3xl p-10 min-w-[240px]">
                <div className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em] mb-4">{t.score}</div>
                <div className="text-6xl font-display text-white">{score}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-3xl p-10 min-w-[240px]">
                <div className="text-zinc-500 font-mono text-xs uppercase tracking-[0.4em] mb-4">{lang === 'cn' ? '存活时间' : 'TIME'}</div>
                <div className="text-6xl font-display text-white">{Math.floor(displayTime)}s</div>
              </div>
            </div>

            <button 
              onClick={() => setGameState(GameState.START)}
              className="flex items-center gap-4 px-12 py-5 bg-white text-black hover:bg-zinc-200 font-display font-bold text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              <RefreshCw className="w-6 h-6" />
              <span className="uppercase tracking-widest">{t.playAgain}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Branding */}
      <div className="absolute bottom-6 left-0 right-0 text-center text-[10px] font-mono text-zinc-800 uppercase tracking-[0.5em] pointer-events-none">
        Deep Space Defense Network // Sector 7-G // {new Date().getFullYear()}
      </div>
    </div>
  );
}
