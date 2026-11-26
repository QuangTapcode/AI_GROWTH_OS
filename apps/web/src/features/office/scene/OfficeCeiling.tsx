'use client';

import React, { useMemo } from 'react';
import { getPbrTextureSet } from './pbrMaterials';
import { TimeOfDayPreset } from './OfficeLighting';

export type CeilingMode = 'cutaway' | 'interior';

interface OfficeCeilingProps {
  ceilingMode: CeilingMode;
  timeOfDay: TimeOfDayPreset;
}

const LED_ROWS_X = [-22, -11, 0, 11, 22];
const LED_ROWS_Z = [-16, -6, 6, 16];

/** Suspended Corporate Ceiling System: Structural Beams, Acoustic Grid, Recessed LEDs, HVAC & Sprinklers. */
export function OfficeCeiling({ ceilingMode, timeOfDay }: OfficeCeilingProps) {
  const ceilingTex = useMemo(() => getPbrTextureSet('ceilingTile'), []);
  const isLit = timeOfDay === 'night' || timeOfDay === 'evening';

  if (ceilingMode === 'cutaway') {
    // Architectural Cutaway mode: show subtle perimeter roof cornice & structural truss ribs
    // around the North entrance & outer frame so interior rooms remain completely open to Overview camera.
    return (
      <group>
        {[-31.6, 31.6].map((x) => (
          <mesh key={`cut-beam-x-${x}`} position={[x, 4.35, 0]} castShadow>
            <boxGeometry args={[0.35, 0.35, 48]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
          </mesh>
        ))}
        <mesh position={[0, 4.35, 23.8]} castShadow>
          <boxGeometry args={[64, 0.35, 0.35]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
    );
  }

  // Immersive Interior Mode: Full suspended acoustic ceiling + recessed linear LEDs + HVAC + fire sprinklers
  return (
    <group>
      {/* Main Suspended Acoustic Tile Ceiling Slab */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.32, 0]} receiveShadow>
        <planeGeometry args={[63.6, 47.6]} />
        <meshStandardMaterial
          color="#f1f5f9"
          map={ceilingTex?.map ?? null}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* Structural Dark Steel Roof Beams */}
      {[-18, -6, 6, 18].map((z) => (
        <mesh key={`roof-beam-${z}`} position={[0, 4.2, z]}>
          <boxGeometry args={[63.6, 0.22, 0.28]} />
          <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.3} />
        </mesh>
      ))}

      {/* Recessed Linear LED Light Troffers & HVAC Vents & Fire Sprinklers */}
      {LED_ROWS_X.map((x) =>
        LED_ROWS_Z.map((z) => (
          <group key={`ceil-bay-${x}-${z}`} position={[x, 4.28, z]}>
            {/* Recessed LED Fixture */}
            <mesh>
              <boxGeometry args={[3.4, 0.04, 0.45]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={isLit ? '#fef3c7' : '#e0f2fe'}
                emissiveIntensity={isLit ? 1.15 : 0.7}
              />
            </mesh>
            {/* Square HVAC Supply Diffuser */}
            <mesh position={[2.6, -0.02, 0]}>
              <boxGeometry args={[0.75, 0.05, 0.75]} />
              <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.35} />
            </mesh>
            {/* Chrome Fire Sprinkler Nozzle */}
            <mesh position={[-2.6, -0.04, 0.4]}>
              <cylinderGeometry args={[0.03, 0.05, 0.08, 8]} />
              <meshStandardMaterial color="#cbd5e1" metalness={0.9} roughness={0.15} />
            </mesh>
          </group>
        ))
      )}
    </group>
  );
}
