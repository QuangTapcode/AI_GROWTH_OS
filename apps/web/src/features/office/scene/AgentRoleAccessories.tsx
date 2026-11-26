'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AgentStatusCode } from '../types';

interface AgentRoleAccessoriesProps {
  agentCode: string;
  status: AgentStatusCode;
  statusColor: string;
}

export function AgentRoleAccessories({
  agentCode,
  status,
}: AgentRoleAccessoriesProps) {
  const animatedPropRef = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (animatedPropRef.current) {
      // Rotation / oscillation for interactive accessories
      if (agentCode === 'growth_lead') {
        animatedPropRef.current.rotation.y += delta * 1.2;
      } else if (agentCode === 'gmaps_specialist') {
        animatedPropRef.current.position.y = 0.88 + Math.sin(state.clock.elapsedTime * 3) * 0.03;
        animatedPropRef.current.rotation.y += delta * 0.8;
      } else if (agentCode === 'comment_reply') {
        animatedPropRef.current.position.y = 0.95 + Math.sin(state.clock.elapsedTime * 2.5) * 0.04;
      } else if (agentCode === 'community_growth') {
        animatedPropRef.current.rotation.y += delta * 0.9;
      }
    }
  });

  return (
    <group>
      {/* ── AGENT 1: GROWTH LEAD (Executive Command Center) ── */}
      {agentCode === 'growth_lead' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Executive Command Hologram Projector */}
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.12, 0.14, 0.04, 16]} />
            <meshStandardMaterial color="#1E293B" metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.041, 0]}>
            <ringGeometry args={[0.04, 0.1, 16]} />
            <meshBasicMaterial color="#38BDF8" />
          </mesh>
          {/* Floating Tactical Wireframe Globe */}
          <group ref={animatedPropRef} position={[0, 0.18, 0]}>
            <mesh>
              <sphereGeometry args={[0.1, 12, 12]} />
              <meshBasicMaterial color="#38BDF8" wireframe />
            </mesh>
            <pointLight color="#38BDF8" intensity={0.5} distance={1.2} />
          </group>
          {/* Gold Trim Executive Pen & Tablet */}
          <mesh position={[0.3, 0.01, 0.1]}>
            <boxGeometry args={[0.22, 0.015, 0.32]} />
            <meshStandardMaterial color="#0F172A" roughness={0.1} metalness={0.9} />
          </mesh>
          <mesh position={[0.45, 0.015, 0.1]}>
            <cylinderGeometry args={[0.008, 0.008, 0.22, 8]} />
            <meshStandardMaterial color="#F59E0B" metalness={0.9} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* ── AGENT 2: ASSET MANAGER (Drive Asset Ingestion) ── */}
      {agentCode === 'asset_manager' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Stacked High-Speed NVMe Storage Enclosures */}
          <mesh position={[0, 0.04, 0]} castShadow>
            <boxGeometry args={[0.28, 0.07, 0.38]} />
            <meshStandardMaterial color="#1E293B" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.26, 0.06, 0.36]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Drive Status Indicator Light */}
          <mesh position={[0.11, 0.11, 0.18]}>
            <sphereGeometry args={[0.015, 8, 8]} />
            <meshBasicMaterial color={status === 'running' ? '#06B6D4' : '#10B981'} />
          </mesh>
          {/* Camera Lens Prop for Vision AI Analysis */}
          <group position={[0.35, 0.06, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.07, 0.07, 0.12, 16]} />
              <meshStandardMaterial color="#0F172A" metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.061, 0]}>
              <circleGeometry args={[0.05, 16]} />
              <meshStandardMaterial color="#0284C7" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        </group>
      )}

      {/* ── AGENT 3: CONTENT PLANNER (SEO & Content Lab) ── */}
      {agentCode === 'content_planner' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Research Dossier / Content Calendar Stack */}
          <mesh position={[0, 0.02, 0]} rotation={[0, 0.08, 0]} castShadow>
            <boxGeometry args={[0.32, 0.035, 0.42]} />
            <meshStandardMaterial color="#E2E8F0" roughness={0.8} />
          </mesh>
          <mesh position={[0.02, 0.045, -0.01]} rotation={[0, -0.05, 0]} castShadow>
            <boxGeometry args={[0.3, 0.025, 0.4]} />
            <meshStandardMaterial color="#0284C7" roughness={0.6} />
          </mesh>
          {/* Digital Stylus & Highlighter */}
          <mesh position={[0.32, 0.02, 0.05]} rotation={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.007, 0.007, 0.24, 8]} />
            <meshStandardMaterial color="#38BDF8" metalness={0.7} />
          </mesh>
          <mesh position={[0.32, 0.02, -0.1]}>
            <boxGeometry args={[0.025, 0.02, 0.12]} />
            <meshBasicMaterial color="#FACC15" />
          </mesh>
        </group>
      )}

      {/* ── AGENT 4: PUBLISHER (TikTok Video & Multi-Channel) ── */}
      {agentCode === 'publisher' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Vertical 9:16 Smartphone Preview Stand */}
          <group position={[0, 0.15, 0]} rotation={[-0.1, 0.2, 0]}>
            {/* Phone Body */}
            <mesh castShadow>
              <boxGeometry args={[0.16, 0.3, 0.018]} />
              <meshStandardMaterial color="#090D16" roughness={0.2} metalness={0.8} />
            </mesh>
            {/* 9:16 TikTok Screen Glow */}
            <mesh position={[0, 0, 0.01]}>
              <planeGeometry args={[0.145, 0.28]} />
              <meshBasicMaterial color={status === 'running' ? '#EC4899' : '#06B6D4'} />
            </mesh>
          </group>
          {/* Mini Clapperboard Prop */}
          <group position={[0.35, 0.06, 0.05]} rotation={[0, -0.2, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.2, 0.12, 0.02]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            <mesh position={[0, 0.07, 0]} rotation={[0, 0, 0.2]}>
              <boxGeometry args={[0.2, 0.025, 0.02]} />
              <meshStandardMaterial color="#F8FAFC" />
            </mesh>
          </group>
        </group>
      )}

      {/* ── AGENT 5: GMAPS SPECIALIST (Google Business Profile) ── */}
      {agentCode === 'gmaps_specialist' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Floating 3D Google Maps Location Pin Marker */}
          <group ref={animatedPropRef} position={[0, 0.15, 0]}>
            {/* Pin Head */}
            <mesh castShadow>
              <sphereGeometry args={[0.075, 16, 16]} />
              <meshStandardMaterial color="#EA4335" roughness={0.3} metalness={0.2} />
            </mesh>
            {/* Pin White Dot Center */}
            <mesh position={[0, 0, 0.06]}>
              <circleGeometry args={[0.03, 16]} />
              <meshBasicMaterial color="#FFFFFF" />
            </mesh>
            {/* Pin Pointed Cone Base */}
            <mesh position={[0, -0.07, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.065, 0.1, 16]} />
              <meshStandardMaterial color="#EA4335" roughness={0.3} />
            </mesh>
            <pointLight color="#EA4335" intensity={0.4} distance={1.0} />
          </group>
          {/* Local Relief Map Tile on Desk */}
          <mesh position={[0.32, 0.015, 0]}>
            <boxGeometry args={[0.3, 0.02, 0.3]} />
            <meshStandardMaterial color="#FEF3C7" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* ── AGENT 6: COMMENT REPLY (24/7 Social Comment RAG) ── */}
      {agentCode === 'comment_reply' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Floating 3D Speech Chat Bubble */}
          <group ref={animatedPropRef} position={[0, 0.18, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.09, 16, 16]} />
              <meshStandardMaterial color="#14B8A6" roughness={0.3} metalness={0.2} />
            </mesh>
            {/* Bubble Tail */}
            <mesh position={[-0.05, -0.08, 0]} rotation={[0, 0, -Math.PI / 4]}>
              <coneGeometry args={[0.03, 0.06, 8]} />
              <meshStandardMaterial color="#14B8A6" roughness={0.3} />
            </mesh>
            {/* Chat Dots "..." */}
            {[-0.04, 0, 0.04].map((dx, dotIdx) => (
              <mesh key={`dot-${dotIdx}`} position={[dx, 0, 0.08]}>
                <sphereGeometry args={[0.012, 8, 8]} />
                <meshBasicMaterial color="#FFFFFF" />
              </mesh>
            ))}
          </group>
          {/* Operator Headphones Resting on Desk */}
          <group position={[0.35, 0.04, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.08, 0.015, 8, 24, Math.PI]} />
              <meshStandardMaterial color="#1E293B" metalness={0.7} />
            </mesh>
            <mesh position={[-0.08, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
            <mesh position={[0.08, 0, 0]}>
              <cylinderGeometry args={[0.035, 0.035, 0.03, 12]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
          </group>
        </group>
      )}

      {/* ── AGENT 7: INBOX CONCIERGE (VIP 1-1 Consultation) ── */}
      {agentCode === 'inbox_concierge' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Polished Brass VIP Concierge Service Bell */}
          <group position={[0, 0.04, 0]}>
            {/* Bell Base */}
            <mesh castShadow>
              <cylinderGeometry args={[0.09, 0.11, 0.03, 16]} />
              <meshStandardMaterial color="#1E293B" metalness={0.9} />
            </mesh>
            {/* Brass Dome */}
            <mesh position={[0, 0.04, 0]} castShadow>
              <sphereGeometry args={[0.08, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color="#F59E0B" metalness={0.95} roughness={0.15} />
            </mesh>
            {/* Bell Plunger Button */}
            <mesh position={[0, 0.09, 0]}>
              <cylinderGeometry args={[0.015, 0.015, 0.04, 8]} />
              <meshStandardMaterial color="#D97706" metalness={0.9} />
            </mesh>
          </group>
          {/* Golden VIP Key / Lead Card */}
          <mesh position={[0.32, 0.015, 0]} rotation={[0, 0.3, 0]}>
            <boxGeometry args={[0.24, 0.012, 0.14]} />
            <meshStandardMaterial color="#8B5CF6" metalness={0.8} roughness={0.2} />
          </mesh>
        </group>
      )}

      {/* ── AGENT 8: COMMUNITY GROWTH (Retention & Groups) ── */}
      {agentCode === 'community_growth' && (
        <group position={[-0.85, 0.79, 0.1]}>
          {/* Interconnected Network Node Cluster */}
          <group ref={animatedPropRef} position={[0, 0.14, 0]}>
            {/* Central Node */}
            <mesh castShadow>
              <sphereGeometry args={[0.05, 12, 12]} />
              <meshStandardMaterial color="#10B981" roughness={0.3} metalness={0.7} />
            </mesh>
            {/* Satellites */}
            {[
              [0.08, 0.05, 0],
              [-0.07, -0.04, 0.06],
              [0.02, -0.06, -0.07],
            ].map(([nx, ny, nz], nodeIdx) => (
              <mesh key={`net-${nodeIdx}`} position={[nx, ny, nz]}>
                <sphereGeometry args={[0.03, 10, 10]} />
                <meshStandardMaterial color="#34D399" roughness={0.2} metalness={0.8} />
              </mesh>
            ))}
          </group>
          {/* Growth Milestone Trophy */}
          <group position={[0.32, 0.06, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.04, 0.06, 0.12, 12]} />
              <meshStandardMaterial color="#F59E0B" metalness={0.9} roughness={0.2} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
}
