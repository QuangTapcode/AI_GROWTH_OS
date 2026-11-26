'use client';

import React from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import { QualityPreset } from '../types';

export type TimeOfDayPreset = 'morning' | 'daytime' | 'evening' | 'night';

interface OfficeLightingProps {
  timeOfDay: TimeOfDayPreset;
  qualityPreset: QualityPreset;
  exteriorLightsOn?: boolean;
}

const TIME_PRESETS: Record<
  TimeOfDayPreset,
  {
    skyBg: string;
    fogColor: string;
    ambientIntensity: number;
    ambientColor: string;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sunPos: [number, number, number];
    sunColor: string;
    sunIntensity: number;
    fillColor: string;
    fillIntensity: number;
    envIntensity: number;
    nightLights: boolean;
  }
> = {
  morning: {
    skyBg: '#bae6fd',
    fogColor: '#dbeafe',
    ambientIntensity: 0.42,
    ambientColor: '#fff7ed',
    hemiSky: '#93c5fd',
    hemiGround: '#cbd5e1',
    hemiIntensity: 0.55,
    sunPos: [48, 28, -32],
    sunColor: '#fde68a',
    sunIntensity: 1.85,
    fillColor: '#bfdbfe',
    fillIntensity: 0.45,
    envIntensity: 0.72,
    nightLights: false,
  },
  daytime: {
    skyBg: '#cbd5e1',
    fogColor: '#cbd5e1',
    ambientIntensity: 0.48,
    ambientColor: '#f8fafc',
    hemiSky: '#e0f2fe',
    hemiGround: '#94a3b8',
    hemiIntensity: 0.62,
    sunPos: [34, 48, 26],
    sunColor: '#fffbeb',
    sunIntensity: 1.95,
    fillColor: '#e0f2fe',
    fillIntensity: 0.52,
    envIntensity: 0.78,
    nightLights: false,
  },
  evening: {
    skyBg: '#334155',
    fogColor: '#475569',
    ambientIntensity: 0.34,
    ambientColor: '#fed7aa',
    hemiSky: '#fb923c',
    hemiGround: '#1e293b',
    hemiIntensity: 0.45,
    sunPos: [-46, 16, -24],
    sunColor: '#fdba74',
    sunIntensity: 1.55,
    fillColor: '#93c5fd',
    fillIntensity: 0.4,
    envIntensity: 0.55,
    nightLights: true,
  },
  night: {
    skyBg: '#091124',
    fogColor: '#0b132b',
    ambientIntensity: 0.28,
    ambientColor: '#cbd5e1',
    hemiSky: '#1e3a8a',
    hemiGround: '#0f172a',
    hemiIntensity: 0.38,
    sunPos: [-25, 38, -28],
    sunColor: '#93c5fd',
    sunIntensity: 0.65,
    fillColor: '#38bdf8',
    fillIntensity: 0.35,
    envIntensity: 0.42,
    nightLights: true,
  },
};

export function OfficeLighting({ timeOfDay, qualityPreset }: OfficeLightingProps) {
  const cfg = TIME_PRESETS[timeOfDay];
  const isPerf = qualityPreset === 'performance';
  const shadowSize = isPerf ? 512 : qualityPreset === 'balanced' ? 1024 : 2048;

  return (
    <group>
      <color attach="background" args={[cfg.skyBg]} />
      <fog attach="fog" args={[cfg.fogColor, 68, 165]} />

      <ambientLight intensity={cfg.ambientIntensity} color={cfg.ambientColor} />
      <hemisphereLight args={[cfg.hemiSky, cfg.hemiGround, cfg.hemiIntensity]} />

      <directionalLight
        position={cfg.sunPos}
        intensity={cfg.sunIntensity}
        castShadow={!isPerf}
        shadow-mapSize-width={shadowSize}
        shadow-mapSize-height={shadowSize}
        shadow-camera-far={135}
        shadow-camera-left={-44}
        shadow-camera-right={44}
        shadow-camera-top={38}
        shadow-camera-bottom={-38}
        shadow-bias={-0.0002}
        color={cfg.sunColor}
      />

      <directionalLight position={[-32, 24, 28]} intensity={cfg.fillIntensity} color={cfg.fillColor} />

      {/* Warm interior downlight accent during evening/night */}
      {cfg.nightLights && (
        <directionalLight position={[0, 20, 0]} intensity={0.45} color="#fef3c7" />
      )}

      {/* Self-contained procedural studio HDRI for realistic glass/aluminum reflections */}
      {!isPerf && (
        <Environment resolution={128} frames={1} environmentIntensity={cfg.envIntensity}>
          <Lightformer
            form="rect"
            intensity={cfg.nightLights ? 0.8 : 2.2}
            color={cfg.sunColor}
            scale={[40, 20, 1]}
            position={[0, 25, -15]}
            rotation={[Math.PI / 2.6, 0, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.4}
            color="#e0f2fe"
            scale={[50, 15, 1]}
            position={[-25, 14, 18]}
            rotation={[0, Math.PI / 3, 0]}
          />
          <Lightformer
            form="rect"
            intensity={1.1}
            color="#f8fafc"
            scale={[50, 15, 1]}
            position={[25, 14, -18]}
            rotation={[0, -Math.PI / 3, 0]}
          />
        </Environment>
      )}
    </group>
  );
}
