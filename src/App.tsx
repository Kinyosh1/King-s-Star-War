/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Zap, Trophy, RefreshCw, Languages, Info, Rocket as RocketIcon, Volume2, VolumeX } from 'lucide-react';
import { soundManager } from './services/soundManager';
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
  const [isMuted, setIsMuted] = useState(false);
  
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
  const lastPowerUpTimeRef = useRef<number>(0);
  const lastPowerUpScoreRef = useRef<number>(0);
  const superMissileTimerRef = useRef<number>(0);
  const t = TRANSLATIONS[lang];

  // Stars for background
  const stars = useRef(Array.from({ length: 150 }).map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    duration: Math.random() * 3 + 2
  })));

  const planets = useRef([
    { x: 15, y: 20, size: 80, color: '#3b82f6', opacity: 0.3 },
    { x: 85, y: 15, size: 120, color: '#ef4444', opacity: 0.2 },
    { x: 50, y: 40, size: 40, color: '#f59e0b', opacity: 0.25 },
  ]);

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
    lastPowerUpTimeRef.current = 0;
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
    const rand = Math.random();
    let type: PowerUpType;
    
    if (rand < 0.25) {
      type = PowerUpType.HEALTH;
    } else if (rand < 0.50) {
      type = PowerUpType.SHIELD;
    } else if (rand < 0.85) {
      type = PowerUpType.AMMO;
    } else {
      type = PowerUpType.SUPER_MISSILE;
    }
    
    powerUpsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      type,
      x: 100 + Math.random() * (GAME_WIDTH - 200),
      y: 100 + Math.random() * (GAME_HEIGHT - 300),
      timer: 3, // 3 seconds
      collected: false
    });
  }, []);

  const applyPowerUp = useCallback((type: PowerUpType) => {
    soundManager.playPowerUp();
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

    // Check for power-up spawn (Endless mode only, every 10s)
    if (gameMode === GameMode.ENDLESS) {
      if (gameTimeRef.current >= lastPowerUpTimeRef.current + 10) {
        lastPowerUpTimeRef.current = Math.floor(gameTimeRef.current / 10) * 10;
        spawnPowerUp();
      }
    }

    // Check for power-up spawn (Every 500 points, spawn 2, Endless mode only)
    if (gameMode === GameMode.ENDLESS && score >= lastPowerUpScoreRef.current + 500) {
      lastPowerUpScoreRef.current = Math.floor(score / 500) * 500;
      spawnPowerUp();
      spawnPowerUp();
    }

    // Update UI time occasionally (every 0.5s) to save performance
    if (Math.floor(gameTimeRef.current * 2) > Math.floor(displayTime * 2)) {
      setDisplayTime(gameTimeRef.current);
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
      ctx.strokeStyle = 'rgba(255, 80, 80, 0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Rocket head glow
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff4444';
      ctx.fillStyle = '#ff4444';
      ctx.beginPath();
      ctx.arc(rocket.current.x, rocket.current.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (rocket.current.y >= rocket.end.y) {
        rocket.destroyed = true;
        soundManager.playExplosion();
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
      ctx.strokeStyle = missile.isSuper ? 'rgba(245, 158, 11, 0.3)' : 'rgba(100, 220, 255, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Target marker
      ctx.beginPath();
      ctx.moveTo(missile.target.x - 8, missile.target.y - 8);
      ctx.lineTo(missile.target.x + 8, missile.target.y + 8);
      ctx.moveTo(missile.target.x + 8, missile.target.y - 8);
      ctx.lineTo(missile.target.x - 8, missile.target.y + 8);
      ctx.strokeStyle = missile.isSuper ? '#f59e0b' : '#00f2ff';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Missile head glow
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = missile.isSuper ? '#f59e0b' : '#00f2ff';
      ctx.fillStyle = missile.isSuper ? '#fbbf24' : '#00f2ff';
      ctx.beginPath();
      ctx.arc(missile.current.x, missile.current.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const distToTarget = Math.sqrt(
        Math.pow(missile.target.x - missile.current.x, 2) + 
        Math.pow(missile.target.y - missile.current.y, 2)
      );

      if (distToTarget < missile.speed) {
        missile.exploded = true;
        soundManager.playExplosion();
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

      // Direct hit on power-ups
      powerUpsRef.current.forEach(pu => {
        const dist = Math.sqrt(Math.pow(pu.x - missile.current.x, 2) + Math.pow(pu.y - missile.current.y, 2));
        if (dist < 15) { // Slightly larger hit box for missiles
          missile.exploded = true;
          pu.collected = true;
          applyPowerUp(pu.type);
          
          // Create a small explosion for feedback
          explosionsRef.current.push({
            id: Math.random().toString(),
            x: pu.x,
            y: pu.y,
            radius: 0,
            maxRadius: 30,
            growing: true,
            done: false
          });
        }
      });
    });
    missilesRef.current = missilesRef.current.filter(m => !m.exploded);

    // Update & Draw Power-Ups
    powerUpsRef.current.forEach(pu => {
      pu.timer -= deltaTime;
      
      // Draw Power-Up (3x size of enemy rocket which is arc radius 3)
      const puRadius = 20; 
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = pu.type === PowerUpType.HEALTH ? '#ef4444' : pu.type === PowerUpType.SHIELD ? '#3b82f6' : pu.type === PowerUpType.AMMO ? '#10b981' : '#f59e0b';
      
      // Pulse effect for timer
      const scale = 1 + Math.sin(gameTimeRef.current * 10) * 0.1;
      
      ctx.beginPath();
      ctx.arc(pu.x, pu.y, puRadius * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const icon = pu.type === PowerUpType.HEALTH ? '❤️' : pu.type === PowerUpType.SHIELD ? '🛡️' : pu.type === PowerUpType.AMMO ? '🔋' : '⚡';
      ctx.fillText(icon, pu.x, pu.y);
      ctx.restore();

      if (pu.timer <= 0) pu.collected = true;
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
            if (gameMode === GameMode.CLASSIC && newScore >= WIN_SCORE) {
              setGameState(GameState.WON);
              setDisplayTime(gameTimeRef.current);
            }
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
    
    // Grid effect on ground
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 1;
    for(let i = 0; i <= GAME_WIDTH; i += 50) {
      ctx.beginPath();
      ctx.moveTo(i, GAME_HEIGHT - 40);
      ctx.lineTo(i, GAME_HEIGHT);
      ctx.stroke();
    }
    for(let i = 0; i <= 40; i += 10) {
      ctx.beginPath();
      ctx.moveTo(0, GAME_HEIGHT - 40 + i);
      ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - 40 + i);
      ctx.stroke();
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, GAME_HEIGHT - 40, GAME_WIDTH, 1);

    // Draw Cities
    citiesRef.current.forEach(city => {
      if (!city.destroyed) {
        // Futuristic Dome City
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#3b82f6';
        
        // Base
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(city.x - 20, city.y - 5, 40, 5);
        
        // Dome
        const gradient = ctx.createRadialGradient(city.x, city.y - 5, 0, city.x, city.y - 5, 25);
        gradient.addColorStop(0, 'rgba(96, 165, 250, 0.6)');
        gradient.addColorStop(1, 'rgba(30, 58, 138, 0.4)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(city.x, city.y - 5, 20, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Internal structures
        ctx.fillStyle = '#fff';
        ctx.fillRect(city.x - 10, city.y - 15, 4, 10);
        ctx.fillRect(city.x + 6, city.y - 12, 4, 7);
        ctx.fillRect(city.x - 2, city.y - 18, 4, 13);
        
        ctx.restore();
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
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#10b981';
        
        // Base platform
        ctx.fillStyle = '#064e3b';
        ctx.beginPath();
        ctx.ellipse(turret.x, turret.y, 30, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Cannon body
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y - 10, 15, 0, Math.PI * 2);
        ctx.fill();
        
        // Cannon barrel
        ctx.fillStyle = '#059669';
        ctx.fillRect(turret.x - 6, turret.y - 35, 12, 25);
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.strokeRect(turret.x - 6, turret.y - 35, 12, 25);
        
        // Shield
        if (turret.hasShield) {
          ctx.beginPath();
          ctx.arc(turret.x, turret.y - 10, 40, 0, Math.PI * 2);
          ctx.strokeStyle = '#3b82f6';
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
          ctx.fill();
        }
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Orbitron';
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
        ctx.restore();
      } else {
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.arc(turret.x, turret.y, 15, Math.PI, 0);
        ctx.fill();
      }
    });

    if (turretsRef.current.every(t => t.destroyed)) {
      setGameState(GameState.LOST);
      setDisplayTime(gameTimeRef.current);
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

  const handleCanvasClick = (e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (gameState !== GameState.PLAYING) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as any).clientX;
      clientY = (e as any).clientY;
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
      soundManager.playLaunch();
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
        {planets.current.map((planet, i) => (
          <div 
            key={`planet-${i}`}
            className="planet"
            style={{
              left: `${planet.x}%`,
              top: `${planet.y}%`,
              width: `${planet.size}px`,
              height: `${planet.size}px`,
              backgroundColor: planet.color,
              opacity: planet.opacity,
              transform: 'translate(-50%, -50%)'
            }}
          />
        ))}
        <div className="nebula top-1/4 left-1/4"></div>
        <div className="nebula bottom-1/4 right-1/4 bg-indigo-500/10"></div>
        <div className="scanline"></div>
      </div>

      {/* Header HUD - Always visible but lower z-index than overlays */}
      <div className="absolute top-0 left-0 right-0 p-4 md:p-6 flex justify-between items-start z-[60] pointer-events-none">
        <div className="flex flex-col gap-1 md:gap-2">
          <div className="flex items-center gap-2 md:gap-3 text-emerald-400 font-display text-lg md:text-2xl tracking-widest glitch-text">
            <Trophy className="w-5 h-5 md:w-6 md:h-6" />
            <span>{t.score}: {score} {gameMode === GameMode.CLASSIC && `/ ${WIN_SCORE}`}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-zinc-500 font-mono text-[10px] md:text-xs uppercase tracking-[0.2em] md:tracking-[0.4em]">
              <Zap className="w-3 h-3" />
              <span>{t.level}: {Math.floor(displayTime / 10) + 1}</span>
            </div>
            <div className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/30 rounded text-[8px] md:text-[10px] text-blue-400 font-mono tracking-widest">
              {gameMode === GameMode.CLASSIC ? t.classicMode : t.endlessMode}
            </div>
          </div>
        </div>

        {/* HUD Language Toggle - Only visible when playing */}
        {gameState === GameState.PLAYING && (
          <div className="flex gap-2 md:gap-4 pointer-events-auto">
            <button 
              onClick={() => {
                const muted = soundManager.toggleMute();
                setIsMuted(muted);
              }}
              className="p-1.5 md:p-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all text-white"
            >
              {isMuted ? <VolumeX className="w-4 h-4 md:w-5 md:h-5" /> : <Volume2 className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button 
              onClick={() => setLang(l => l === 'en' ? 'cn' : 'en')}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all flex items-center gap-2 text-[10px] md:text-xs font-mono tracking-widest"
            >
              <Languages className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{lang === 'en' ? '中文' : 'ENGLISH'}</span>
              <span className="sm:hidden">{lang === 'en' ? 'CN' : 'EN'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Game Canvas */}
      <div className="relative group crt-effect game-canvas-container shadow-[0_0_100px_rgba(59,130,246,0.15)] border border-white/10 rounded-lg overflow-hidden w-[95vw] max-w-[1000px] aspect-[1000/700]">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          onPointerDown={(e) => {
            // PointerDown handles both touch and mouse consistently
            handleCanvasClick(e);
          }}
          className="w-full h-full object-contain cursor-crosshair touch-none"
        />
      </div>

      {/* Bottom HUD - Ammo Status */}
      <div className="mt-4 md:mt-6 flex gap-4 sm:gap-8 md:gap-16 text-zinc-400 font-mono text-[10px] md:text-xs z-10">
        {turretsRef.current.map((turret, i) => (
          <div key={i} className={`flex flex-col items-center gap-1 md:gap-2 ${turret.destroyed ? 'opacity-20' : ''}`}>
            <div className="w-8 sm:w-10 md:w-12 h-1 md:h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
              <div 
                className={`h-full transition-all duration-300 ${turret.ammo < 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${(turret.ammo / turret.maxAmmo) * 100}%` }}
              />
            </div>
            <span className="tracking-tighter sm:tracking-widest scale-90 sm:scale-100">
              {i === 1 ? 'CTR' : i === 0 ? 'L' : 'R'}: {turret.ammo}
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
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl p-4 md:p-8 text-center overflow-y-auto"
          >
            {/* Language Toggle on Start Screen */}
            <div className="absolute top-4 right-4 md:top-6 md:right-6 flex gap-2 md:gap-4 z-[70]">
              <button 
                onClick={() => {
                  const muted = soundManager.toggleMute();
                  setIsMuted(muted);
                }}
                className="p-2 md:p-3 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-all text-white"
              >
                {isMuted ? <VolumeX className="w-5 h-5 md:w-6 md:h-6" /> : <Volume2 className="w-5 h-5 md:w-6 md:h-6" />}
              </button>
              <button 
                onClick={() => setLang(l => l === 'en' ? 'cn' : 'en')}
                className="px-4 py-2 md:px-6 md:py-3 bg-white/10 border border-white/20 rounded-full hover:bg-white/20 transition-all flex items-center gap-2 md:gap-3 text-xs md:text-sm font-mono tracking-widest text-white"
              >
                <Languages className="w-4 h-4 md:w-5 md:h-5" />
                <span>{lang === 'en' ? '中文' : 'ENGLISH'}</span>
              </button>
            </div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mb-6 md:mb-12 mt-12 md:mt-0 relative"
            >
              <div className="absolute -inset-10 bg-blue-500/20 blur-[100px] rounded-full animate-pulse"></div>
              <h1 className="text-4xl sm:text-6xl md:text-9xl font-display font-bold text-white mb-2 tracking-tighter glitch-text relative z-10">
                {t.title.split(' ').map((word, i) => (
                  <span key={i} className={i === 0 ? 'text-blue-500' : ''}>{word} </span>
                ))}
              </h1>
              <div className="h-0.5 md:h-1 w-32 md:w-64 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto relative z-10"></div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 max-w-4xl mb-8 md:mb-16 w-full">
              <div className="bg-white/5 border border-white/10 p-4 md:p-6 rounded-xl md:rounded-2xl text-left">
                <div className="flex items-center gap-3 text-blue-400 mb-2 md:mb-4 font-display text-sm md:text-base">
                  <Info className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="uppercase tracking-widest">{lang === 'cn' ? '玩法说明' : 'HOW TO PLAY'}</span>
                </div>
                <div className="text-zinc-400 text-xs md:text-sm whitespace-pre-line leading-relaxed font-mono">
                  {t.instructions}
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 p-4 md:p-6 rounded-xl md:rounded-2xl text-left">
                <div className="flex items-center gap-3 text-emerald-400 mb-2 md:mb-4 font-display text-sm md:text-base">
                  <Shield className="w-4 h-4 md:w-5 md:h-5" />
                  <span className="uppercase tracking-widest">{lang === 'cn' ? '防御目标' : 'MISSION'}</span>
                </div>
                <ul className="text-zinc-400 text-xs md:text-sm space-y-2 md:space-y-3 font-mono">
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

            <div className="flex flex-col sm:flex-row gap-4 md:gap-6 mb-8 md:mb-12">
              <button 
                onClick={() => initGame(GameMode.CLASSIC)}
                className="group relative px-8 py-3 md:px-12 md:py-5 bg-blue-600 hover:bg-blue-500 text-white font-display font-bold text-lg md:text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(37,99,235,0.4)]"
              >
                <span className="relative z-10 uppercase tracking-widest">{t.classicMode}</span>
                <div className="absolute inset-0 rounded-full bg-blue-400 blur-2xl opacity-0 group-hover:opacity-30 transition-opacity"></div>
              </button>
              <button 
                onClick={() => initGame(GameMode.ENDLESS)}
                className="group relative px-8 py-3 md:px-12 md:py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-display font-bold text-lg md:text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_50px_rgba(79,70,229,0.4)]"
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
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-2xl p-4 md:p-8 text-center overflow-y-auto"
          >
            <div className={`text-5xl sm:text-7xl md:text-[10rem] font-display font-bold mb-4 md:mb-8 tracking-tighter glitch-text ${gameState === GameState.WON ? 'text-emerald-500' : 'text-red-500'}`}>
              {gameState === GameState.WON ? t.victory : t.defeat}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 md:gap-8 mb-8 md:mb-16">
              <div className="bg-white/5 border border-white/10 rounded-2xl md:rounded-3xl p-6 md:p-10 min-w-[160px] md:min-w-[240px]">
                <div className="text-zinc-500 font-mono text-[10px] md:text-xs uppercase tracking-[0.4em] mb-2 md:mb-4">{t.score}</div>
                <div className="text-4xl md:text-6xl font-display text-white">{score}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl md:rounded-3xl p-6 md:p-10 min-w-[160px] md:min-w-[240px]">
                <div className="text-zinc-500 font-mono text-[10px] md:text-xs uppercase tracking-[0.4em] mb-2 md:mb-4">{lang === 'cn' ? '存活时间' : 'TIME'}</div>
                <div className="text-4xl md:text-6xl font-display text-white">{Math.floor(displayTime)}s</div>
              </div>
            </div>

            <button 
              onClick={() => setGameState(GameState.START)}
              className="flex items-center gap-3 md:gap-4 px-8 py-4 md:px-12 md:py-5 bg-white text-black hover:bg-zinc-200 font-display font-bold text-lg md:text-xl rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
            >
              <RefreshCw className="w-5 h-5 md:w-6 md:h-6" />
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
