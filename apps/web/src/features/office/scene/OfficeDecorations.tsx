'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getMonitorScreenTexture } from './pbrMaterials';

interface OfficeDecorationsProps {
  onSelectWallDisplay?: () => void;
}

export function OfficeDecorations({ onSelectWallDisplay }: OfficeDecorationsProps) {
  const screenWaveRef = useRef<THREE.Mesh>(null);
  const analyticsTex = useMemo(() => getMonitorScreenTexture('analytics', '#38BDF8'), []);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;
    if (screenWaveRef.current) {
      screenWaveRef.current.position.y = 0.25 + Math.sin(elapsed * 2) * 0.04;
    }
  });

  return (
    <group>
      {/* ── 1. North Curtain Wall Giant Executive Metrics Display (flanked right of Reception Lobby) ── */}
      <group
        position={[-16, 2.6, -23.4]}
        onClick={(e) => {
          if (onSelectWallDisplay) {
            e.stopPropagation();
            onSelectWallDisplay();
          }
        }}
      >
        <mesh castShadow>
          <boxGeometry args={[9.2, 2.0, 0.14]} />
          <meshStandardMaterial color="#090d16" roughness={0.22} metalness={0.82} />
        </mesh>
        <mesh position={[0, 0, 0.08]}>
          <planeGeometry args={[8.85, 1.75]} />
          <meshBasicMaterial map={analyticsTex ?? null} />
        </mesh>
        <mesh ref={screenWaveRef} position={[0, 0.25, 0.09]}>
          <boxGeometry args={[7.8, 0.03, 0.01]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* ── 2. Strategic Architectural Potted Indoor Trees along HQ Corridors ── */}
      {[
        [-29.5, -21.5],
        [29.5, -21.5],
        [-29.5, 21.5],
        [29.5, 21.5],
        [-7.5, -9.5],
        [7.5, -9.5],
        [-7.5, 9.5],
        [7.5, 9.5],
      ].map(([px, pz], plantIdx) => (
        <group key={`deco-plant-${plantIdx}`} position={[px, 0, pz]}>
          {/* Ceramic Architectural Planter */}
          <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.38, 0.28, 0.76, 16]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.28} metalness={0.08} />
          </mesh>
          <mesh position={[0, 0.74, 0]}>
            <cylinderGeometry args={[0.35, 0.35, 0.04, 16]} />
            <meshStandardMaterial color="#3e2723" roughness={0.92} />
          </mesh>
          {/* Wood Stem */}
          <mesh position={[0, 1.15, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.06, 0.85, 8]} />
            <meshStandardMaterial color="#5c4033" roughness={0.9} />
          </mesh>
          {/* Organic Multi-Cluster Foliage */}
          <mesh position={[0, 1.55, 0]} castShadow>
            <icosahedronGeometry args={[0.42, 1]} />
            <meshStandardMaterial color="#166534" roughness={0.75} />
          </mesh>
          <mesh position={[0.18, 1.82, 0.14]} castShadow>
            <icosahedronGeometry args={[0.32, 1]} />
            <meshStandardMaterial color="#15803d" roughness={0.75} />
          </mesh>
          <mesh position={[-0.18, 1.72, -0.1]} castShadow>
            <icosahedronGeometry args={[0.3, 1]} />
            <meshStandardMaterial color="#22c55e" roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
