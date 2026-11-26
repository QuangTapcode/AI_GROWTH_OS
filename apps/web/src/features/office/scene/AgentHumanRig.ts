'use client';

import * as THREE from 'three';

export type HumanAnimationState =
  | 'idle'
  | 'sit'
  | 'stand'
  | 'walk'
  | 'work'
  | 'think'
  | 'talk'
  | 'present'
  | 'celebrate';

export type FacialExpressionState =
  | 'neutral'
  | 'smile'
  | 'focused'
  | 'thinking'
  | 'talking'
  | 'concerned';

export interface AgentHumanAppearance {
  skinColor: string;
  hairColor: string;
  hairStyle: 'executive' | 'bob' | 'undercut' | 'ponytail' | 'wavy' | 'cropped';
  jacketColor: string;
  shirtColor: string;
  pantsColor: string;
  shoeColor: string;
  eyeColor: string;
  hasGlasses?: boolean;
  hasHeadset?: boolean;
  hasTablet?: boolean;
  shoulderScale?: number;
  heightScale?: number;
}

export const AGENT_HUMAN_APPEARANCES: Record<string, AgentHumanAppearance> = {
  growth_lead: {
    skinColor: '#e8bea0',
    hairColor: '#1e1b18',
    hairStyle: 'executive',
    jacketColor: '#1e3a8a',
    shirtColor: '#f8fafc',
    pantsColor: '#0f172a',
    shoeColor: '#1c1917',
    eyeColor: '#2c1e16',
    shoulderScale: 1.06,
    heightScale: 1.03,
  },
  asset_manager: {
    skinColor: '#f0cbb0',
    hairColor: '#5c2c16',
    hairStyle: 'bob',
    jacketColor: '#3f6212',
    shirtColor: '#fef3c7',
    pantsColor: '#1e293b',
    shoeColor: '#451a03',
    eyeColor: '#3b4d36',
    hasGlasses: true,
    shoulderScale: 0.94,
    heightScale: 0.97,
  },
  content_planner: {
    skinColor: '#edd0b6',
    hairColor: '#18181b',
    hairStyle: 'wavy',
    jacketColor: '#0369a1',
    shirtColor: '#e0f2fe',
    pantsColor: '#334155',
    shoeColor: '#0f172a',
    eyeColor: '#27272a',
    hasGlasses: true,
    shoulderScale: 0.93,
    heightScale: 0.96,
  },
  publisher: {
    skinColor: '#dfb190',
    hairColor: '#09090b',
    hairStyle: 'undercut',
    jacketColor: '#27272a',
    shirtColor: '#be185d',
    pantsColor: '#18181b',
    shoeColor: '#09090b',
    eyeColor: '#1f1814',
    shoulderScale: 1.02,
    heightScale: 1.01,
  },
  gmaps_specialist: {
    skinColor: '#e6be9e',
    hairColor: '#3f2718',
    hairStyle: 'cropped',
    jacketColor: '#b45309',
    shirtColor: '#f0f9ff',
    pantsColor: '#1e293b',
    shoeColor: '#422006',
    eyeColor: '#3a2618',
    hasTablet: true,
    shoulderScale: 1.0,
    heightScale: 1.0,
  },
  comment_reply: {
    skinColor: '#f2d2ba',
    hairColor: '#292524',
    hairStyle: 'ponytail',
    jacketColor: '#0f766e',
    shirtColor: '#f8fafc',
    pantsColor: '#1e293b',
    shoeColor: '#1e293b',
    eyeColor: '#292524',
    hasHeadset: true,
    shoulderScale: 0.92,
    heightScale: 0.95,
  },
  inbox_concierge: {
    skinColor: '#ecc4a8',
    hairColor: '#3b2116',
    hairStyle: 'bob',
    jacketColor: '#6d28d9',
    shirtColor: '#ffffff',
    pantsColor: '#1e1b4b',
    shoeColor: '#1e1b4b',
    eyeColor: '#312018',
    shoulderScale: 0.93,
    heightScale: 0.97,
  },
  community_growth: {
    skinColor: '#e3b899',
    hairColor: '#291f18',
    hairStyle: 'cropped',
    jacketColor: '#047857',
    shirtColor: '#ecfdf5',
    pantsColor: '#334155',
    shoeColor: '#292524',
    eyeColor: '#241a14',
    shoulderScale: 1.02,
    heightScale: 1.01,
  },
};

export interface MorphMouthGeometryResult {
  geometry: THREE.BufferGeometry;
  dictionary: Record<string, number>;
}

/**
 * Creates sculpted mouth/lip mesh with real Three.js morphTargetInfluences for facial expressions:
 * `smile`, `jawOpen`, `talking`, `concerned`, `focused`.
 */
export function createMouthWithMorphTargets(): MorphMouthGeometryResult {
  const baseGeo = new THREE.BoxGeometry(0.056, 0.012, 0.014, 6, 2, 1);
  const pos = baseGeo.attributes.position as THREE.BufferAttribute;
  const count = pos.count;

  const makeTarget = (fn: (x: number, y: number, z: number) => [number, number, number]) => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const [dx, dy, dz] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
      arr[i * 3] = dx;
      arr[i * 3 + 1] = dy;
      arr[i * 3 + 2] = dz;
    }
    return new THREE.BufferAttribute(arr, 3);
  };

  // Corners curve upward for genuine Smile
  const smileAttr = makeTarget((x, y, z) => {
    const corner = Math.abs(x) / 0.028;
    return [x * 1.12, y + corner * corner * 0.0085, z];
  });

  // Jaw drops slightly open for Talking / JawOpen
  const jawOpenAttr = makeTarget((x, y, z) => [x * 0.92, y < 0 ? y - 0.011 : y + 0.002, z]);

  // Slight corner droop for Concerned
  const concernedAttr = makeTarget((x, y, z) => {
    const corner = Math.abs(x) / 0.028;
    return [x * 0.95, y - corner * corner * 0.006, z];
  });

  // Compressed focused lips
  const focusedAttr = makeTarget((x, y, z) => [x * 0.88, y * 0.55, z]);

  baseGeo.morphAttributes.position = [smileAttr, jawOpenAttr, concernedAttr, focusedAttr];
  baseGeo.computeVertexNormals();

  return {
    geometry: baseGeo,
    dictionary: {
      smile: 0,
      jawOpen: 1,
      concerned: 2,
      focused: 3,
    },
  };
}

/**
 * Generates shared procedural AnimationClips bound to the named Humanoid skeleton hierarchy:
 * Hips, Spine, Chest, Neck, Head, LeftUpperArm, LeftForearm, RightUpperArm, RightForearm,
 * LeftThigh, LeftShin, RightThigh, RightShin.
 */
let cachedClips: Record<HumanAnimationState, THREE.AnimationClip> | null = null;

function qTrack(node: string, times: number[], eulers: Array<[number, number, number]>) {
  const values: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const [rx, ry, rz] of eulers) {
    e.set(rx, ry, rz, 'XYZ');
    q.setFromEuler(e);
    values.push(q.x, q.y, q.z, q.w);
  }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}

function vTrack(node: string, prop: string, times: number[], vecs: Array<[number, number, number]>) {
  const values: number[] = [];
  for (const [x, y, z] of vecs) values.push(x, y, z);
  return new THREE.VectorKeyframeTrack(`${node}.${prop}`, times, values);
}

export function getHumanAnimationClips(): Record<HumanAnimationState, THREE.AnimationClip> {
  if (cachedClips) return cachedClips;

  // Base standing Hip height = 0.90m; seated Hip height = 0.50m
  const sitHipsPos = vTrack('Hips', 'position', [0, 1.5, 3.0], [
    [0, 0.5, 0],
    [0, 0.504, 0],
    [0, 0.5, 0],
  ]);

  const sitLegs = [
    qTrack('LeftThigh', [0, 3.0], [
      [-1.48, 0.04, 0],
      [-1.48, 0.04, 0],
    ]),
    qTrack('RightThigh', [0, 3.0], [
      [-1.48, -0.04, 0],
      [-1.48, -0.04, 0],
    ]),
    qTrack('LeftShin', [0, 3.0], [
      [1.48, 0, 0],
      [1.48, 0, 0],
    ]),
    qTrack('RightShin', [0, 3.0], [
      [1.48, 0, 0],
      [1.48, 0, 0],
    ]),
  ];

  // 1. SIT / IDLE (Seated relaxed with subtle breathing)
  const sitClip = new THREE.AnimationClip('sit', 3.0, [
    sitHipsPos,
    ...sitLegs,
    qTrack('Spine', [0, 1.5, 3.0], [
      [0.03, 0, 0],
      [0.01, 0, 0],
      [0.03, 0, 0],
    ]),
    qTrack('Chest', [0, 1.5, 3.0], [
      [0, 0, 0],
      [-0.025, 0, 0],
      [0, 0, 0],
    ]),
    qTrack('LeftUpperArm', [0, 1.5, 3.0], [
      [-0.35, 0, 0.08],
      [-0.37, 0, 0.08],
      [-0.35, 0, 0.08],
    ]),
    qTrack('RightUpperArm', [0, 1.5, 3.0], [
      [-0.35, 0, -0.08],
      [-0.37, 0, -0.08],
      [-0.35, 0, -0.08],
    ]),
    qTrack('LeftForearm', [0, 3.0], [
      [-0.85, 0, 0],
      [-0.85, 0, 0],
    ]),
    qTrack('RightForearm', [0, 3.0], [
      [-0.85, 0, 0],
      [-0.85, 0, 0],
    ]),
  ]);

  // 2. WORK (Seated active typing & mouse interaction)
  const workClip = new THREE.AnimationClip('work', 1.2, [
    vTrack('Hips', 'position', [0, 0.6, 1.2], [
      [0, 0.5, -0.04],
      [0, 0.503, -0.04],
      [0, 0.5, -0.04],
    ]),
    ...sitLegs.map((t) => t.clone()),
    qTrack('Spine', [0, 0.6, 1.2], [
      [0.1, 0, 0],
      [0.12, 0.02, 0],
      [0.1, 0, 0],
    ]),
    qTrack('LeftUpperArm', [0, 0.6, 1.2], [
      [-0.55, 0, 0.08],
      [-0.52, 0.03, 0.08],
      [-0.55, 0, 0.08],
    ]),
    qTrack('RightUpperArm', [0, 0.6, 1.2], [
      [-0.55, 0, -0.08],
      [-0.52, -0.03, -0.08],
      [-0.55, 0, -0.08],
    ]),
    qTrack('LeftForearm', [0, 0.3, 0.6, 0.9, 1.2], [
      [-0.95, 0, 0],
      [-1.08, 0, 0],
      [-0.92, 0, 0],
      [-1.06, 0, 0],
      [-0.95, 0, 0],
    ]),
    qTrack('RightForearm', [0, 0.3, 0.6, 0.9, 1.2], [
      [-1.06, 0, 0],
      [-0.93, 0, 0],
      [-1.09, 0, 0],
      [-0.94, 0, 0],
      [-1.06, 0, 0],
    ]),
  ]);

  // 3. THINK (Seated hand-to-chin pose)
  const thinkClip = new THREE.AnimationClip('think', 2.4, [
    vTrack('Hips', 'position', [0, 2.4], [
      [0, 0.5, 0],
      [0, 0.5, 0],
    ]),
    ...sitLegs.map((t) => t.clone()),
    qTrack('Spine', [0, 1.2, 2.4], [
      [0.02, 0, 0.03],
      [-0.02, 0, 0.05],
      [0.02, 0, 0.03],
    ]),
    qTrack('LeftUpperArm', [0, 2.4], [
      [-0.32, 0, 0.1],
      [-0.32, 0, 0.1],
    ]),
    qTrack('LeftForearm', [0, 2.4], [
      [-0.9, 0, 0],
      [-0.9, 0, 0],
    ]),
    qTrack('RightUpperArm', [0, 1.2, 2.4], [
      [-0.78, 0.25, -0.15],
      [-0.82, 0.25, -0.15],
      [-0.78, 0.25, -0.15],
    ]),
    qTrack('RightForearm', [0, 2.4], [
      [-1.85, 0.1, 0],
      [-1.85, 0.1, 0],
    ]),
  ]);

  // 4. STAND / IDLE (Standing upright relaxed breathing)
  const standClip = new THREE.AnimationClip('stand', 2.8, [
    vTrack('Hips', 'position', [0, 1.4, 2.8], [
      [0, 0.9, 0],
      [0, 0.906, 0],
      [0, 0.9, 0],
    ]),
    qTrack('LeftThigh', [0, 2.8], [
      [0, 0, 0.02],
      [0, 0, 0.02],
    ]),
    qTrack('RightThigh', [0, 2.8], [
      [0, 0, -0.02],
      [0, 0, -0.02],
    ]),
    qTrack('LeftShin', [0, 2.8], [
      [0.03, 0, 0],
      [0.03, 0, 0],
    ]),
    qTrack('RightShin', [0, 2.8], [
      [0.03, 0, 0],
      [0.03, 0, 0],
    ]),
    qTrack('Spine', [0, 1.4, 2.8], [
      [0, 0, 0],
      [-0.02, 0, 0],
      [0, 0, 0],
    ]),
    qTrack('LeftUpperArm', [0, 1.4, 2.8], [
      [0.04, 0, 0.1],
      [0.02, 0, 0.12],
      [0.04, 0, 0.1],
    ]),
    qTrack('RightUpperArm', [0, 1.4, 2.8], [
      [0.04, 0, -0.1],
      [0.02, 0, -0.12],
      [0.04, 0, -0.1],
    ]),
    qTrack('LeftForearm', [0, 2.8], [
      [-0.18, 0, 0],
      [-0.18, 0, 0],
    ]),
    qTrack('RightForearm', [0, 2.8], [
      [-0.18, 0, 0],
      [-0.18, 0, 0],
    ]),
  ]);

  // 5. WALK (Full natural bipedal walk cycle)
  const walkClip = new THREE.AnimationClip('walk', 0.96, [
    vTrack('Hips', 'position', [0, 0.24, 0.48, 0.72, 0.96], [
      [0, 0.88, 0],
      [0, 0.92, 0],
      [0, 0.88, 0],
      [0, 0.92, 0],
      [0, 0.88, 0],
    ]),
    qTrack('Hips', [0, 0.24, 0.48, 0.72, 0.96], [
      [0, 0.06, 0],
      [0, 0, 0],
      [0, -0.06, 0],
      [0, 0, 0],
      [0, 0.06, 0],
    ]),
    qTrack('LeftThigh', [0, 0.24, 0.48, 0.72, 0.96], [
      [-0.48, 0, 0.02],
      [0.05, 0, 0.02],
      [0.44, 0, 0.02],
      [-0.12, 0, 0.02],
      [-0.48, 0, 0.02],
    ]),
    qTrack('LeftShin', [0, 0.24, 0.48, 0.72, 0.96], [
      [0.12, 0, 0],
      [0.18, 0, 0],
      [0.52, 0, 0],
      [0.72, 0, 0],
      [0.12, 0, 0],
    ]),
    qTrack('RightThigh', [0, 0.24, 0.48, 0.72, 0.96], [
      [0.44, 0, -0.02],
      [-0.12, 0, -0.02],
      [-0.48, 0, -0.02],
      [0.05, 0, -0.02],
      [0.44, 0, -0.02],
    ]),
    qTrack('RightShin', [0, 0.24, 0.48, 0.72, 0.96], [
      [0.52, 0, 0],
      [0.72, 0, 0],
      [0.12, 0, 0],
      [0.18, 0, 0],
      [0.52, 0, 0],
    ]),
    qTrack('LeftUpperArm', [0, 0.48, 0.96], [
      [0.36, 0, 0.08],
      [-0.36, 0, 0.08],
      [0.36, 0, 0.08],
    ]),
    qTrack('RightUpperArm', [0, 0.48, 0.96], [
      [-0.36, 0, -0.08],
      [0.36, 0, -0.08],
      [-0.36, 0, -0.08],
    ]),
    qTrack('LeftForearm', [0, 0.48, 0.96], [
      [-0.32, 0, 0],
      [-0.48, 0, 0],
      [-0.32, 0, 0],
    ]),
    qTrack('RightForearm', [0, 0.48, 0.96], [
      [-0.48, 0, 0],
      [-0.32, 0, 0],
      [-0.48, 0, 0],
    ]),
  ]);

  // 6. TALK / PRESENT (Standing conversational/presenting hand gestures)
  const presentClip = new THREE.AnimationClip('present', 2.2, [
    vTrack('Hips', 'position', [0, 2.2], [
      [0, 0.9, 0],
      [0, 0.9, 0],
    ]),
    qTrack('LeftThigh', [0, 2.2], [
      [0, 0, 0.03],
      [0, 0, 0.03],
    ]),
    qTrack('RightThigh', [0, 2.2], [
      [0, 0, -0.03],
      [0, 0, -0.03],
    ]),
    qTrack('LeftShin', [0, 2.2], [
      [0.02, 0, 0],
      [0.02, 0, 0],
    ]),
    qTrack('RightShin', [0, 2.2], [
      [0.02, 0, 0],
      [0.02, 0, 0],
    ]),
    qTrack('RightUpperArm', [0, 1.1, 2.2], [
      [-0.95, 0.2, -0.25],
      [-1.15, 0.3, -0.28],
      [-0.95, 0.2, -0.25],
    ]),
    qTrack('RightForearm', [0, 1.1, 2.2], [
      [-0.45, 0, 0],
      [-0.25, 0, 0],
      [-0.45, 0, 0],
    ]),
    qTrack('LeftUpperArm', [0, 1.1, 2.2], [
      [-0.25, 0, 0.12],
      [-0.35, 0, 0.15],
      [-0.25, 0, 0.12],
    ]),
    qTrack('LeftForearm', [0, 2.2], [
      [-0.65, 0, 0],
      [-0.65, 0, 0],
    ]),
  ]);

  // 7. CELEBRATE (Brief positive seated/standing nod & gesture)
  const celebrateClip = new THREE.AnimationClip('celebrate', 1.6, [
    vTrack('Hips', 'position', [0, 1.6], [
      [0, 0.5, 0],
      [0, 0.5, 0],
    ]),
    ...sitLegs.map((t) => t.clone()),
    qTrack('Spine', [0, 0.8, 1.6], [
      [0.02, 0, 0],
      [-0.08, 0, 0],
      [0.02, 0, 0],
    ]),
    qTrack('RightUpperArm', [0, 0.8, 1.6], [
      [-0.4, 0, -0.1],
      [-1.25, 0.1, -0.35],
      [-0.4, 0, -0.1],
    ]),
    qTrack('RightForearm', [0, 0.8, 1.6], [
      [-0.8, 0, 0],
      [-1.1, 0, 0],
      [-0.8, 0, 0],
    ]),
  ]);

  cachedClips = {
    idle: sitClip,
    sit: sitClip,
    stand: standClip,
    walk: walkClip,
    work: workClip,
    think: thinkClip,
    talk: presentClip,
    present: presentClip,
    celebrate: celebrateClip,
  };

  return cachedClips;
}
