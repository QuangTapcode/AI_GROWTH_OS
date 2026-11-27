'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OfficeAgentViewModel } from '../types';

function ConduitLine({
  start,
  mid,
  end,
  color,
  opacity,
}: {
  start: [number, number, number];
  mid: [number, number, number];
  end: [number, number, number];
  color: string;
  opacity: number;
}) {
  const lineObj = useMemo(() => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...start),
      new THREE.Vector3(...mid),
      new THREE.Vector3(...end)
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(24));
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    });
    return new THREE.Line(geometry, material);
  }, [start, mid, end, color, opacity]);

  useEffect(() => {
    return () => {
      lineObj.geometry.dispose();
      (lineObj.material as THREE.Material).dispose();
    };
  }, [lineObj]);

  return <primitive object={lineObj} />;
}

interface CentralAICoreProps {
  agents: OfficeAgentViewModel[];
  selectedAgentId: string | null;
  isAutopilotOn?: boolean;
  onClickCore?: () => void;
}

export function CentralAICore({
  agents,
  selectedAgentId,
  isAutopilotOn = false,
  onClickCore,
}: CentralAICoreProps) {
  const crystalRef = useRef<THREE.Group>(null);
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const pointLightRef = useRef<THREE.PointLight>(null);

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    const speedFactor = isAutopilotOn ? 1.0 : 0.25;

    // Floating animation of the energy core
    if (crystalRef.current) {
      crystalRef.current.position.y = 1.7 + Math.sin(elapsed * (isAutopilotOn ? 2.2 : 1.0)) * 0.08;
      crystalRef.current.rotation.y += delta * 0.7 * speedFactor;
      crystalRef.current.rotation.x = Math.sin(elapsed * 1.5) * 0.12 * speedFactor;
    }

    // Gimbal ring rotations
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * 0.6 * speedFactor;
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x += delta * 0.8 * speedFactor;
      ring2Ref.current.rotation.y += delta * 0.4 * speedFactor;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.y -= delta * 0.5 * speedFactor;
      ring3Ref.current.rotation.z += delta * 0.3 * speedFactor;
    }

    // Core light pulse
    if (pointLightRef.current) {
      pointLightRef.current.intensity = isAutopilotOn
        ? 1.7 + Math.sin(elapsed * 3.5) * 0.4
        : 0.45;
    }
  });

  return (
    <group
      position={[0, 0, 0]}
      onClick={(e) => {
        if (onClickCore) {
          e.stopPropagation();
          onClickCore();
        }
      }}
    >
      {/* ── Tiered Pedestal ── */}
      {/* Outer Tier */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[3.2, 3.4, 0.24, 40]} />
        <meshStandardMaterial color="#0F172A" roughness={0.3} metalness={0.7} />
      </mesh>
      {/* Middle Stepped Tier */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.4, 2.6, 0.18, 36]} />
        <meshStandardMaterial color="#1E293B" roughness={0.2} metalness={0.8} />
      </mesh>
      {/* Top Polished Platform */}
      <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.7, 1.8, 0.12, 32]} />
        <meshStandardMaterial color="#0284C7" roughness={0.1} metalness={0.9} />
      </mesh>

      {/* ── Glowing Rune Floor Rings ── */}
      <mesh position={[0, 0.485, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.3, 1.55, 32]} />
        <meshBasicMaterial color="#38BDF8" transparent opacity={0.8} />
      </mesh>
      <mesh position={[0, 0.486, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.85, 32]} />
        <meshBasicMaterial color="#06B6D4" transparent opacity={0.9} />
      </mesh>

      {/* ── Concentric Gimbal Energy Rings ── */}
      {/* Ring 1 (Horizontal Ring) */}
      <mesh ref={ring1Ref} position={[0, 1.7, 0]}>
        <torusGeometry args={[1.35, 0.025, 16, 64]} />
        <meshStandardMaterial color="#38BDF8" emissive="#0284C7" emissiveIntensity={0.6} metalness={0.9} />
      </mesh>

      {/* Ring 2 (Tilted Ring) */}
      <mesh ref={ring2Ref} position={[0, 1.7, 0]} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[1.15, 0.02, 16, 64]} />
        <meshStandardMaterial color="#06B6D4" emissive="#00838F" emissiveIntensity={0.8} metalness={0.9} />
      </mesh>

      {/* Ring 3 (Inner Ring) */}
      <mesh ref={ring3Ref} position={[0, 1.7, 0]} rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[0.95, 0.018, 16, 64]} />
        <meshStandardMaterial color="#818CF8" emissive="#4338CA" emissiveIntensity={0.7} metalness={0.9} />
      </mesh>

      {/* ── Floating Energy Core Polyhedron ── */}
      <group ref={crystalRef} position={[0, 1.7, 0]}>
        <mesh castShadow>
          <octahedronGeometry args={[0.62, 0]} />
          <meshStandardMaterial
            color="#06B6D4"
            emissive="#0284C7"
            emissiveIntensity={1.2}
            roughness={0.1}
            metalness={0.95}
            transparent
            opacity={0.88}
          />
        </mesh>
        {/* Wireframe outer shell */}
        <mesh>
          <octahedronGeometry args={[0.72, 0]} />
          <meshBasicMaterial color="#38BDF8" wireframe />
        </mesh>
        <pointLight ref={pointLightRef} color="#38BDF8" intensity={1.8} distance={8} decay={2} />
      </group>

      {/* ── Dynamic Data Conduits to 8 Agent Desks (Memoized + Disposed cleanly) ── */}
      {agents.map((agent) => {
        const isRunning = agent.status === 'running';
        const isSelected = selectedAgentId === agent.code;
        const [targetX, , targetZ] = agent.position;

        const lineColor = isSelected ? '#38BDF8' : isRunning ? '#06B6D4' : agent.color;
        const lineOpacity = isSelected ? 0.95 : isRunning ? 0.8 : 0.18;

        return (
          <ConduitLine
            key={`conduit-${agent.code}`}
            start={[0, 0.45, 0]}
            mid={[targetX * 0.5, isRunning || isSelected ? 0.35 : 0.1, targetZ * 0.5]}
            end={[targetX, 0.05, targetZ]}
            color={lineColor}
            opacity={lineOpacity}
          />
        );
      })}
    </group>
  );
}
