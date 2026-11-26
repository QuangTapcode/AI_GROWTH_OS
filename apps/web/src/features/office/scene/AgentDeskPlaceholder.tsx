'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OfficeAgentViewModel } from '../types';
import { AgentRoleAccessories } from './AgentRoleAccessories';
import { HtmlAnchorRegistry, OfficeHtmlAnchor } from './OfficeHtmlOverlay';
import { getMonitorScreenTexture, getPbrTextureSet, MonitorScreenKind } from './pbrMaterials';

interface AgentDeskPlaceholderProps {
  agent: OfficeAgentViewModel;
  isSelected: boolean;
  isHovered?: boolean;
  onSelect: (code: string) => void;
  onHoverChange?: (hovered: boolean) => void;
  labelRegistry?: HtmlAnchorRegistry;
}

function getAgentMonitorKinds(code: string): [MonitorScreenKind, MonitorScreenKind] {
  switch (code) {
    case 'growth_lead':
      return ['analytics', 'pipeline'];
    case 'asset_manager':
      return ['review', 'code'];
    case 'content_planner':
      return ['code', 'analytics'];
    case 'publisher':
      return ['pipeline', 'brand'];
    case 'gmaps_specialist':
      return ['maps', 'analytics'];
    case 'comment_reply':
    case 'inbox_concierge':
      return ['chat', 'analytics'];
    case 'community_growth':
      return ['analytics', 'chat'];
    default:
      return ['code', 'analytics'];
  }
}

export function AgentDeskPlaceholder({
  agent,
  isSelected,
  isHovered = false,
  onSelect,
  onHoverChange,
  labelRegistry,
}: AgentDeskPlaceholderProps) {
  const [hovered, setHovered] = useState(false);
  const effectiveHovered = hovered || isHovered;
  const ringRef = useRef<THREE.Mesh>(null);
  const statusBeaconRef = useRef<THREE.Mesh>(null);

  const wood = useMemo(() => getPbrTextureSet('naturalOak'), []);
  const fabric = useMemo(() => getPbrTextureSet('officeFabric'), []);
  const aluminum = useMemo(() => getPbrTextureSet('brushedAluminum'), []);

  const [leftKind, rightKind] = useMemo(() => getAgentMonitorKinds(agent.code), [agent.code]);
  const leftScreenTex = useMemo(
    () => getMonitorScreenTexture(leftKind, agent.color),
    [leftKind, agent.color]
  );
  const rightScreenTex = useMemo(
    () => getMonitorScreenTexture(rightKind, '#38BDF8'),
    [rightKind]
  );

  // Status-based colors aligned with AI Growth OS Palette
  const statusColor =
    agent.status === 'running'
      ? '#0EA5E9'
      : agent.status === 'queued'
        ? '#3B82F6'
        : agent.status === 'needs_review'
          ? '#F59E0B'
          : agent.status === 'completed'
            ? '#10B981'
            : agent.status === 'error'
              ? '#F43F5E'
              : '#94A3B8';

  useFrame((state, delta) => {
    const elapsed = state.clock.elapsedTime;
    if (statusBeaconRef.current) {
      statusBeaconRef.current.rotation.y += delta * 1.8;
      statusBeaconRef.current.position.y = 2.02 + Math.sin(elapsed * 3.2) * 0.04;
    }
    if (ringRef.current) {
      if (agent.status === 'running' || isSelected) {
        ringRef.current.rotation.z += delta * 1.4;
        const s = 1 + Math.sin(elapsed * 4) * 0.04;
        ringRef.current.scale.set(s, s, 1);
      }
    }
  });

  return (
    <group position={agent.position}>
      {/* ── Subtle Woven Desk Area Mat ── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow>
        <planeGeometry args={[4.2, 4.2]} />
        <meshStandardMaterial
          color={agent.color}
          map={fabric?.map ?? null}
          opacity={0.14}
          transparent
          roughness={0.85}
        />
      </mesh>

      {/* ── Floor Status Indicator Ring ── */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
        <ringGeometry args={[1.85, 1.98, 36]} />
        <meshBasicMaterial
          color={isSelected ? '#38BDF8' : statusColor}
          transparent
          opacity={isSelected ? 0.92 : 0.52}
        />
      </mesh>

      {/* ── Interactive Clickable Anchor Hitbox ── */}
      <mesh
        position={[0, 1.15, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange?.(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHoverChange?.(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(agent.code);
        }}
        visible={false}
      >
        <boxGeometry args={[3.1, 2.3, 3.1]} />
      </mesh>

      {/* ── Workstation Desk & Ergonomic Chair Group ── */}
      <group rotation={[0, agent.rotationY, 0]}>
        {/* Natural Oak Workstation Tabletop */}
        <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.5, 0.07, 1.2]} />
          <meshStandardMaterial
            color={effectiveHovered || isSelected ? '#c6986b' : '#b6895b'}
            map={wood?.map ?? null}
            bumpMap={wood?.bumpMap ?? null}
            bumpScale={0.015}
            roughness={0.44}
            metalness={0.05}
          />
        </mesh>

        {/* Brushed Steel Frame Legs */}
        {[
          [-1.15, 0.36, -0.5],
          [1.15, 0.36, -0.5],
          [-1.15, 0.36, 0.5],
          [1.15, 0.36, 0.5],
        ].map(([lx, ly, lz], idx) => (
          <mesh key={`leg-${idx}`} position={[lx, ly, lz]} castShadow>
            <boxGeometry args={[0.07, 0.72, 0.07]} />
            <meshStandardMaterial
              color="#475569"
              map={aluminum?.map ?? null}
              metalness={0.82}
              roughness={0.24}
            />
          </mesh>
        ))}

        {/* Under-desk Cable Tray */}
        <mesh position={[0, 0.68, -0.3]}>
          <boxGeometry args={[1.8, 0.04, 0.18]} />
          <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </mesh>

        {/* Agent Unique Role Desk Props */}
        <AgentRoleAccessories
          agentCode={agent.code}
          status={agent.status}
          statusColor={statusColor}
        />

        {/* ── Dual Curved Display Monitors with Live Role Textures ── */}
        <group position={[0, 0.79, -0.3]}>
          <mesh position={[0, 0.12, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.13, 0.24, 16]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <boxGeometry args={[0.7, 0.04, 0.04]} />
            <meshStandardMaterial color="#334155" metalness={0.8} />
          </mesh>

          {/* Left Monitor */}
          <group position={[-0.52, 0.38, 0.05]} rotation={[0, 0.12, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.95, 0.52, 0.035]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[0.9, 0.47]} />
              <meshBasicMaterial map={leftScreenTex ?? null} />
            </mesh>
          </group>

          {/* Right Monitor */}
          <group position={[0.52, 0.38, 0.05]} rotation={[0, -0.12, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.95, 0.52, 0.035]} />
              <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.02]}>
              <planeGeometry args={[0.9, 0.47]} />
              <meshBasicMaterial map={rightScreenTex ?? null} />
            </mesh>
          </group>
        </group>

        {/* ── Mechanical Keyboard & Mouse Pad ── */}
        <mesh position={[-0.1, 0.795, 0.16]} castShadow>
          <boxGeometry args={[0.52, 0.018, 0.17]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0.35, 0.792, 0.16]}>
          <boxGeometry args={[0.24, 0.008, 0.2]} />
          <meshStandardMaterial color="#0f172a" roughness={0.8} />
        </mesh>
        <mesh position={[0.35, 0.806, 0.16]} castShadow>
          <boxGeometry args={[0.065, 0.02, 0.1]} />
          <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.4} />
        </mesh>

        {/* ── Desk Potted Succulent ── */}
        <group position={[-1.02, 0.79, -0.32]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.065, 0.05, 0.12, 12]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.14, 0]} castShadow>
            <icosahedronGeometry args={[0.075, 1]} />
            <meshStandardMaterial color="#15803d" roughness={0.75} />
          </mesh>
        </group>

        {/* ── Ergonomic Mesh Office Chair ── */}
        <group position={[0, 0.45, 0.72]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.62, 0.08, 0.6]} />
            <meshStandardMaterial color="#1e293b" map={fabric?.map ?? null} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.4, 0.27]} castShadow>
            <boxGeometry args={[0.58, 0.65, 0.07]} />
            <meshStandardMaterial color="#1e293b" map={fabric?.map ?? null} roughness={0.72} />
          </mesh>
          <mesh position={[-0.31, 0.22, 0.04]}>
            <boxGeometry args={[0.05, 0.04, 0.34]} />
            <meshStandardMaterial color="#475569" metalness={0.75} />
          </mesh>
          <mesh position={[0.31, 0.22, 0.04]}>
            <boxGeometry args={[0.05, 0.04, 0.34]} />
            <meshStandardMaterial color="#475569" metalness={0.75} />
          </mesh>
          <mesh position={[0, -0.25, 0]}>
            <cylinderGeometry args={[0.045, 0.26, 0.4, 8]} />
            <meshStandardMaterial color="#475569" metalness={0.82} />
          </mesh>
        </group>

        {/* ── Subtle Status Beacon above Desk only when Running/Attention/Error ── */}
        {(agent.status === 'needs_review' || agent.status === 'error' || agent.status === 'running') && (
          <mesh ref={statusBeaconRef} position={[0, 2.02, -0.3]}>
            <octahedronGeometry args={[0.08, 0]} />
            <meshBasicMaterial color={statusColor} />
          </mesh>
        )}
      </group>

      {/* ── 2D/3D Integrated Overhead Label Anchor ── */}
      <OfficeHtmlAnchor
        id={`agent:${agent.code}`}
        registry={labelRegistry}
        position={[0, 2.55, 0]}
        distanceFactor={22}
        zIndexRange={[5, 0]}
      />
    </group>
  );
}
