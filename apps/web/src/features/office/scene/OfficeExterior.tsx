'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getMonitorScreenTexture, getPbrTextureSet } from './pbrMaterials';
import { TimeOfDayPreset } from './OfficeLighting';
import { QualityPreset } from '../types';

interface OfficeExteriorProps {
  timeOfDay: TimeOfDayPreset;
  qualityPreset: QualityPreset;
  mainDoorOpen: boolean;
  onToggleMainDoor: () => void;
  onEnterLobby?: () => void;
}

const URBAN_BUILDINGS: Array<{
  pos: [number, number, number];
  size: [number, number, number];
  color: string;
}> = [
  { pos: [-56, 14, -46], size: [14, 28, 12], color: '#334155' },
  { pos: [-34, 18, -56], size: [16, 36, 14], color: '#1e293b' },
  { pos: [34, 16, -56], size: [15, 32, 13], color: '#334155' },
  { pos: [58, 12, -44], size: [14, 24, 12], color: '#475569' },
  { pos: [-58, 13, 18], size: [14, 26, 16], color: '#334155' },
  { pos: [58, 15, 20], size: [15, 30, 16], color: '#1e293b' },
  { pos: [-40, 11, 48], size: [16, 22, 12], color: '#475569' },
  { pos: [42, 14, 50], size: [18, 28, 14], color: '#334155' },
];

const OUTDOOR_TREES: Array<[number, number, number]> = [
  [-24, 0, -29.5],
  [-15, 0, -29.5],
  [15, 0, -29.5],
  [24, 0, -29.5],
  [-36, 0, -18],
  [-36, 0, 0],
  [-36, 0, 18],
  [36, 0, -18],
  [36, 0, 0],
  [36, 0, 18],
  [-22, 0, 29],
  [0, 0, 29],
  [22, 0, 29],
];

export function OfficeExterior({
  timeOfDay,
  qualityPreset,
  mainDoorOpen,
  onToggleMainDoor,
  onEnterLobby,
}: OfficeExteriorProps) {
  const leftDoorRef = useRef<THREE.Group>(null);
  const rightDoorRef = useRef<THREE.Group>(null);
  const canopyTreesRef = useRef<THREE.Group>(null);
  const cloudsRef = useRef<THREE.Group>(null);
  const [doorHovered, setDoorHovered] = useState(false);

  const asphaltTex = useMemo(() => getPbrTextureSet('asphalt'), []);
  const sidewalkTex = useMemo(() => getPbrTextureSet('sidewalkPaver'), []);
  const aluminumTex = useMemo(() => getPbrTextureSet('brushedAluminum'), []);
  const brandSignTex = useMemo(() => getMonitorScreenTexture('brand', '#38BDF8'), []);

  const isNightOrEvening = timeOfDay === 'night' || timeOfDay === 'evening';
  const isPerf = qualityPreset === 'performance';

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const targetSlide = mainDoorOpen || doorHovered ? 1.85 : 0;

    if (leftDoorRef.current && rightDoorRef.current) {
      leftDoorRef.current.position.x = THREE.MathUtils.lerp(
        leftDoorRef.current.position.x,
        -0.95 - targetSlide,
        Math.min(1, delta * 5.5)
      );
      rightDoorRef.current.position.x = THREE.MathUtils.lerp(
        rightDoorRef.current.position.x,
        0.95 + targetSlide,
        Math.min(1, delta * 5.5)
      );
    }

    // Gentle outdoor breeze on trees & moving clouds
    if (!isPerf && canopyTreesRef.current) {
      canopyTreesRef.current.children.forEach((tree, idx) => {
        tree.rotation.z = Math.sin(elapsed * 0.8 + idx) * 0.018;
      });
    }
    if (!isPerf && cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud, idx) => {
        cloud.position.x += delta * (0.35 + (idx % 3) * 0.12);
        if (cloud.position.x > 75) cloud.position.x = -75;
      });
    }
  });

  return (
    <group>
      {/* ── Surrounding Urban Ground, Sidewalk & Entry Driveway ── */}
      {/* Outer landscaped campus lawn */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[180, 160]} />
        <meshStandardMaterial color={isNightOrEvening ? '#182b24' : '#365314'} roughness={0.95} />
      </mesh>

      {/* Perimeter Paved Sidewalk Apron around HQ (72m x 56m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow>
        <planeGeometry args={[74, 58]} />
        <meshStandardMaterial
          color="#cbd5e1"
          map={sidewalkTex?.map ?? null}
          roughness={0.78}
          metalness={0.05}
        />
      </mesh>

      {/* Main North Boulevard & Entry Driveway */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -39]} receiveShadow>
        <planeGeometry args={[160, 14]} />
        <meshStandardMaterial
          color="#1e293b"
          map={asphaltTex?.map ?? null}
          roughness={0.85}
          metalness={0.05}
        />
      </mesh>

      {/* Road Lane Markings & Architectural Boulevard Street Lamps */}
      {[-42, -28, -14, 0, 14, 28, 42].map((lx) => (
        <mesh key={`lane-${lx}`} rotation={[-Math.PI / 2, 0, 0]} position={[lx, -0.015, -39]}>
          <planeGeometry args={[6, 0.25]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.65} />
        </mesh>
      ))}
      {[-28, -10, 10, 28].map((sx) => (
        <group key={`street-lamp-${sx}`} position={[sx, 0, -31.5]}>
          <mesh position={[0, 2.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, 4.4, 8]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 4.42, -0.35]}>
            <boxGeometry args={[0.28, 0.08, 0.75]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} />
          </mesh>
          <mesh position={[0, 4.37, -0.45]}>
            <planeGeometry args={[0.24, 0.45]} />
            <meshBasicMaterial color={isNightOrEvening ? '#fde68a' : '#e2e8f0'} />
          </mesh>
        </group>
      ))}

      {/* Executive Drop-off Bay & Parking Slots (East North Plaza) */}
      <group position={[21, -0.01, -30]}>
        {[0, 3.2, 6.4, 9.6].map((px, i) => (
          <mesh key={`park-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[px - 4.8, 0, 0]}>
            <planeGeometry args={[0.12, 4.6]} />
            <meshBasicMaterial color="#cbd5e1" transparent opacity={0.7} />
          </mesh>
        ))}
        {/* EV Charging Bollard */}
        <mesh position={[-6.5, 0.55, -2.1]} castShadow>
          <boxGeometry args={[0.35, 1.1, 0.25]} />
          <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.25} />
        </mesh>
        <mesh position={[-6.5, 0.9, -1.96]}>
          <planeGeometry args={[0.2, 0.14]} />
          <meshBasicMaterial color="#10b981" />
        </mesh>
      </group>

      {/* ── Architectural Main Entrance Canopy & Automatic Double Sliding Glass Doors (North Plaza, z = -24) ── */}
      <group position={[0, 0, -24]}>
        {/* Grand Entrance Canopy Overhang */}
        <mesh position={[0, 4.25, -2.0]} castShadow receiveShadow>
          <boxGeometry args={[12.4, 0.36, 4.4]} />
          <meshStandardMaterial
            color="#0f172a"
            map={aluminumTex?.map ?? null}
            metalness={0.75}
            roughness={0.25}
          />
        </mesh>
        {/* Architectural Support Columns */}
        <mesh position={[-5.4, 2.1, -3.6]} castShadow>
          <boxGeometry args={[0.42, 4.2, 0.42]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
        </mesh>
        <mesh position={[5.4, 2.1, -3.6]} castShadow>
          <boxGeometry args={[0.42, 4.2, 0.42]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
        </mesh>

        {/* Illuminated "AI GROWTH OS" Corporate Facade Sign */}
        <mesh position={[0, 5.15, -3.95]} castShadow>
          <boxGeometry args={[8.4, 1.45, 0.22]} />
          <meshStandardMaterial color="#090d16" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[0, 5.15, -4.08]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[8.0, 1.2]} />
          <meshStandardMaterial
            color="#ffffff"
            map={brandSignTex ?? null}
            emissive="#1d4ed8"
            emissiveIntensity={isNightOrEvening ? 0.9 : 0.35}
          />
        </mesh>

        {/* Overhead Door Motion Sensor Box */}
        <mesh position={[0, 3.35, -0.18]}>
          <boxGeometry args={[0.9, 0.14, 0.16]} />
          <meshStandardMaterial color="#0f172a" />
        </mesh>
        <mesh position={[0, 3.35, -0.27]}>
          <sphereGeometry args={[0.04, 8, 8]} />
          <meshBasicMaterial color={mainDoorOpen || doorHovered ? '#10b981' : '#38bdf8'} />
        </mesh>

        {/* Access Control Card Reader Pedestal */}
        <group
          position={[-2.9, 0, -1.0]}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMainDoor();
          }}
        >
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.24, 1.2, 0.24]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 1.1, -0.13]}>
            <planeGeometry args={[0.14, 0.18]} />
            <meshBasicMaterial color={mainDoorOpen ? '#10b981' : '#0284c7'} />
          </mesh>
        </group>

        {/* Animated Double Sliding Glass Doors */}
        <group
          onPointerOver={(e) => {
            e.stopPropagation();
            setDoorHovered(true);
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            setDoorHovered(false);
            document.body.style.cursor = 'auto';
          }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMainDoor();
            onEnterLobby?.();
          }}
        >
          {/* Left Sliding Panel */}
          <group ref={leftDoorRef} position={[-0.95, 1.6, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.85, 3.1, 0.06]} />
              <meshPhysicalMaterial
                color="#bae6fd"
                transparent
                opacity={0.42}
                roughness={0.08}
                metalness={0.1}
                transmission={0.35}
              />
            </mesh>
            {/* Brushed Aluminum Top/Bottom Stile */}
            <mesh position={[0, 1.5, 0]}>
              <boxGeometry args={[1.88, 0.1, 0.09]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <boxGeometry args={[1.88, 0.1, 0.09]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
          </group>

          {/* Right Sliding Panel */}
          <group ref={rightDoorRef} position={[0.95, 1.6, 0]}>
            <mesh castShadow>
              <boxGeometry args={[1.85, 3.1, 0.06]} />
              <meshPhysicalMaterial
                color="#bae6fd"
                transparent
                opacity={0.42}
                roughness={0.08}
                metalness={0.1}
                transmission={0.35}
              />
            </mesh>
            <mesh position={[0, 1.5, 0]}>
              <boxGeometry args={[1.88, 0.1, 0.09]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
            <mesh position={[0, -1.5, 0]}>
              <boxGeometry args={[1.88, 0.1, 0.09]} />
              <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.2} />
            </mesh>
          </group>
        </group>

        {/* Entrance Guide Floor LED Strips */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.9, 0.01, -2.0]}>
          <planeGeometry args={[0.12, 4.0]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={isNightOrEvening ? 0.9 : 0.45} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.9, 0.01, -2.0]}>
          <planeGeometry args={[0.12, 4.0]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={isNightOrEvening ? 0.9 : 0.45} />
        </mesh>

        {/* Facade Night Accent Lamps */}
        {isNightOrEvening && (
          <>
            <pointLight position={[0, 3.8, -2.8]} color="#fef3c7" intensity={2.4} distance={14} decay={2} />
            <pointLight position={[-4.5, 3.8, -2.8]} color="#38bdf8" intensity={1.4} distance={10} decay={2} />
            <pointLight position={[4.5, 3.8, -2.8]} color="#38bdf8" intensity={1.4} distance={10} decay={2} />
          </>
        )}
      </group>

      {/* ── Architectural Urban Skyline Buildings (Exterior Context) ── */}
      {URBAN_BUILDINGS.map((b, idx) => (
        <group key={`city-bldg-${idx}`} position={b.pos}>
          <mesh castShadow={!isPerf} receiveShadow>
            <boxGeometry args={b.size} />
            <meshStandardMaterial color={b.color} roughness={0.5} metalness={0.35} />
          </mesh>
          {/* Illuminated window bands at evening/night */}
          {isNightOrEvening &&
            [0.2, 0.45, 0.7].map((frac, rowIdx) => (
              <mesh
                key={`win-band-${rowIdx}`}
                position={[0, -b.size[1] * 0.5 + b.size[1] * frac, 0]}
              >
                <boxGeometry args={[b.size[0] + 0.08, 0.65, b.size[2] + 0.08]} />
                <meshBasicMaterial color={rowIdx % 2 === 0 ? '#fde68a' : '#7dd3fc'} transparent opacity={0.45} />
              </mesh>
            ))}
        </group>
      ))}

      {/* ── Outdoor Campus Trees & Landscaping ── */}
      <group ref={canopyTreesRef}>
        {OUTDOOR_TREES.map(([tx, ty, tz], idx) => (
          <group key={`outdoor-tree-${idx}`} position={[tx, ty, tz]}>
            {/* Stone tree planter curb */}
            <mesh position={[0, 0.18, 0]} receiveShadow>
              <cylinderGeometry args={[1.05, 1.1, 0.36, 12]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.75} />
            </mesh>
            {/* Trunk */}
            <mesh position={[0, 1.5, 0]} castShadow={!isPerf}>
              <cylinderGeometry args={[0.16, 0.24, 2.6, 8]} />
              <meshStandardMaterial color="#5c4033" roughness={0.9} />
            </mesh>
            {/* Layered Canopy */}
            <mesh position={[0, 3.2, 0]} castShadow={!isPerf}>
              <icosahedronGeometry args={[1.35, 1]} />
              <meshStandardMaterial color={idx % 2 === 0 ? '#15803d' : '#166534'} roughness={0.8} />
            </mesh>
            <mesh position={[0.45, 3.7, 0.3]} castShadow={!isPerf}>
              <icosahedronGeometry args={[0.95, 1]} />
              <meshStandardMaterial color="#22c55e" roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>

      {/* ── Subtle Moving Sky Clouds ── */}
      {!isPerf && !isNightOrEvening && (
        <group ref={cloudsRef}>
          {[
            [-45, 32, -62],
            [-10, 35, -68],
            [28, 31, -60],
            [55, 34, -66],
          ].map(([cx, cy, cz], idx) => (
            <group key={`cloud-${idx}`} position={[cx, cy, cz]}>
              <mesh>
                <sphereGeometry args={[3.5, 10, 8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
              </mesh>
              <mesh position={[3.2, -0.5, 0]}>
                <sphereGeometry args={[2.6, 10, 8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}
