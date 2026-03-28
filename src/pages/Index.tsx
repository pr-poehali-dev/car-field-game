import { useEffect, useRef, useState, useCallback } from "react";

type GameScreen = "menu" | "playing" | "win" | "gameover";
type GameMode = "classic" | "race" | "survival";

interface Car {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
}

interface Obstacle {
  x: number;
  y: number;
  type: "rock" | "bush" | "hay";
  size: number;
}

interface Tree {
  x: number;
  y: number;
  size: number;
  variant: number;
}

interface Cloud {
  x: number;
  y: number;
  w: number;
  speed: number;
}

const FIELD_LENGTH = 6000;
const ROAD_WIDTH = 220;
const CANVAS_W = 900;
const CANVAS_H = 550;

function generateObstacles(): Obstacle[] {
  const obs: Obstacle[] = [];
  for (let i = 0; i < 60; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const x = ROAD_WIDTH / 2 + 30 + Math.random() * 220;
    obs.push({
      x: side * x,
      y: 300 + Math.random() * (FIELD_LENGTH - 600),
      type: ["rock", "bush", "hay"][Math.floor(Math.random() * 3)] as Obstacle["type"],
      size: 18 + Math.random() * 22,
    });
  }
  return obs;
}

function generateTrees(): Tree[] {
  const trees: Tree[] = [];
  for (let i = 0; i < 120; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    trees.push({
      x: side * (ROAD_WIDTH / 2 + 80 + Math.random() * 300),
      y: Math.random() * FIELD_LENGTH,
      size: 28 + Math.random() * 30,
      variant: Math.floor(Math.random() * 3),
    });
  }
  return trees;
}

function generateClouds(): Cloud[] {
  return Array.from({ length: 12 }, () => ({
    x: Math.random() * CANVAS_W,
    y: 20 + Math.random() * 120,
    w: 80 + Math.random() * 120,
    speed: 0.1 + Math.random() * 0.15,
  }));
}

const MODES: { id: GameMode; label: string; desc: string; color: string }[] = [
  { id: "classic", label: "КЛАССИКА", desc: "Спокойно доедь до конца поля", color: "#4ade80" },
  { id: "race", label: "ГОНКА", desc: "Как можно быстрее — на время", color: "#facc15" },
  { id: "survival", label: "ВЫЖИВАНИЕ", desc: "Не врезайся в препятствия!", color: "#f87171" },
];

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef({
    car: { x: 0, y: 80, vx: 0, vy: 0, angle: 0, speed: 0 } as Car,
    obstacles: [] as Obstacle[],
    trees: [] as Tree[],
    clouds: [] as Cloud[],
    keys: {} as Record<string, boolean>,
    camera: { y: 0 },
    animId: 0,
    startTime: 0,
    elapsed: 0,
    lives: 3,
    hits: 0,
    grass: null as CanvasPattern | null,
  });

  const [screen, setScreen] = useState<GameScreen>("menu");
  const [mode, setMode] = useState<GameMode>("classic");
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [lives, setLives] = useState(3);
  const [selectedMode, setSelectedMode] = useState<GameMode>("classic");

  const drawScene = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = gameRef.current;
    const { car, camera, obstacles, trees, clouds } = g;
    const W = CANVAS_W, H = CANVAS_H;
    const camY = camera.y;

    ctx.save();

    // Horizon line
    const hy = H * 0.45;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, "#1a3a5c");
    sky.addColorStop(1, "#4a7fb5");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, hy);

    // Clouds
    ctx.globalAlpha = 0.75;
    clouds.forEach((cl) => {
      ctx.fillStyle = "#e8f0fa";
      ctx.beginPath();
      ctx.ellipse(cl.x, cl.y, cl.w / 2, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(cl.x - cl.w * 0.2, cl.y + 6, cl.w * 0.3, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(cl.x + cl.w * 0.25, cl.y + 4, cl.w * 0.28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Field background
    const grassGrad = ctx.createLinearGradient(0, hy, 0, H);
    grassGrad.addColorStop(0, "#2d5a1b");
    grassGrad.addColorStop(0.4, "#3a7022");
    grassGrad.addColorStop(1, "#234d14");
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, hy, W, H - hy);

    // Perspective projection helper
    const perspective = (worldX: number, worldY: number) => {
      const relY = worldY - camY;
      if (relY <= 0) return null;
      const fov = 380;
      const scale = fov / (fov + relY * 0.9);
      const screenX = W / 2 + worldX * scale * 1.4;
      const screenY = hy + relY * scale * 1.1;
      return { x: screenX, y: screenY, scale };
    };

    // Grass texture lines
    for (let row = 0; row < 60; row++) {
      const wy = camY + row * 120;
      const p = perspective(0, wy);
      if (!p || p.y > H) continue;
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = row % 2 === 0 ? "#5a9c30" : "#1e4010";
      ctx.lineWidth = Math.max(0.5, p.scale * 8);
      ctx.beginPath();
      ctx.moveTo(0, p.y);
      ctx.lineTo(W, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Road
    const drawRoad = () => {
      const roadPts: { x: number; y: number }[] = [];
      for (let wy = camY; wy < camY + 2500; wy += 25) {
        const pL = perspective(-ROAD_WIDTH / 2, wy);
        const pR = perspective(ROAD_WIDTH / 2, wy);
        if (pL && pR && pL.y <= H) {
          if (roadPts.length === 0) roadPts.push({ x: pL.x, y: pL.y });
        }
      }

      // Road body
      ctx.beginPath();
      const samples: { l: { x: number; y: number } | null; r: { x: number; y: number } | null }[] = [];
      for (let wy = camY; wy < camY + 2500; wy += 20) {
        samples.push({
          l: perspective(-ROAD_WIDTH / 2, wy),
          r: perspective(ROAD_WIDTH / 2, wy),
        });
      }
      const valid = samples.filter((s) => s.l && s.r && s.l.y <= H && s.l.y >= hy);
      if (valid.length > 1) {
        ctx.beginPath();
        ctx.moveTo(valid[0].l!.x, valid[0].l!.y);
        valid.forEach((s) => ctx.lineTo(s.l!.x, s.l!.y));
        valid.slice().reverse().forEach((s) => ctx.lineTo(s.r!.x, s.r!.y));
        ctx.closePath();

        const roadGrad = ctx.createLinearGradient(W / 2 - 110, 0, W / 2 + 110, 0);
        roadGrad.addColorStop(0, "#3a3a3a");
        roadGrad.addColorStop(0.5, "#4f4f4f");
        roadGrad.addColorStop(1, "#3a3a3a");
        ctx.fillStyle = roadGrad;
        ctx.fill();

        // Road edge lines
        ctx.strokeStyle = "#f5e642";
        ctx.lineWidth = 2;
        ctx.setLineDash([20, 15]);
        ctx.beginPath();
        valid.forEach((s, i) => {
          if (i === 0) ctx.moveTo(s.l!.x, s.l!.y);
          else ctx.lineTo(s.l!.x, s.l!.y);
        });
        ctx.stroke();
        ctx.beginPath();
        valid.forEach((s, i) => {
          if (i === 0) ctx.moveTo(s.r!.x, s.r!.y);
          else ctx.lineTo(s.r!.x, s.r!.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Center dashes
        ctx.strokeStyle = "#ffffff88";
        ctx.lineWidth = 2;
        ctx.setLineDash([18, 22]);
        ctx.beginPath();
        valid.forEach((s, i) => {
          const cx = (s.l!.x + s.r!.x) / 2;
          if (i === 0) ctx.moveTo(cx, s.l!.y);
          else ctx.lineTo(cx, s.l!.y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    drawRoad();

    // Trees
    trees.forEach((t) => {
      const p = perspective(t.x, t.y);
      if (!p || p.y < hy || p.y > H + 50) return;
      const s = p.scale * t.size * 0.045;
      // Shadow
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#0a1a05";
      ctx.beginPath();
      ctx.ellipse(p.x + s * 3, p.y + s * 2, s * 8, s * 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Trunk
      ctx.fillStyle = "#5c3a1e";
      ctx.fillRect(p.x - s * 1.2, p.y - s * 6, s * 2.5, s * 7);
      // Foliage
      const colors = ["#2d6b1a", "#3a8020", "#1f4d10"];
      ctx.fillStyle = colors[t.variant];
      ctx.beginPath();
      ctx.arc(p.x, p.y - s * 8, s * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors[(t.variant + 1) % 3];
      ctx.beginPath();
      ctx.arc(p.x - s * 3, p.y - s * 6, s * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x + s * 3, p.y - s * 6, s * 5, 0, Math.PI * 2);
      ctx.fill();
      // Highlight
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "#a8ff60";
      ctx.beginPath();
      ctx.arc(p.x - s * 1.5, p.y - s * 10, s * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });

    // Obstacles
    obstacles.forEach((ob) => {
      const p = perspective(ob.x, ob.y);
      if (!p || p.y < hy || p.y > H + 30) return;
      const s = p.scale * ob.size * 0.06;
      // Shadow
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(p.x + s * 2, p.y + s, s * 5, s * 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (ob.type === "rock") {
        const rg = ctx.createRadialGradient(p.x - s, p.y - s, 0, p.x, p.y, s * 4);
        rg.addColorStop(0, "#a0a0a0");
        rg.addColorStop(1, "#404040");
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s * 3.5, s * 2.5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ccc";
        ctx.beginPath();
        ctx.ellipse(p.x - s, p.y - s * 0.5, s * 1.2, s * 0.8, -0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (ob.type === "bush") {
        ctx.fillStyle = "#2a5e10";
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3a8020";
        ctx.beginPath();
        ctx.arc(p.x - s, p.y - s, s * 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x + s, p.y - s * 0.5, s * 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Hay bale
        ctx.fillStyle = "#c8960a";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s * 3.5, s * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#8a6200";
        ctx.lineWidth = s * 0.4;
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(p.x - s * 3.5, p.y + i * s * 0.5);
          ctx.lineTo(p.x + s * 3.5, p.y + i * s * 0.5);
          ctx.stroke();
        }
        ctx.strokeStyle = "#c8960a";
        ctx.lineWidth = s * 0.3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s * 3.5, s * 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // Finish line
    const finP0 = perspective(-ROAD_WIDTH / 2, FIELD_LENGTH - 100);
    const finP1 = perspective(ROAD_WIDTH / 2, FIELD_LENGTH - 100);
    if (finP0 && finP1 && finP0.y >= hy && finP0.y <= H) {
      const squares = 12;
      const sqW = (finP1.x - finP0.x) / squares;
      const sqH = Math.max(4, (finP1.y - finP0.y) * 0.4 + 8);
      for (let i = 0; i < squares; i++) {
        ctx.fillStyle = (i + Math.floor(0)) % 2 === 0 ? "#fff" : "#000";
        ctx.fillRect(finP0.x + i * sqW, finP0.y - sqH / 2, sqW, sqH);
      }
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(finP0.x, finP0.y - sqH / 2, finP1.x - finP0.x, sqH);
    }

    // Car
    const carWorldY = car.y;
    const carP = perspective(car.x, carWorldY);
    if (carP && carP.y >= hy - 20) {
      const s = carP.scale * 38;
      ctx.save();
      ctx.translate(carP.x, carP.y);
      ctx.rotate(car.angle);
      // Car shadow
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(s * 0.05, s * 0.25, s * 0.7, s * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // Car body
      const bodyGrad = ctx.createLinearGradient(-s * 0.5, -s * 0.6, s * 0.5, s * 0.3);
      bodyGrad.addColorStop(0, "#e03030");
      bodyGrad.addColorStop(0.4, "#c01010");
      bodyGrad.addColorStop(1, "#800808");
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.roundRect(-s * 0.45, -s * 0.55, s * 0.9, s * 0.75, s * 0.1);
      ctx.fill();
      // Roof
      ctx.fillStyle = "#cc2020";
      ctx.beginPath();
      ctx.roundRect(-s * 0.28, -s * 0.75, s * 0.56, s * 0.28, s * 0.08);
      ctx.fill();
      // Windshield
      ctx.fillStyle = "#a8d8f0cc";
      ctx.beginPath();
      ctx.roundRect(-s * 0.23, -s * 0.68, s * 0.46, s * 0.2, s * 0.04);
      ctx.fill();
      // Windows
      ctx.fillStyle = "#a8d8f0aa";
      ctx.fillRect(-s * 0.35, -s * 0.44, s * 0.28, s * 0.18);
      ctx.fillRect(s * 0.07, -s * 0.44, s * 0.28, s * 0.18);
      // Headlights
      ctx.fillStyle = "#fff9a0";
      ctx.beginPath();
      ctx.ellipse(-s * 0.28, -s * 0.5, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(s * 0.28, -s * 0.5, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fill();
      // Wheels
      const wheelPositions = [
        [-s * 0.38, -s * 0.32],
        [s * 0.38, -s * 0.32],
        [-s * 0.38, s * 0.12],
        [s * 0.38, s * 0.12],
      ];
      wheelPositions.forEach(([wx, wy]) => {
        ctx.fillStyle = "#1a1a1a";
        ctx.beginPath();
        ctx.ellipse(wx, wy, s * 0.14, s * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#555";
        ctx.beginPath();
        ctx.ellipse(wx, wy, s * 0.08, s * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      // Highlight
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(-s * 0.35, -s * 0.5, s * 0.25, s * 0.35, s * 0.06);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Restore normal orientation for HUD
    ctx.restore();

    // Progress HUD
    const pct = Math.min(1, car.y / (FIELD_LENGTH - 100));
    // Top bar
    ctx.fillStyle = "#00000080";
    ctx.fillRect(0, 0, W, 44);
    ctx.fillStyle = "#ffffff22";
    ctx.fillRect(20, 12, W - 40, 18);
    const barGrad = ctx.createLinearGradient(20, 0, W - 20, 0);
    barGrad.addColorStop(0, "#4ade80");
    barGrad.addColorStop(0.7, "#facc15");
    barGrad.addColorStop(1, "#f87171");
    ctx.fillStyle = barGrad;
    ctx.fillRect(20, 12, (W - 40) * pct, 18);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Oswald, sans-serif";
    ctx.fillText(`🚗 ${Math.round(pct * 100)}%`, W / 2 - 25, 26);

    // Speedometer
    const spd = Math.round(Math.abs(g.car.speed) * 180);
    ctx.fillStyle = "#00000088";
    ctx.beginPath();
    ctx.roundRect(W - 110, H - 70, 96, 58, 10);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 28px Oswald, sans-serif";
    ctx.fillText(`${spd}`, W - 80, H - 32);
    ctx.font = "12px Rubik, sans-serif";
    ctx.fillStyle = "#aaa";
    ctx.fillText("КМ/Ч", W - 58, H - 18);

    // Lives (survival)
    if (mode === "survival") {
      ctx.font = "22px sans-serif";
      for (let i = 0; i < g.lives; i++) ctx.fillText("❤️", 20 + i * 30, H - 16);
    }

    // Timer (race)
    if (mode === "race") {
      const t = Math.floor(g.elapsed / 1000);
      const mins = Math.floor(t / 60).toString().padStart(2, "0");
      const secs = (t % 60).toString().padStart(2, "0");
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 22px Oswald, sans-serif";
      ctx.fillText(`⏱ ${mins}:${secs}`, 20, H - 16);
    }
  }, [mode]);

  const startGame = useCallback((m: GameMode) => {
    const g = gameRef.current;
    g.car = { x: 0, y: 80, vx: 0, vy: 0, angle: 0, speed: 0 };
    g.camera = { y: 0 };
    g.obstacles = generateObstacles();
    g.trees = generateTrees();
    g.clouds = generateClouds();
    g.keys = {};
    g.startTime = Date.now();
    g.elapsed = 0;
    g.lives = 3;
    g.hits = 0;
    setMode(m);
    setScreen("playing");
    setProgress(0);
    setElapsed(0);
    setLives(3);
  }, []);

  useEffect(() => {
    if (screen !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const g = gameRef.current;

    const onKey = (e: KeyboardEvent, down: boolean) => {
      g.keys[e.key] = down;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", (e) => onKey(e, true));
    window.addEventListener("keyup", (e) => onKey(e, false));

    const MAX_SPEED = 0.085;
    const ACCEL = 0.0018;
    const FRICTION = 0.97;
    const TURN = 0.032;
    let lastHitTime = 0;

    const loop = () => {
      const now = Date.now();
      g.elapsed = now - g.startTime;

      // Input
      if (g.keys["ArrowUp"] || g.keys["w"] || g.keys["W"]) {
        g.car.speed = Math.min(g.car.speed + ACCEL, MAX_SPEED);
      } else if (g.keys["ArrowDown"] || g.keys["s"] || g.keys["S"]) {
        g.car.speed = Math.max(g.car.speed - ACCEL, -MAX_SPEED * 0.4);
      } else {
        g.car.speed *= FRICTION;
      }

      if (Math.abs(g.car.speed) > 0.002) {
        if (g.keys["ArrowLeft"] || g.keys["a"] || g.keys["A"]) {
          g.car.angle -= TURN * Math.sign(g.car.speed) * Math.min(1, Math.abs(g.car.speed) / 0.02);
        }
        if (g.keys["ArrowRight"] || g.keys["d"] || g.keys["D"]) {
          g.car.angle += TURN * Math.sign(g.car.speed) * Math.min(1, Math.abs(g.car.speed) / 0.02);
        }
      }

      g.car.x += Math.sin(g.car.angle) * g.car.speed * 120;
      g.car.y += Math.cos(g.car.angle) * g.car.speed * 120;
      g.car.y = Math.max(80, g.car.y);

      // Road drift correction
      const offRoad = Math.abs(g.car.x) > ROAD_WIDTH / 2;
      if (offRoad) {
        g.car.speed *= 0.94;
        g.car.x *= 0.985;
      }

      // Camera
      g.camera.y = Math.max(0, g.car.y - CANVAS_H * 0.55);

      // Clouds move
      g.clouds.forEach((cl) => {
        cl.x += cl.speed;
        if (cl.x > CANVAS_W + 100) cl.x = -150;
      });

      // Obstacle collision
      if (mode === "survival" && now - lastHitTime > 1500) {
        for (const ob of g.obstacles) {
          const dx = g.car.x - ob.x;
          const dy = g.car.y - ob.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < ob.size * 0.9) {
            g.lives--;
            g.car.speed *= -0.4;
            lastHitTime = now;
            setLives(g.lives);
            if (g.lives <= 0) {
              setScreen("gameover");
              cancelAnimationFrame(g.animId);
              return;
            }
            break;
          }
        }
      }

      // Win condition
      const pct = g.car.y / (FIELD_LENGTH - 100);
      setProgress(Math.min(1, pct));
      setElapsed(g.elapsed);
      if (g.car.y >= FIELD_LENGTH - 100) {
        setScreen("win");
        cancelAnimationFrame(g.animId);
        return;
      }

      // Draw
      drawScene(ctx);
      g.animId = requestAnimationFrame(loop);
    };

    g.animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(g.animId);
      window.removeEventListener("keydown", (e) => onKey(e, true));
      window.removeEventListener("keyup", (e) => onKey(e, false));
    };
  }, [screen, drawScene, mode]);

  if (screen === "menu") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0a1f0a 0%, #0d2e18 40%, #1a3a1a 100%)" }}>
        {/* Atmospheric background */}
        <div className="absolute inset-0 pointer-events-none">
          <div style={{
            position: "absolute", top: "8%", left: "10%", width: 320, height: 80,
            background: "radial-gradient(ellipse, #ffffff18 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(8px)"
          }} />
          <div style={{
            position: "absolute", top: "12%", right: "15%", width: 200, height: 55,
            background: "radial-gradient(ellipse, #ffffff12 0%, transparent 70%)",
            borderRadius: "50%", filter: "blur(6px)"
          }} />
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
            background: "linear-gradient(to top, #1a4a0a44, transparent)"
          }} />
          {/* Stars */}
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 45}%`,
              width: 2, height: 2,
              background: "#fff",
              borderRadius: "50%",
              opacity: 0.4 + Math.random() * 0.5,
            }} />
          ))}
        </div>

        <div className="relative z-10 text-center px-6" style={{ animation: "fadeUp 0.8s ease both" }}>
          <div style={{
            fontSize: 14, letterSpacing: 8, color: "#4ade8088", fontFamily: "Oswald",
            marginBottom: 12, textTransform: "uppercase"
          }}>
            ПОЕХАЛИ — ГОНКА
          </div>
          <h1 style={{
            fontFamily: "Oswald, sans-serif",
            fontSize: "clamp(52px, 8vw, 96px)",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1,
            textShadow: "0 0 60px #4ade8055, 0 4px 30px #00000088",
            marginBottom: 8,
          }}>
            ПОЛЕ
          </h1>
          <p style={{
            fontFamily: "Rubik, sans-serif",
            fontSize: 18,
            color: "#ffffffaa",
            marginBottom: 52,
            fontWeight: 300,
          }}>
            Проедь всё поле и победи
          </p>

          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 44 }}>
            {MODES.map((m) => (
              <button key={m.id}
                onClick={() => setSelectedMode(m.id)}
                style={{
                  fontFamily: "Oswald, sans-serif",
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: 2,
                  padding: "18px 28px",
                  borderRadius: 12,
                  border: selectedMode === m.id ? `2px solid ${m.color}` : "2px solid #ffffff22",
                  background: selectedMode === m.id ? `${m.color}22` : "#ffffff08",
                  color: selectedMode === m.id ? m.color : "#ffffffaa",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  minWidth: 160,
                  backdropFilter: "blur(10px)",
                }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>
                  {m.id === "classic" ? "🌿" : m.id === "race" ? "⚡" : "💀"}
                </div>
                {m.label}
                <div style={{ fontSize: 12, fontFamily: "Rubik", fontWeight: 300, marginTop: 6, opacity: 0.8 }}>
                  {m.desc}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => startGame(selectedMode)}
            style={{
              fontFamily: "Oswald, sans-serif",
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 4,
              padding: "18px 64px",
              borderRadius: 14,
              border: "none",
              background: "linear-gradient(135deg, #4ade80, #22c55e)",
              color: "#0a1f0a",
              cursor: "pointer",
              boxShadow: "0 8px 40px #4ade8055",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.transform = "scale(1.05)";
              (e.target as HTMLElement).style.boxShadow = "0 12px 50px #4ade8077";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.transform = "scale(1)";
              (e.target as HTMLElement).style.boxShadow = "0 8px 40px #4ade8055";
            }}>
            СТАРТ
          </button>

          <div style={{ marginTop: 40, color: "#ffffff44", fontSize: 13, fontFamily: "Rubik" }}>
            ↑↓ разгон/тормоз &nbsp;·&nbsp; ←→ поворот
          </div>
        </div>

        <style>{`
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (screen === "win") {
    const mins = Math.floor(elapsed / 60000).toString().padStart(2, "0");
    const secs = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, "0");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: "linear-gradient(160deg, #0a1f0a 0%, #0d3020 60%, #1a4520 100%)" }}>
        <div style={{ textAlign: "center", animation: "winBounce 0.6s cubic-bezier(.36,.07,.19,.97) both" }}>
          <div style={{ fontSize: 80, marginBottom: 16 }}>🏆</div>
          <h1 style={{
            fontFamily: "Oswald, sans-serif", fontSize: 72, fontWeight: 700, color: "#facc15",
            textShadow: "0 0 80px #facc1566", marginBottom: 8
          }}>ПОБЕДА!</h1>
          <p style={{ fontFamily: "Rubik", fontSize: 20, color: "#ffffffaa", marginBottom: 8 }}>
            Ты проехал всё поле!
          </p>
          {mode === "race" && (
            <p style={{ fontFamily: "Oswald", fontSize: 36, color: "#4ade80", margin: "16px 0" }}>
              ⏱ {mins}:{secs}
            </p>
          )}
          <div style={{
            display: "inline-block", marginTop: 8, marginBottom: 40,
            padding: "12px 32px", background: "#facc1522", borderRadius: 12,
            color: "#facc15", fontFamily: "Oswald", fontSize: 18, letterSpacing: 2
          }}>
            {mode === "classic" ? "🌿 КЛАССИКА" : mode === "race" ? "⚡ ГОНКА" : "💀 ВЫЖИВАНИЕ"}
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <button onClick={() => startGame(mode)} style={{
              fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 3,
              padding: "16px 48px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #4ade80, #22c55e)",
              color: "#0a1f0a", cursor: "pointer", boxShadow: "0 6px 30px #4ade8044"
            }}>ИГРАТЬ СНОВА</button>
            <button onClick={() => setScreen("menu")} style={{
              fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 3,
              padding: "16px 48px", borderRadius: 12,
              border: "2px solid #ffffff44", background: "#ffffff0a",
              color: "#ffffffcc", cursor: "pointer"
            }}>МЕНЮ</button>
          </div>
        </div>
        <style>{`
          @keyframes winBounce {
            0% { opacity: 0; transform: scale(0.7) translateY(40px); }
            60% { transform: scale(1.06) translateY(-8px); }
            100% { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (screen === "gameover") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center"
        style={{ background: "linear-gradient(160deg, #1a0a0a 0%, #2d1010 100%)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 72, marginBottom: 16 }}>💀</div>
          <h1 style={{
            fontFamily: "Oswald, sans-serif", fontSize: 64, fontWeight: 700, color: "#f87171",
            textShadow: "0 0 60px #f8717155", marginBottom: 16
          }}>КОНЕЦ!</h1>
          <p style={{ fontFamily: "Rubik", color: "#ffffffaa", fontSize: 18, marginBottom: 32 }}>
            Не удалось доехать до конца...
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <button onClick={() => startGame(mode)} style={{
              fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 3,
              padding: "16px 48px", borderRadius: 12, border: "none",
              background: "linear-gradient(135deg, #f87171, #ef4444)",
              color: "#fff", cursor: "pointer"
            }}>ПОВТОРИТЬ</button>
            <button onClick={() => setScreen("menu")} style={{
              fontFamily: "Oswald", fontWeight: 700, fontSize: 18, letterSpacing: 3,
              padding: "16px 48px", borderRadius: 12,
              border: "2px solid #ffffff44", background: "#ffffff0a",
              color: "#ffffffcc", cursor: "pointer"
            }}>МЕНЮ</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#0a1008" }}>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            display: "block",
            borderRadius: 16,
            boxShadow: "0 20px 80px #00000088",
            maxWidth: "100vw",
          }}
        />
        <button
          onClick={() => { cancelAnimationFrame(gameRef.current.animId); setScreen("menu"); }}
          style={{
            position: "absolute", top: 52, right: 12,
            fontFamily: "Oswald", fontSize: 12, letterSpacing: 2,
            padding: "6px 14px", borderRadius: 8,
            border: "1px solid #ffffff33", background: "#00000055",
            color: "#ffffffaa", cursor: "pointer"
          }}>
          МЕНЮ
        </button>
      </div>
      <div style={{ marginTop: 12, color: "#ffffff33", fontSize: 13, fontFamily: "Rubik" }}>
        ↑↓ разгон/тормоз &nbsp;·&nbsp; ←→ поворот
      </div>
    </div>
  );
}