'use client';

import { useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';

// Slow-scrolling parallax city skyline with digital wire connections.
// Three layers scroll at different speeds for depth. Seamlessly tiling.
// Fully theme-aware: switches between dark (night city) and light (day city)
// without restarting the animation loop.
export default function NetworkAnimation({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const isDarkRef = useRef(true);

  useEffect(() => {
    if (resolvedTheme) isDarkRef.current = resolvedTheme !== 'light';
  }, [resolvedTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const c: CanvasRenderingContext2D = ctx;

    let W = 0, H = 0, animId = 0;
    function resize() {
      if (!canvas) return;
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const TAU    = Math.PI * 2;
    const TILE_W = 3200; // tile width; drawn ×3 to always cover any screen

    // ── Seeded RNG ─────────────────────────────────────────────────────────────
    function mkRng(seed: number) {
      let s = seed >>> 0;
      return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0xFFFFFFFF; };
    }

    // ── Types ──────────────────────────────────────────────────────────────────
    interface Building {
      x: number; w: number; h: number;
      isHub: boolean;
      winCols: number; winRows: number;
      litMask: boolean[];
    }
    interface Pulse  { pos: number; speed: number; }
    interface Wire   { bi: number; bj: number; pulses: Pulse[]; }
    interface CLayer { buildings: Building[]; wires: Wire[]; }

    // ── City generation ────────────────────────────────────────────────────────
    function genCity(
      seed: number,
      minW: number, maxW: number,
      minH: number, maxH: number,
      minGap: number, maxGap: number,
      wireChance: number,
      drawWin: boolean,
    ): CLayer {
      const rng = mkRng(seed);
      const buildings: Building[] = [];
      let x = 0;
      while (x < TILE_W + maxW + maxGap) {
        x += minGap + rng() * (maxGap - minGap);
        const w = minW + rng() * (maxW - minW);
        const h = minH + rng() * (maxH - minH);
        const isHub = rng() > 0.73;
        const winCols = drawWin ? Math.max(1, Math.floor(w / 14)) : 0;
        const winRows = drawWin ? Math.max(1, Math.floor(h / 18)) : 0;
        const litMask = Array.from({ length: winCols * winRows }, () => rng() > 0.33);
        buildings.push({ x, w, h, isHub, winCols, winRows, litMask });
        x += w;
      }
      const wires: Wire[] = [];
      for (let i = 0; i + 1 < buildings.length; i++) {
        if (rng() > wireChance) continue;
        const nP = rng() > 0.45 ? 1 : 2;
        wires.push({
          bi: i, bj: i + 1,
          pulses: Array.from({ length: nP }, () => ({
            pos:   rng(),
            speed: 0.028 + rng() * 0.042,
          })),
        });
      }
      return { buildings, wires };
    }

    //           seed        minW maxW  minH  maxH  minGap maxGap  wire%   windows
    const LAYERS: CLayer[] = [
      genCity(0x1A2B3C,  14,  40,   30,  105,   6,   20,  0.42,  false), // far
      genCity(0x4D5E6F,  30,  78,   70,  195,  10,   36,  0.50,  true),  // mid
      genCity(0x8F9AA0,  52, 125,  130,  300,  15,   52,  0.46,  true),  // near
    ];

    // Scroll offsets (px) and speeds (px/s) — far = slowest, near = fastest
    const off = [0, 0, 0];
    const SPD = [5.5, 13, 26];
    let lastT = 0;

    // Stars for dark mode
    const rngS = mkRng(0xDEADBEEF);
    const STARS = Array.from({ length: 110 }, () => ({
      x: rngS(), y: rngS() * 0.62,
      r: 0.18 + rngS() * 0.65,
      a: 0.04  + rngS() * 0.22,
      ph: rngS() * TAU,
    }));

    // ── Palettes ───────────────────────────────────────────────────────────────
    const D = {
      skyTop: '#05080e', skyBot: '#0b1726',
      gnd: ['rgba(5,16,50,0.82)', 'rgba(2,8,26,0.96)'],
      gndLine: 'rgba(28,88,220,0.45)',
      bFill:  ['rgba(12,26,70,',  'rgba(8,18,56,',  'rgba(5,13,42,'],
      win:    ['rgba(90,175,255,', 'rgba(70,200,255,', 'rgba(100,220,255,'],
      wire:   ['rgba(40,140,255,', 'rgba(20,160,255,', 'rgba(10,180,255,'],
      pulse:  ['rgba(160,220,255,', 'rgba(190,235,255,', 'rgba(220,248,255,'],
      vig: 'rgba(0,0,0,',
      star: 'rgba(200,220,255,',
    };
    const L = {
      skyTop: '#aec8e8', skyBot: '#c8dff5',
      gnd: ['rgba(60,100,175,0.60)', 'rgba(40,80,158,0.45)'],
      gndLine: 'rgba(40,90,200,0.55)',
      bFill:  ['rgba(100,130,185,', 'rgba(55,85,155,',  'rgba(28,52,120,'],
      win:    ['rgba(200,220,255,',  'rgba(180,210,255,', 'rgba(160,200,255,'],
      wire:   ['rgba(50,110,220,',   'rgba(30,90,210,',   'rgba(14,72,200,'],
      pulse:  ['rgba(20,70,210,',    'rgba(10,58,200,',   'rgba(0,44,185,'],
      vig: 'rgba(255,255,255,',
      star: '',
    };

    // ── Draw: sky + stars ──────────────────────────────────────────────────────
    function drawSky(dk: boolean, now: number) {
      const P = dk ? D : L;
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, P.skyTop);
      g.addColorStop(1, P.skyBot);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      if (dk) {
        for (const s of STARS) {
          const tw = 0.55 + 0.45 * Math.sin(now * 0.00075 + s.ph);
          c.beginPath();
          c.arc(s.x * W, s.y * H, s.r, 0, TAU);
          c.fillStyle = `${D.star}${(s.a * tw).toFixed(3)})`;
          c.fill();
        }
      }
    }

    // ── Draw: ground plane ─────────────────────────────────────────────────────
    function drawGround(dk: boolean, hy: number) {
      const P = dk ? D : L;
      const gg = c.createLinearGradient(0, hy, 0, H);
      gg.addColorStop(0, P.gnd[0]);
      gg.addColorStop(1, P.gnd[1]);
      c.fillStyle = gg;
      c.fillRect(0, hy, W, H - hy);
    }

    // ── Draw: horizon glow line ────────────────────────────────────────────────
    function drawHorizon(dk: boolean, hy: number) {
      const P = dk ? D : L;
      c.save();
      c.strokeStyle = P.gndLine;
      c.lineWidth   = 1;
      if (dk) { c.shadowColor = 'rgba(30,100,255,0.5)'; c.shadowBlur = 7; }
      c.beginPath();
      c.moveTo(0, hy);
      c.lineTo(W, hy);
      c.stroke();
      c.restore();
    }

    // ── Draw: one city layer ───────────────────────────────────────────────────
    function drawLayer(
      li: number, layer: CLayer,
      offset: number, hy: number,
      alpha: number, dk: boolean,
    ) {
      const P  = dk ? D : L;
      const fb = P.bFill[li];
      const wb = P.win[li];
      const wr = P.wire[li];
      const pu = P.pulse[li];

      for (let rep = -1; rep <= 1; rep++) {
        const dx = rep * TILE_W - offset;
        if (dx > W + 160 || dx + TILE_W < -160) continue;

        // ── Buildings ────────────────────────────────────────────────────────
        for (const b of layer.buildings) {
          const bx = b.x + dx;
          if (bx + b.w < -4 || bx > W + 4) continue;
          const by = hy - b.h;

          // Body
          c.save();
          c.globalAlpha = alpha;
          c.fillStyle = `${fb}1)`;
          c.fillRect(bx, by, b.w, b.h);
          // Rooftop accent line
          c.strokeStyle = `${wr}0.2)`;
          c.lineWidth   = 0.5;
          c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + b.w, by); c.stroke();
          c.restore();

          // Windows
          if (b.winCols > 0 && b.winRows > 0) {
            const cw = b.w / b.winCols;
            const rh = (b.h - 10) / b.winRows;
            c.save();
            c.globalAlpha = alpha * 0.65;
            for (let row = 0; row < b.winRows; row++) {
              for (let col = 0; col < b.winCols; col++) {
                if (!b.litMask[row * b.winCols + col]) continue;
                const wx = bx + col * cw + cw * 0.2;
                const wy = by + 6 + row * rh + rh * 0.15;
                const ww = cw * 0.6, wh = rh * 0.6;
                if (ww < 0.5 || wh < 0.5) continue;
                c.fillStyle = `${wb}0.7)`;
                c.fillRect(wx, wy, ww, wh);
              }
            }
            c.restore();
          }

          // Antenna spire on hub buildings
          if (b.isHub) {
            const sh = Math.max(8, b.h * 0.13);
            c.save();
            c.globalAlpha = alpha * 0.85;
            c.strokeStyle = `${wr}0.85)`;
            c.lineWidth   = 1.2;
            if (dk) { c.shadowColor = `${pu}0.5)`; c.shadowBlur = 5; }
            c.beginPath();
            c.moveTo(bx + b.w / 2, by);
            c.lineTo(bx + b.w / 2, by - sh);
            c.stroke();
            c.fillStyle = `${pu}${dk ? '0.95' : '0.82'})`;
            if (dk) c.shadowBlur = 8;
            c.beginPath();
            c.arc(bx + b.w / 2, by - sh, 1.6, 0, TAU);
            c.fill();
            c.restore();
          }
        }

        // ── Wires ────────────────────────────────────────────────────────────
        for (const wire of layer.wires) {
          const bA = layer.buildings[wire.bi];
          const bB = layer.buildings[wire.bj];
          if (!bA || !bB) continue;
          const x1 = bA.x + dx + bA.w / 2, y1 = hy - bA.h;
          const x2 = bB.x + dx + bB.w / 2, y2 = hy - bB.h;
          if (x1 < -60 && x2 < -60) continue;
          if (x1 > W + 60 && x2 > W + 60) continue;

          // Wire line
          c.save();
          c.globalAlpha = alpha * 0.52;
          c.strokeStyle = `${wr}0.8)`;
          c.lineWidth   = 0.85;
          if (dk) { c.shadowColor = `${wr}0.3)`; c.shadowBlur = 3; }
          c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
          c.restore();

          // Pulses traveling along the wire
          for (const pulse of wire.pulses) {
            const px   = x1 + (x2 - x1) * pulse.pos;
            const py   = y1 + (y2 - y1) * pulse.pos;
            if (px < -10 || px > W + 10) continue;
            const bell = Math.sin(pulse.pos * Math.PI); // fade at endpoints
            if (bell < 0.05) continue;

            c.save();
            c.globalAlpha = alpha * bell * 0.92;
            if (dk) { c.shadowColor = `${pu}0.9)`; c.shadowBlur = 7; }
            c.fillStyle = `${pu}${dk ? '0.96' : '0.86'})`;
            c.beginPath(); c.arc(px, py, 2.1, 0, TAU); c.fill();
            // Trailing tail
            for (let s = 1; s <= 4; s++) {
              const tp = Math.max(0, pulse.pos - s * 0.017);
              const tx = x1 + (x2 - x1) * tp;
              const ty = y1 + (y2 - y1) * tp;
              c.globalAlpha = alpha * bell * (1 - s / 5) * 0.32;
              c.beginPath();
              c.arc(tx, ty, Math.max(0.3, 1.5 - s * 0.22), 0, TAU);
              c.fill();
            }
            c.restore();
          }
        }
      }
    }

    // ── Draw: edge vignette ────────────────────────────────────────────────────
    function drawVignette(dk: boolean) {
      const vc = dk ? 'rgba(0,0,0,' : 'rgba(215,230,248,';
      // Radial edge fade
      const vg = c.createRadialGradient(W / 2, H / 2, H * 0.12, W / 2, H / 2, H * 0.78);
      vg.addColorStop(0, `${vc}0)`);
      vg.addColorStop(1, `${vc}0.42)`);
      c.fillStyle = vg;
      c.fillRect(0, 0, W, H);
      // Top fade
      const tg = c.createLinearGradient(0, 0, 0, H * 0.27);
      tg.addColorStop(0, `${vc}0.52)`);
      tg.addColorStop(1, `${vc}0)`);
      c.fillStyle = tg;
      c.fillRect(0, 0, W, H * 0.27);
      // Bottom fade
      const bg = c.createLinearGradient(0, H * 0.82, 0, H);
      bg.addColorStop(0, `${vc}0)`);
      bg.addColorStop(1, `${vc}0.55)`);
      c.fillStyle = bg;
      c.fillRect(0, H * 0.82, W, H * 0.18);
    }

    // ── Main loop ──────────────────────────────────────────────────────────────
    function loop(now: number) {
      animId = requestAnimationFrame(loop);
      const dt = Math.min(now - lastT, 50); // cap delta to avoid jump on tab refocus
      lastT   = now;
      const dk = isDarkRef.current;

      // Advance scroll offsets + pulse positions
      for (let i = 0; i < 3; i++) {
        off[i] = (off[i] + SPD[i] * dt / 1000) % TILE_W;
        for (const w of LAYERS[i].wires)
          for (const p of w.pulses)
            p.pos = (p.pos + p.speed * dt / 1000) % 1;
      }

      const hy     = H * 0.72;
      const ALPHAS = dk ? [0.72, 0.87, 1.0] : [0.68, 0.85, 1.0];

      drawSky(dk, now);
      drawGround(dk, hy);
      drawLayer(0, LAYERS[0], off[0], hy, ALPHAS[0], dk); // far
      drawLayer(1, LAYERS[1], off[1], hy, ALPHAS[1], dk); // mid
      drawHorizon(dk, hy);
      drawLayer(2, LAYERS[2], off[2], hy, ALPHAS[2], dk); // near
      drawVignette(dk);
    }

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%' }}
    />
  );
}
