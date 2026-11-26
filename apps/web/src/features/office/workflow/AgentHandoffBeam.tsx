'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OFFICE_AGENTS_CONFIG } from '../config/agentLocations';
import { WorkflowHandoff } from '../types';

interface AgentHandoffBeamProps {
  handoffs: WorkflowHandoff[];
}

function HandoffArc({ handoff }: { handoff: WorkflowHandoff }) {
  const sphereRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(0);

  const { lineObj, curve } = useMemo(() => {
    const sourceConfig = OFFICE_AGENTS_CONFIG.find((a) => a.code === handoff.sourceCode);
    const targetConfig = OFFICE_AGENTS_CONFIG.find((a) => a.code === handoff.targetCode);
    const [sx, sy, sz] = sourceConfig?.position ?? [0, 0, 0];
    const [tx, ty, tz] = targetConfig?.position ?? [0, 0, 0];

    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(sx, sy + 1.1, sz),
      new THREE.Vector3((sx + tx) / 2, Math.max(sy, ty) + 3.0, (sz + tz) / 2),
      new THREE.Vector3(tx, ty + 1.1, tz)
    );
    const geometry = new THREE.BufferGeometry().setFromPoints(c.getPoints(32));
    const material = new THREE.LineBasicMaterial({
      color: '#38BDF8',
      transparent: true,
      opacity: 0.85,
    });
    return { lineObj: new THREE.Line(geometry, material), curve: c };
  }, [handoff.sourceCode, handoff.targetCode]);

  useEffect(() => {
    return () => {
      lineObj.geometry.dispose();
      (lineObj.material as THREE.Material).dispose();
    };
  }, [lineObj]);

  useFrame((_, delta) => {
    if (!sphereRef.current) return;
    tRef.current = (tRef.current + delta * 0.7) % 1;
    sphereRef.current.position.copy(curve.getPoint(tRef.current));
  });

  return (
    <group>
      <primitive object={lineObj} />
      <mesh ref={sphereRef}>
        <sphereGeometry args={[0.13, 12, 12]} />
        <meshStandardMaterial color="#38BDF8" emissive="#0284C7" emissiveIntensity={1.4} roughness={0.15} />
      </mesh>
    </group>
  );
}

export function AgentHandoffBeam({ handoffs }: AgentHandoffBeamProps) {
  const activeHandoffs = handoffs.filter((h) => h.active);
  if (activeHandoffs.length === 0) return null;

  return (
    <group>
      {activeHandoffs.map((handoff) => {
        const hasBoth =
          OFFICE_AGENTS_CONFIG.some((a) => a.code === handoff.sourceCode) &&
          OFFICE_AGENTS_CONFIG.some((a) => a.code === handoff.targetCode);
        if (!hasBoth) return null;
        return <HandoffArc key={handoff.id} handoff={handoff} />;
      })}
    </group>
  );
}
