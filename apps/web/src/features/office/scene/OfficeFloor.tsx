'use client';

import React, { useMemo } from 'react';
import { getPbrTextureSet } from './pbrMaterials';

export function OfficeFloor() {
  const concrete = useMemo(() => getPbrTextureSet('polishedConcrete'), []);
  const quartz = useMemo(() => getPbrTextureSet('quartzCorridor'), []);
  const granite = useMemo(() => getPbrTextureSet('darkGranite'), []);
  const aluminum = useMemo(() => getPbrTextureSet('brushedAluminum'), []);

  return (
    <group>
      {/* ── Main Corporate Headquarters Polished Architectural Concrete Floor (64m x 48m) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[64, 48]} />
        <meshStandardMaterial
          color="#e2e8f0"
          map={concrete?.map ?? null}
          roughnessMap={concrete?.roughnessMap ?? null}
          roughness={0.38}
          metalness={0.12}
        />
      </mesh>

      {/* ── Architectural Walkway Cross-Corridors (Quartz Stone) ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[60, 4.4]} />
        <meshStandardMaterial
          color="#f8fafc"
          map={quartz?.map ?? null}
          roughness={0.26}
          metalness={0.15}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[4.4, 46]} />
        <meshStandardMaterial
          color="#f8fafc"
          map={quartz?.map ?? null}
          roughness={0.26}
          metalness={0.15}
        />
      </mesh>

      {/* ── Central Atrium Executive Dark Granite Rotunda ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.009, 0]} receiveShadow>
        <circleGeometry args={[7.2, 48]} />
        <meshStandardMaterial
          color="#0f172a"
          map={granite?.map ?? null}
          roughnessMap={granite?.roughnessMap ?? null}
          roughness={0.22}
          metalness={0.48}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[7.08, 7.24, 48]} />
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.65} />
      </mesh>

      {/* ── Perimeter Structural Foundation & Baseboards (North leaves 4.2m doorway opening at x=0) ── */}
      <mesh position={[-17.0, 0.16, -23.9]} castShadow receiveShadow>
        <boxGeometry args={[30, 0.32, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[17.0, 0.16, -23.9]} castShadow receiveShadow>
        <boxGeometry args={[30, 0.32, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.16, 23.9]} castShadow receiveShadow>
        <boxGeometry args={[64, 0.32, 0.28]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[-31.9, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.28, 0.32, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.7} />
      </mesh>
      <mesh position={[31.9, 0.16, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.28, 0.32, 48]} />
        <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.7} />
      </mesh>

      {/* ── North Panoramic Glass Curtain Wall (Split around 4m Entrance Doorway) + Mullions + Blinds ── */}
      {[-17, 17].map((nx) => (
        <mesh key={`north-glass-${nx}`} position={[nx, 2.2, -23.85]}>
          <boxGeometry args={[29.8, 4.1, 0.08]} />
          <meshPhysicalMaterial
            color="#e0f2fe"
            transparent
            opacity={0.28}
            roughness={0.06}
            metalness={0.1}
            transmission={0.4}
          />
        </mesh>
      ))}
      {/* Header glass transom above entrance door */}
      <mesh position={[0, 3.7, -23.85]}>
        <boxGeometry args={[4.0, 1.0, 0.08]} />
        <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.3} roughness={0.06} />
      </mesh>
      {[-31.8, -28, -21, -14, -7, -2.05, 2.05, 7, 14, 21, 28, 31.8].map((x) => (
        <mesh key={`north-mullion-${x}`} position={[x, 2.2, -23.85]} castShadow>
          <boxGeometry args={[0.18, 4.2, 0.22]} />
          <meshStandardMaterial
            color="#334155"
            map={aluminum?.map ?? null}
            metalness={0.85}
            roughness={0.22}
          />
        </mesh>
      ))}
      <mesh position={[0, 4.35, -23.85]} castShadow>
        <boxGeometry args={[64, 0.32, 0.36]} />
        <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.28} />
      </mesh>

      {/* ── South Panoramic Glass Curtain Wall + Mullions + Window Blinds ── */}
      <mesh position={[0, 2.15, 23.85]}>
        <boxGeometry args={[63.6, 3.9, 0.08]} />
        <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.22} roughness={0.06} metalness={0.12} />
      </mesh>
      {/* Subtle architectural upper window blinds */}
      <mesh position={[0, 3.85, 23.75]}>
        <boxGeometry args={[63.4, 0.45, 0.06]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
      </mesh>
      {[-28, -21, -14, -7, 0, 7, 14, 21, 28].map((x) => (
        <mesh key={`south-mullion-${x}`} position={[x, 2.15, 23.85]} castShadow>
          <boxGeometry args={[0.16, 4.1, 0.2]} />
          <meshStandardMaterial color="#334155" map={aluminum?.map ?? null} metalness={0.85} roughness={0.22} />
        </mesh>
      ))}

      {/* ── East & West Floor-to-Ceiling Architectural Glass Curtain Walls + Mullions ── */}
      {[-31.85, 31.85].map((ex) => (
        <group key={`side-curtain-${ex}`}>
          <mesh position={[ex, 2.15, 0]}>
            <boxGeometry args={[0.08, 3.9, 47.6]} />
            <meshPhysicalMaterial color="#e0f2fe" transparent opacity={0.22} roughness={0.06} metalness={0.12} />
          </mesh>
          <mesh position={[ex > 0 ? ex - 0.1 : ex + 0.1, 3.85, 0]}>
            <boxGeometry args={[0.06, 0.45, 47.4]} />
            <meshStandardMaterial color="#cbd5e1" roughness={0.7} />
          </mesh>
          {[-20, -12, -4, 4, 12, 20].map((mz) => (
            <mesh key={`side-mullion-${ex}-${mz}`} position={[ex, 2.15, mz]} castShadow>
              <boxGeometry args={[0.2, 4.1, 0.16]} />
              <meshStandardMaterial color="#334155" map={aluminum?.map ?? null} metalness={0.85} roughness={0.22} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
