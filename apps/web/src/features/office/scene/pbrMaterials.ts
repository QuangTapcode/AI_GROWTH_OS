'use client';

import * as THREE from 'three';

type TextureSet = {
  map: THREE.CanvasTexture;
  roughnessMap?: THREE.CanvasTexture;
  bumpMap?: THREE.CanvasTexture;
};

const textureCache = new Map<string, TextureSet>();
const screenTextureCache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return [canvas, canvas.getContext('2d')];
}

function finalizeTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  srgb = true
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic PRNG so architectural textures never shift across reloads. */
function seededNoise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type PbrSurfaceKind =
  | 'polishedConcrete'
  | 'quartzCorridor'
  | 'darkGranite'
  | 'naturalOak'
  | 'brushedAluminum'
  | 'acousticWall'
  | 'ceilingTile'
  | 'officeFabric'
  | 'asphalt'
  | 'sidewalkPaver';

export function getPbrTextureSet(kind: PbrSurfaceKind): TextureSet | null {
  if (typeof document === 'undefined') return null;
  const cached = textureCache.get(kind);
  if (cached) return cached;

  const rand = seededNoise(kind.length * 9173 + kind.charCodeAt(0) * 131);

  let set: TextureSet;

  switch (kind) {
    case 'polishedConcrete': {
      const [c, ctx] = makeCanvas(512, 512);
      const [r, rCtx] = makeCanvas(512, 512);
      if (ctx && rCtx) {
        ctx.fillStyle = '#dde3ea';
        ctx.fillRect(0, 0, 512, 512);
        rCtx.fillStyle = '#707070';
        rCtx.fillRect(0, 0, 512, 512);

        for (let i = 0; i < 4200; i++) {
          const x = rand() * 512;
          const y = rand() * 512;
          const sz = 1 + rand() * 4;
          const shade = 205 + Math.floor(rand() * 34);
          ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 7},0.22)`;
          ctx.fillRect(x, y, sz, sz);
          const rVal = 85 + Math.floor(rand() * 65);
          rCtx.fillStyle = `rgba(${rVal},${rVal},${rVal},0.3)`;
          rCtx.fillRect(x, y, sz * 1.4, sz * 1.4);
        }

        // Architectural expansion tile joints (2x2 grid per repeat)
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.38)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 255, 255);
        ctx.strokeRect(256, 1, 255, 255);
        ctx.strokeRect(1, 256, 255, 255);
        ctx.strokeRect(256, 256, 255, 255);
      }
      set = {
        map: finalizeTexture(c, 16, 12, true),
        roughnessMap: finalizeTexture(r, 16, 12, false),
      };
      break;
    }

    case 'quartzCorridor': {
      const [c, ctx] = makeCanvas(512, 512);
      if (ctx) {
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 2400; i++) {
          const x = rand() * 512;
          const y = rand() * 512;
          ctx.fillStyle = rand() > 0.5 ? 'rgba(203,213,225,0.28)' : 'rgba(255,255,255,0.4)';
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.45)';
        ctx.lineWidth = 2;
        for (let y = 0; y < 512; y += 128) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(512, y);
          ctx.stroke();
        }
      }
      set = { map: finalizeTexture(c, 12, 12, true) };
      break;
    }

    case 'darkGranite': {
      const [c, ctx] = makeCanvas(512, 512);
      const [r, rCtx] = makeCanvas(512, 512);
      if (ctx && rCtx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 512, 512);
        rCtx.fillStyle = '#3a3a3a';
        rCtx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 3600; i++) {
          const x = rand() * 512;
          const y = rand() * 512;
          const b = 20 + Math.floor(rand() * 42);
          ctx.fillStyle = `rgba(${b},${b + 8},${b + 20},0.45)`;
          ctx.fillRect(x, y, 2 + rand() * 3, 2 + rand() * 3);
        }
        // Subtle mineral veins
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = 1.5;
        for (let v = 0; v < 8; v++) {
          ctx.beginPath();
          let vx = rand() * 512;
          let vy = rand() * 512;
          ctx.moveTo(vx, vy);
          for (let step = 0; step < 6; step++) {
            vx += (rand() - 0.5) * 90;
            vy += (rand() - 0.5) * 90;
            ctx.lineTo(vx, vy);
          }
          ctx.stroke();
        }
      }
      set = {
        map: finalizeTexture(c, 3, 3, true),
        roughnessMap: finalizeTexture(r, 3, 3, false),
      };
      break;
    }

    case 'naturalOak': {
      const [c, ctx] = makeCanvas(512, 512);
      const [b, bCtx] = makeCanvas(512, 512);
      if (ctx && bCtx) {
        ctx.fillStyle = '#b6895b';
        ctx.fillRect(0, 0, 512, 512);
        bCtx.fillStyle = '#808080';
        bCtx.fillRect(0, 0, 512, 512);
        for (let y = 0; y < 512; y += 3) {
          const delta = Math.floor((rand() - 0.5) * 26);
          ctx.fillStyle = `rgba(${150 + delta},${105 + delta},${66 + delta},0.35)`;
          ctx.fillRect(0, y, 512, 2 + rand() * 2);
          const g = 110 + delta;
          bCtx.fillStyle = `rgba(${g},${g},${g},0.4)`;
          bCtx.fillRect(0, y, 512, 2);
        }
      }
      set = {
        map: finalizeTexture(c, 2, 2, true),
        bumpMap: finalizeTexture(b, 2, 2, false),
      };
      break;
    }

    case 'brushedAluminum': {
      const [c, ctx] = makeCanvas(256, 256);
      if (ctx) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 256; y++) {
          const v = 135 + Math.floor(rand() * 38);
          ctx.fillStyle = `rgba(${v},${v + 5},${v + 12},0.35)`;
          ctx.fillRect(0, y, 256, 1);
        }
      }
      set = { map: finalizeTexture(c, 4, 2, true) };
      break;
    }

    case 'acousticWall': {
      const [c, ctx] = makeCanvas(256, 256);
      if (ctx) {
        ctx.fillStyle = '#f4f6f9';
        ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 1500; i++) {
          const v = 232 + Math.floor(rand() * 18);
          ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
          ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
        }
        // Subtle architectural panel seam
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, 128, 256);
        ctx.strokeRect(128, 0, 128, 256);
      }
      set = { map: finalizeTexture(c, 4, 1, true) };
      break;
    }

    case 'ceilingTile': {
      const [c, ctx] = makeCanvas(256, 256);
      if (ctx) {
        ctx.fillStyle = '#eef2f6';
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, 124, 124);
        ctx.strokeRect(130, 2, 124, 124);
        ctx.strokeRect(2, 130, 124, 124);
        ctx.strokeRect(130, 130, 124, 124);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
        for (let x = 12; x < 250; x += 12) {
          for (let y = 12; y < 250; y += 12) {
            ctx.fillRect(x, y, 2, 2);
          }
        }
      }
      set = { map: finalizeTexture(c, 20, 16, true) };
      break;
    }

    case 'officeFabric': {
      const [c, ctx] = makeCanvas(256, 256);
      if (ctx) {
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 256, 256);
        for (let x = 0; x < 256; x += 4) {
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x, 0, 2, 256);
        }
        for (let y = 0; y < 256; y += 4) {
          ctx.fillStyle = 'rgba(15,23,42,0.16)';
          ctx.fillRect(0, y, 256, 2);
        }
      }
      set = { map: finalizeTexture(c, 3, 3, true) };
      break;
    }

    case 'asphalt': {
      const [c, ctx] = makeCanvas(512, 512);
      if (ctx) {
        ctx.fillStyle = '#1e242d';
        ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 6500; i++) {
          const v = 22 + Math.floor(rand() * 35);
          ctx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
          ctx.fillRect(rand() * 512, rand() * 512, 2, 2);
        }
      }
      set = { map: finalizeTexture(c, 18, 10, true) };
      break;
    }

    case 'sidewalkPaver': {
      const [c, ctx] = makeCanvas(512, 512);
      if (ctx) {
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 512, 512);
        for (let row = 0; row < 8; row++) {
          for (let col = 0; col < 4; col++) {
            const offset = row % 2 === 0 ? 0 : 64;
            const shade = 192 + Math.floor(rand() * 20);
            ctx.fillStyle = `rgb(${shade},${shade + 4},${shade + 9})`;
            ctx.fillRect((col * 128 + offset) % 512 + 2, row * 64 + 2, 124, 60);
          }
        }
      }
      set = { map: finalizeTexture(c, 16, 4, true) };
      break;
    }
  }

  textureCache.set(kind, set);
  return set;
}

export type MonitorScreenKind =
  | 'analytics'
  | 'code'
  | 'review'
  | 'maps'
  | 'chat'
  | 'pipeline'
  | 'server'
  | 'brand';

/** Generates crisp architectural monitor screen textures so workstations never look flat. */
export function getMonitorScreenTexture(kind: MonitorScreenKind, accentHex = '#38BDF8'): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}:${accentHex}`;
  const existing = screenTextureCache.get(key);
  if (existing) return existing;

  const [c, ctx] = makeCanvas(512, 288);
  if (ctx) {
    ctx.fillStyle = '#070e1c';
    ctx.fillRect(0, 0, 512, 288);

    // Subtle top title bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 34);
    ctx.fillStyle = accentHex;
    ctx.fillRect(14, 11, 10, 10);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px sans-serif';

    if (kind === 'brand') {
      ctx.fillStyle = '#071329';
      ctx.fillRect(0, 0, 512, 288);
      ctx.strokeStyle = '#1d4ed8';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, 492, 268);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AI GROWTH OS', 256, 130);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('AUTONOMOUS CORPORATE HQ 2026', 256, 168);
    } else if (kind === 'analytics' || kind === 'pipeline') {
      ctx.fillText(kind === 'analytics' ? 'GROWTH ANALYTICS & KPI' : 'WORKFLOW ORCHESTRATION', 34, 21);
      const bars = [110, 145, 95, 178, 162, 205, 190];
      bars.forEach((h, idx) => {
        ctx.fillStyle = idx % 2 === 0 ? accentHex : '#10b981';
        ctx.fillRect(36 + idx * 64, 248 - h, 38, h);
      });
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      bars.forEach((h, idx) => {
        const px = 55 + idx * 64;
        const py = 235 - h * 0.85;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    } else if (kind === 'maps') {
      ctx.fillText('GOOGLE MAPS & LOCAL SEO RADAR', 34, 21);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
      ctx.lineWidth = 2;
      for (let x = 24; x < 500; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, 45);
        ctx.lineTo(x, 270);
        ctx.stroke();
      }
      for (let y = 45; y < 270; y += 45) {
        ctx.beginPath();
        ctx.moveTo(24, y);
        ctx.lineTo(490, y);
        ctx.stroke();
      }
      // Route line + pins
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(90, 210);
      ctx.lineTo(210, 140);
      ctx.lineTo(350, 175);
      ctx.lineTo(430, 95);
      ctx.stroke();
      [
        [90, 210],
        [210, 140],
        [350, 175],
        [430, 95],
      ].forEach(([px, py]) => {
        ctx.fillStyle = '#ea4335';
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (kind === 'review') {
      ctx.fillText('QUALITY CONTROL & APPROVAL', 34, 21);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(24, 52, 220, 210);
      ctx.fillStyle = '#334155';
      ctx.fillRect(40, 70, 188, 120);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(268, 56, 216, 44);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(268, 114, 216, 44);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(268, 172, 216, 44);
    } else if (kind === 'server') {
      ctx.fillText('GPU CLUSTER & MULTI-LLM TELEMETRY', 34, 21);
      for (let row = 0; row < 4; row++) {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(24, 54 + row * 56, 464, 42);
        ctx.fillStyle = row === 2 ? '#a855f7' : '#10b981';
        ctx.fillRect(36, 67 + row * 56, 280 - row * 35, 16);
      }
    } else if (kind === 'chat') {
      ctx.fillText('OMNICHANNEL SLA CONVERSATIONS', 34, 21);
      for (let m = 0; m < 4; m++) {
        const isRight = m % 2 === 1;
        ctx.fillStyle = isRight ? accentHex : '#1e293b';
        ctx.fillRect(isRight ? 180 : 28, 54 + m * 55, 290, 38);
      }
    } else {
      ctx.fillText('AUTONOMOUS AGENT WORKSPACE', 34, 21);
      for (let l = 0; l < 9; l++) {
        ctx.fillStyle = l % 3 === 0 ? accentHex : '#475569';
        ctx.fillRect(26, 54 + l * 24, 180 + ((l * 73) % 240), 11);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  screenTextureCache.set(key, tex);
  return tex;
}
