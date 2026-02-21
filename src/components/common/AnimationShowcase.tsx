"use client";

import { Box, Typography } from "@mui/joy";
import { useEffect, useMemo, useRef, useState } from "react";

// ─── Constants ──────────────────────────────────────────────────────────────────
const NUM_PARTICLES = 400;
const PHASE_DURATION = 6000;
const CANVAS_W = 300;
const CANVAS_H = 500;
const TEAL = "112,163,169";
const LIGHT_TEAL = "175,204,207";

type Point = { x: number; y: number };

interface LabelDef {
  x: number;
  y: number;
  text: string;
  targetX: number;
  delay: number;
}

// ─── Item Configurations ────────────────────────────────────────────────────────
interface ItemConfig {
  name: string;
  leftLabels: string[];
  rightLabels: string[];
  sections: Array<{ y: number; xL: number; xR: number }>;
  extras?: () => Point[];
}

const ITEM_CONFIGS: ItemConfig[] = [
  // ── Wine Glass (Bordeaux) ─────────────────────────────────────────────────
  {
    name: "Wine",
    leftLabels: ["Varietal", "Region", "Vintage"],
    rightLabels: ["ABV", "Score", "Price"],
    sections: [
      // Rim — wide opening, almost as wide as bowl
      { y: 55, xL: 105, xR: 195 },
      // Bowl — gentle U-shape, not spherical
      { y: 70, xL: 100, xR: 200 },
      { y: 90, xL: 97, xR: 203 },
      { y: 115, xL: 96, xR: 204 },
      { y: 145, xL: 98, xR: 202 },
      { y: 175, xL: 104, xR: 196 },
      { y: 200, xL: 118, xR: 182 },
      { y: 220, xL: 135, xR: 165 },
      // Bowl bottom → stem transition
      { y: 232, xL: 143, xR: 157 },
      { y: 240, xL: 146, xR: 154 },
      // Stem — thin and long
      { y: 248, xL: 146, xR: 154 },
      { y: 350, xL: 146, xR: 154 },
      // Transition to base
      { y: 358, xL: 146, xR: 154 },
      { y: 365, xL: 140, xR: 160 },
      // Base — wide and flat
      { y: 380, xL: 122, xR: 178 },
      { y: 392, xL: 112, xR: 188 },
      { y: 400, xL: 112, xR: 188 },
      { y: 406, xL: 115, xR: 185 },
    ],
  },
  // ── Nonic Pint Glass ──────────────────────────────────────────────────────
  {
    name: "Beer",
    leftLabels: ["Style", "Brewery", "ABV"],
    rightLabels: ["IBU", "Score", "Price"],
    sections: [
      // Rim
      { y: 50, xL: 97, xR: 203 },
      // Nonic bulge near top
      { y: 60, xL: 93, xR: 207 },
      { y: 72, xL: 91, xR: 209 },
      { y: 86, xL: 94, xR: 206 },
      // Body tapers gradually
      { y: 110, xL: 98, xR: 202 },
      { y: 160, xL: 104, xR: 196 },
      { y: 220, xL: 110, xR: 190 },
      { y: 280, xL: 116, xR: 184 },
      { y: 340, xL: 121, xR: 179 },
      { y: 390, xL: 125, xR: 175 },
      // Base — slight flare
      { y: 420, xL: 127, xR: 173 },
      { y: 435, xL: 126, xR: 174 },
      { y: 442, xL: 124, xR: 176 },
    ],
    extras: () => {
      const pts: Point[] = [];
      // Foam head — wavy froth above rim
      for (let i = 0; i < 18; i++) {
        const t = i / 17;
        const x = 99 + t * 102;
        const y =
          49 - Math.abs(Math.sin(t * Math.PI * 4.5)) * 9 - Math.random() * 3;
        pts.push({ x, y });
      }
      return pts;
    },
  },
  // ── Martini Glass ─────────────────────────────────────────────────────────
  {
    name: "Cocktail",
    leftLabels: ["Spirit", "Method", "Garnish"],
    rightLabels: ["Glass", "Level", "Recipe"],
    sections: [
      // Wide rim
      { y: 70, xL: 58, xR: 242 },
      { y: 78, xL: 64, xR: 236 },
      // V-bowl tapers smoothly
      { y: 96, xL: 82, xR: 218 },
      { y: 118, xL: 102, xR: 198 },
      { y: 140, xL: 120, xR: 180 },
      { y: 158, xL: 134, xR: 166 },
      { y: 172, xL: 142, xR: 158 },
      // Bowl bottom → stem transition
      { y: 182, xL: 145, xR: 155 },
      { y: 190, xL: 146, xR: 154 },
      // Stem — base is handled via extras to avoid spline bell curve
      { y: 200, xL: 146, xR: 154 },
      { y: 340, xL: 146, xR: 154 },
    ],
    extras: () => {
      const pts: Point[] = [];
      // Toothpick across rim
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        pts.push({ x: 110 + t * 60, y: 66 + t * 12 });
      }
      // Olive (circle)
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        pts.push({
          x: 140 + Math.cos(angle) * 8,
          y: 72 + Math.sin(angle) * 8,
        });
      }
      // Stem extension below sections (bypasses spline)
      for (let i = 1; i <= 5; i++) {
        const y = 340 + i * 10;
        pts.push({ x: 148, y });
        pts.push({ x: 152, y });
      }
      // Base disc — manually placed flat shape (no spline)
      const cx = 150;
      const hw = 42;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push({ x: cx - hw + t * hw * 2, y: 394 });
      }
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        pts.push({ x: cx - hw * 0.85 + t * hw * 1.7, y: 401 });
      }
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push({ x: cx - hw + t * hw * 2, y: 408 });
      }
      pts.push({ x: cx - hw, y: 397 });
      pts.push({ x: cx - hw, y: 404 });
      pts.push({ x: cx + hw, y: 397 });
      pts.push({ x: cx + hw, y: 404 });
      return pts;
    },
  },
  // ── Coffee Mug ────────────────────────────────────────────────────────────
  {
    name: "Coffee",
    leftLabels: ["Origin", "Roast", "Process"],
    rightLabels: ["Altitude", "Flavor", "Score"],
    sections: [
      // Rim — wide mouth, offset left for handle
      { y: 175, xL: 76, xR: 200 },
      { y: 184, xL: 74, xR: 202 },
      // Body — short and stout, gentle taper
      { y: 200, xL: 75, xR: 201 },
      { y: 240, xL: 76, xR: 200 },
      { y: 300, xL: 78, xR: 198 },
      { y: 350, xL: 82, xR: 194 },
      { y: 385, xL: 88, xR: 188 },
      { y: 405, xL: 94, xR: 182 },
      // Base — flat bottom
      { y: 418, xL: 98, xR: 178 },
      { y: 424, xL: 100, xR: 176 },
    ],
    extras: () => {
      const pts: Point[] = [];
      // Handle — D-shape on right side
      for (let i = 0; i < 22; i++) {
        const t = i / 21;
        const angle = -Math.PI * 0.5 + t * Math.PI;
        pts.push({
          x: 202 + Math.cos(angle) * 28,
          y: 285 + Math.sin(angle) * 55,
        });
      }
      // Steam wisps — 3 curving columns
      for (let w = 0; w < 3; w++) {
        const baseX = 110 + w * 30;
        for (let i = 0; i < 8; i++) {
          const t = i / 7;
          pts.push({
            x: baseX + Math.sin(t * Math.PI * 2 + w * 1.5) * 8,
            y: 173 - t * 55,
          });
        }
      }
      return pts;
    },
  },
  // ── Whiskey Bottle ────────────────────────────────────────────────────────
  {
    name: "Spirit",
    leftLabels: ["Type", "Distiller", "Age"],
    rightLabels: ["Proof", "Region", "Price"],
    sections: [
      // Cap — subtle flare
      { y: 25, xL: 142, xR: 158 },
      { y: 33, xL: 139, xR: 161 },
      { y: 38, xL: 138, xR: 162 },
      // Neck — smooth transition, no pinch
      { y: 45, xL: 141, xR: 159 },
      { y: 50, xL: 142, xR: 158 },
      { y: 80, xL: 142, xR: 158 },
      // Shoulder — angular transition
      { y: 95, xL: 138, xR: 162 },
      { y: 108, xL: 125, xR: 175 },
      { y: 118, xL: 108, xR: 192 },
      { y: 130, xL: 93, xR: 207 },
      // Body — wide rectangle
      { y: 145, xL: 87, xR: 213 },
      { y: 250, xL: 87, xR: 213 },
      { y: 370, xL: 87, xR: 213 },
      // Base — flat bottom, extras add dense edge
      { y: 420, xL: 87, xR: 213 },
      { y: 445, xL: 87, xR: 213 },
    ],
    extras: () => {
      const pts: Point[] = [];
      // Dense bottom edge for visible flat base
      for (let i = 0; i <= 14; i++) {
        const t = i / 14;
        pts.push({ x: 87 + t * 126, y: 445 });
      }
      // Second row slightly above for thickness
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        pts.push({ x: 87 + t * 126, y: 441 });
      }
      return pts;
    },
  },
  // ── Sake Tokkuri Flask ────────────────────────────────────────────────────
  {
    name: "Sake",
    leftLabels: ["Grade", "Region", "Rice"],
    rightLabels: ["SMV", "Polish", "Score"],
    sections: [
      // Mouth — small opening
      { y: 40, xL: 139, xR: 161 },
      { y: 50, xL: 142, xR: 158 },
      // Neck — narrowest point
      { y: 68, xL: 144, xR: 156 },
      { y: 82, xL: 144, xR: 156 },
      // Neck flares into body
      { y: 100, xL: 142, xR: 158 },
      { y: 120, xL: 136, xR: 164 },
      { y: 145, xL: 126, xR: 174 },
      { y: 175, xL: 113, xR: 187 },
      // Bulbous body — widest
      { y: 210, xL: 100, xR: 200 },
      { y: 250, xL: 91, xR: 209 },
      { y: 290, xL: 87, xR: 213 },
      { y: 320, xL: 86, xR: 214 },
      { y: 345, xL: 88, xR: 212 },
      // Taper to base
      { y: 370, xL: 94, xR: 206 },
      { y: 395, xL: 105, xR: 195 },
      { y: 418, xL: 116, xR: 184 },
      { y: 435, xL: 122, xR: 178 },
      // Base — flat
      { y: 445, xL: 124, xR: 176 },
      { y: 450, xL: 123, xR: 177 },
    ],
  },
];

// ─── Spline Interpolation ───────────────────────────────────────────────────────
function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
): number {
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)
  );
}

// ─── Shape Generation ───────────────────────────────────────────────────────────
function generatePoints(
  sections: Array<{ y: number; xL: number; xR: number }>,
  extras: Point[] = [],
): Point[] {
  const points: Point[] = [];
  const sorted = [...sections].sort((a, b) => a.y - b.y);
  const n = sorted.length;

  // Outline points using Catmull-Rom spline for smooth curves
  for (let i = 0; i < n - 1; i++) {
    const p0 = sorted[Math.max(0, i - 1)];
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    const p3 = sorted[Math.min(n - 1, i + 2)];
    // Skip dense interpolation for perfectly straight segments
    const allSameWidth =
      p0.xL === p1.xL &&
      p1.xL === p2.xL &&
      p2.xL === p3.xL &&
      p0.xR === p1.xR &&
      p1.xR === p2.xR &&
      p2.xR === p3.xR;
    const steps = allSameWidth
      ? 1
      : Math.max(3, Math.min(10, Math.round((p2.y - p1.y) / 6)));
    for (let j = 0; j <= steps; j++) {
      const t = j / steps;
      const y = p1.y + t * (p2.y - p1.y);
      const xL = catmullRom(p0.xL, p1.xL, p2.xL, p3.xL, t);
      const xR = catmullRom(p0.xR, p1.xR, p2.xR, p3.xR, t);
      points.push({ x: xL, y });
      points.push({ x: xR, y });
    }
  }

  // Top and bottom edge fill — count proportional to width
  const top = sorted[0];
  const bot = sorted[n - 1];
  const topCount = Math.max(6, Math.round((top.xR - top.xL) / 8));
  const botCount = Math.max(6, Math.round((bot.xR - bot.xL) / 8));
  for (let i = 0; i < topCount; i++) {
    const t = i / (topCount - 1);
    points.push({ x: top.xL + t * (top.xR - top.xL), y: top.y });
  }
  for (let i = 0; i < botCount; i++) {
    const t = i / (botCount - 1);
    points.push({ x: bot.xL + t * (bot.xR - bot.xL), y: bot.y });
  }

  // Extras (handles, steam, olive, foam, etc.)
  points.push(...extras);

  // Fill interior — use spline-interpolated boundaries
  const yMin = sorted[0].y;
  const yMax = sorted[n - 1].y;
  while (points.length < NUM_PARTICLES) {
    const y = yMin + Math.random() * (yMax - yMin);
    let segIdx = 0;
    for (let k = 0; k < n - 1; k++) {
      if (y >= sorted[k].y && y <= sorted[k + 1].y) {
        segIdx = k;
        break;
      }
    }
    const p0 = sorted[Math.max(0, segIdx - 1)];
    const p1 = sorted[segIdx];
    const p2 = sorted[segIdx + 1];
    const p3 = sorted[Math.min(n - 1, segIdx + 2)];
    const t = p2.y === p1.y ? 0 : (y - p1.y) / (p2.y - p1.y);
    const xL = catmullRom(p0.xL, p1.xL, p2.xL, p3.xL, t);
    const xR = catmullRom(p0.xR, p1.xR, p2.xR, p3.xR, t);
    points.push({ x: xL + Math.random() * (xR - xL), y });
  }

  return points.slice(0, NUM_PARTICLES);
}

function makeLabels(left: string[], right: string[]): LabelDef[] {
  const labels: LabelDef[] = [];
  left.forEach((text, i) => {
    labels.push({ x: 32, y: 165 + i * 70, text, targetX: 78, delay: i * 0.12 });
  });
  right.forEach((text, i) => {
    labels.push({ x: 268, y: 195 + i * 70, text, targetX: 222, delay: (i + 0.5) * 0.12 });
  });
  return labels;
}

function computeNeighbors(points: Point[]): number[][] {
  const neighbors: number[][] = [];
  for (let i = 0; i < points.length; i++) {
    const dists: Array<{ j: number; d: number }> = [];
    for (let j = 0; j < points.length; j++) {
      if (j === i) continue;
      const d = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (d < 35) dists.push({ j, d });
    }
    dists.sort((a, b) => a.d - b.d);
    neighbors.push(dists.slice(0, 3).map((d) => d.j));
  }
  return neighbors;
}

function normalizeAndSort(points: Point[]): Point[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const indexed = points.map((p) => ({
    nx: (p.x - xMin) / xRange,
    ny: (p.y - yMin) / yRange,
    original: p,
  }));

  indexed.sort((a, b) => {
    if (Math.abs(a.ny - b.ny) > 0.025) return a.ny - b.ny;
    return a.nx - b.nx;
  });

  return indexed.map((item) => item.original);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// ─── Draw Context ───────────────────────────────────────────────────────────────
interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  positions: Point[];
  toPoints: Point[];
  easedMorph: number;
  visibility: number;
  isAssembled: boolean;
  now: number;
  holdT: number;
  labels: LabelDef[];
  typeName: string;
  neighbors: number[][];
}

// ─── Shared Label Drawing ───────────────────────────────────────────────────────
function drawLabels(d: DrawCtx) {
  const { ctx, holdT, labels, typeName } = d;
  if (holdT < 0) return;

  const labelFade =
    holdT > 1 ? Math.max(0, 1 - (holdT - 1) * 2) : Math.min(1, holdT * 4);

  ctx.font = "9px monospace";
  for (const dl of labels) {
    const t = Math.max(0, Math.min(1, labelFade - dl.delay));
    if (t <= 0) continue;

    const alpha = t * 0.8;
    const isLeft = dl.x < 150;
    const textW = ctx.measureText(dl.text).width;

    // Position text flush to canvas edge, dot between text and shape
    let textX: number;
    let dotX: number;
    if (isLeft) {
      ctx.textAlign = "left";
      textX = 4;
      dotX = textX + textW + 5;
    } else {
      ctx.textAlign = "right";
      textX = CANVAS_W - 4;
      dotX = textX - textW - 5;
    }

    // Dashed leader line from shape to dot
    ctx.strokeStyle = `rgba(${TEAL}, ${alpha * 0.5})`;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(dl.targetX, dl.y);
    ctx.lineTo(dotX, dl.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dot
    ctx.beginPath();
    ctx.arc(dotX, dl.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${LIGHT_TEAL}, ${alpha})`;
    ctx.fill();

    // Text
    ctx.fillStyle = `rgba(${TEAL}, ${alpha})`;
    ctx.fillText(dl.text, textX, dl.y + 3);
  }

  const nameAlpha =
    holdT > 1 ? Math.max(0, 1 - (holdT - 1) * 2) : Math.min(1, holdT * 3);
  if (nameAlpha > 0) {
    ctx.font = "bold 13px monospace";
    ctx.fillStyle = `rgba(${LIGHT_TEAL}, ${nameAlpha * 0.5})`;
    ctx.textAlign = "center";
    ctx.fillText(typeName.toUpperCase(), CANVAS_W / 2, CANVAS_H - 10);
  }
}

// ─── Per-particle deterministic properties ──────────────────────────────────────
function particleProps(i: number) {
  const z = ((i * 7 + 13) % NUM_PARTICLES) / NUM_PARTICLES;
  const pulsePhase = i * 2.1 + 0.5;
  const pulseSpeed = 0.002 + (i % 7) * 0.0003;
  return { z, pulsePhase, pulseSpeed };
}

// ─── Draw: Constellation ────────────────────────────────────────────────────────
function drawConstellation(d: DrawCtx) {
  const { ctx, positions, toPoints, visibility, easedMorph, now, neighbors } = d;

  // Motion trails during morphs
  if (easedMorph < 0.95 && visibility > 0.3) {
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const { x, y } = positions[i];
      const dx = toPoints[i].x - x;
      const dy = toPoints[i].y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < 2) continue;

      const { z } = particleProps(i);
      const trailLen = Math.min(dist * 0.5, 14);
      const nx = -dx / dist;
      const ny = -dy / dist;

      ctx.strokeStyle = `rgba(${TEAL}, ${0.15 * visibility * (0.3 + z * 0.7)})`;
      ctx.lineWidth = 0.4 + z * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + nx * trailLen, y + ny * trailLen);
      ctx.stroke();
    }
  }

  // Constellation connections with glow
  if (visibility > 0.5) {
    const connAlpha = (visibility - 0.5) * 0.5;
    const drawn = new Set<number>();

    for (let i = 0; i < NUM_PARTICLES; i++) {
      for (const j of neighbors[i]) {
        const key = Math.min(i, j) * NUM_PARTICLES + Math.max(i, j);
        if (drawn.has(key)) continue;
        drawn.add(key);

        const p1 = positions[i];
        const p2 = positions[j];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (dist > 35) continue;
        const fade = 1 - dist / 35;

        ctx.strokeStyle = `rgba(${LIGHT_TEAL}, ${connAlpha * fade * 0.12})`;
        ctx.lineWidth = 1.5 + fade * 2;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(${TEAL}, ${connAlpha * fade * 0.5})`;
        ctx.lineWidth = 0.3 + fade * 0.7;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }
  }

  // Particles with depth, pulse, glow
  for (let i = 0; i < NUM_PARTICLES; i++) {
    const { x, y } = positions[i];
    const { z, pulsePhase, pulseSpeed } = particleProps(i);
    const baseSize = 0.6 + z * 2.2;
    const pulse = Math.sin(now * pulseSpeed + pulsePhase) * 0.3;
    const size = (baseSize + pulse) * (0.5 + visibility * 0.5);
    const alpha = (0.2 + z * 0.5) * visibility;

    if (z > 0.5 && visibility > 0.7) {
      ctx.beginPath();
      ctx.arc(x, y, size + 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${LIGHT_TEAL}, ${(z - 0.5) * 0.08 * visibility})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${TEAL}, ${alpha})`;
    ctx.fill();

    if (z > 0.7) {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${LIGHT_TEAL}, ${alpha * 0.6})`;
      ctx.fill();
    }
  }

  // Emission sparks
  if (visibility > 0.9) {
    const sparkCycle = 2800;
    const sparkT = (now % sparkCycle) / sparkCycle;
    const sparkIdx = Math.floor(now / sparkCycle) % NUM_PARTICLES;
    if (sparkT < 0.25) {
      const { x, y } = positions[sparkIdx];
      const progress = sparkT / 0.25;
      const sparkAlpha = (1 - progress) * 0.35;
      const sparkRadius = progress * 10;
      for (let r = 0; r < 6; r++) {
        const angle = (r / 6) * Math.PI * 2 + sparkIdx * 0.5;
        ctx.beginPath();
        ctx.arc(
          x + Math.cos(angle) * sparkRadius,
          y + Math.sin(angle) * sparkRadius,
          0.5 * (1 - progress),
          0,
          Math.PI * 2,
        );
        ctx.fillStyle = `rgba(${LIGHT_TEAL}, ${sparkAlpha})`;
        ctx.fill();
      }
    }
  }

  drawLabels(d);
}

// ─── Component ──────────────────────────────────────────────────────────────────
export function AnimationShowcase({
  statusText = "Scanning...",
}: { statusText?: string } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const nameRef = useRef(ITEM_CONFIGS[0].name);
  const [currentType, setCurrentType] = useState(ITEM_CONFIGS[0].name);

  const shapes = useMemo(
    () =>
      ITEM_CONFIGS.map((cfg) => {
        const points = normalizeAndSort(
          generatePoints(cfg.sections, cfg.extras?.() ?? []),
        );
        return {
          name: cfg.name,
          labels: makeLabels(cfg.leftLabels, cfg.rightLabels),
          points,
          neighbors: computeNeighbors(points),
        };
      }),
    [],
  );

  const scatterPoints = useMemo(
    () =>
      Array.from({ length: NUM_PARTICLES }, () => ({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
      })),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const startTime = performance.now();
    const totalCycle = shapes.length * PHASE_DURATION;
    const INITIAL_ASSEMBLE = 2200;

    const animate = (now: number) => {
      const rawElapsed = now - startTime;
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      let fromPoints: Point[];
      let toPoints: Point[];
      let morphT: number;
      let holdT: number;
      let currentLabels: LabelDef[];
      let typeName: string;
      let currentNeighbors: number[][];

      if (rawElapsed < INITIAL_ASSEMBLE) {
        fromPoints = scatterPoints;
        toPoints = shapes[0].points;
        morphT = rawElapsed / INITIAL_ASSEMBLE;
        holdT = -1;
        currentLabels = shapes[0].labels;
        typeName = shapes[0].name;
        currentNeighbors = shapes[0].neighbors;
      } else {
        const elapsed = (rawElapsed - INITIAL_ASSEMBLE) % totalCycle;
        const shapeIdx = Math.floor(elapsed / PHASE_DURATION);
        const prevIdx = (shapeIdx - 1 + shapes.length) % shapes.length;
        const phaseProgress = (elapsed % PHASE_DURATION) / PHASE_DURATION;

        typeName = shapes[shapeIdx].name;
        currentLabels = shapes[shapeIdx].labels;
        currentNeighbors = shapes[shapeIdx].neighbors;

        if (phaseProgress < 0.33) {
          fromPoints = shapes[prevIdx].points;
          toPoints = shapes[shapeIdx].points;
          morphT = phaseProgress / 0.33;
          holdT = -1;
        } else if (phaseProgress < 0.8) {
          fromPoints = shapes[shapeIdx].points;
          toPoints = shapes[shapeIdx].points;
          morphT = 1;
          holdT = (phaseProgress - 0.33) / 0.47;
        } else {
          fromPoints = shapes[shapeIdx].points;
          toPoints = shapes[shapeIdx].points;
          morphT = 1;
          holdT = 1 + (phaseProgress - 0.8) / 0.2;
        }
      }

      if (typeName !== nameRef.current) {
        nameRef.current = typeName;
        setCurrentType(typeName);
      }

      const easedMorph = easeInOutCubic(Math.min(1, Math.max(0, morphT)));
      const isAssembled = easedMorph > 0.95;
      const visibility = rawElapsed < INITIAL_ASSEMBLE ? easedMorph : 1;

      const positions: Point[] = new Array(NUM_PARTICLES);
      const scatterAmt = Math.sin(Math.min(1, morphT) * Math.PI) * 12;
      for (let i = 0; i < NUM_PARTICLES; i++) {
        let x = fromPoints[i].x + (toPoints[i].x - fromPoints[i].x) * easedMorph;
        let y = fromPoints[i].y + (toPoints[i].y - fromPoints[i].y) * easedMorph;
        if (scatterAmt > 0.1) {
          x += Math.sin(i * 1.7 + 0.3) * scatterAmt;
          y += Math.cos(i * 2.3 + 0.7) * scatterAmt;
        }
        if (isAssembled) {
          x += Math.sin(now * 0.0008 + i * 0.5) * 1.5;
          y += Math.cos(now * 0.001 + i * 0.7) * 1.5;
        }
        positions[i] = { x, y };
      }

      drawConstellation({
        ctx,
        positions,
        toPoints,
        easedMorph,
        visibility,
        isAssembled,
        now,
        holdT,
        labels: currentLabels,
        typeName,
        neighbors: currentNeighbors,
      });

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [shapes, scatterPoints]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "min(calc(100vh - 8rem), 600px)",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{ maxWidth: 260, maxHeight: "65vh" }}
          role="img"
          aria-label={`Scanning ${currentType}`}
        />
      </Box>

      <Box
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          bgcolor: "rgba(17,16,21,0.9)",
          backdropFilter: "blur(10px)",
          borderTop: "1px solid",
          borderColor: "neutral.800",
        }}
      >
        <Typography
          level="h4"
          sx={{
            color: "primary.300",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontSize: "0.85rem",
          }}
        >
          {statusText}
        </Typography>
      </Box>
    </Box>
  );
}
