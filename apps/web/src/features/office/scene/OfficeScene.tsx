'use client';

import React, { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import { OfficeFloor } from './OfficeFloor';
import { OfficeExterior } from './OfficeExterior';
import { OfficeCeiling } from './OfficeCeiling';
import { OfficeLighting } from './OfficeLighting';
import { CentralAICore } from './CentralAICore';
import { OfficeDecorations } from './OfficeDecorations';
import { DepartmentRooms } from './DepartmentRooms';
import { AgentDeskPlaceholder } from './AgentDeskPlaceholder';
import { HumanAgentCharacter } from './HumanAgentCharacter';
import { AgentHandoffBeam } from '../workflow/AgentHandoffBeam';
import { HtmlAnchorRegistry, OfficeHtmlProjector } from './OfficeHtmlOverlay';
import {
  CeilingMode,
  OfficeAgentViewModel,
  QualityPreset,
  RoomId,
  TimeOfDayPreset,
  WorkflowHandoff,
} from '../types';

interface OfficeSceneProps {
  agents: OfficeAgentViewModel[];
  selectedAgentId: string | null;
  hoveredAgentCode?: string | null;
  activeRoomId: RoomId | null;
  hoveredRoomId: RoomId | null;
  pendingReviewCount: number;
  openExceptionCount: number;
  isAutopilotOn: boolean;
  onSelectAgent: (code: string) => void;
  onHoverAgent?: (code: string | null) => void;
  onHoverRoom: (roomId: RoomId | null) => void;
  onSelectRoom: (roomId: RoomId, targetRoute?: string) => void;
  onOpenModal?: (modal: 'wallet' | 'daily_report' | 'help') => void;
  qualityPreset?: QualityPreset;
  timeOfDay?: TimeOfDayPreset;
  ceilingMode?: CeilingMode;
  handoffs?: WorkflowHandoff[];
  labelRegistry?: HtmlAnchorRegistry;
  onDoorSound?: () => void;
}

export function OfficeScene({
  agents,
  selectedAgentId,
  hoveredAgentCode = null,
  activeRoomId,
  hoveredRoomId,
  pendingReviewCount,
  openExceptionCount,
  isAutopilotOn,
  onSelectAgent,
  onHoverAgent,
  onHoverRoom,
  onSelectRoom,
  onOpenModal,
  qualityPreset = 'balanced',
  timeOfDay = 'daytime',
  ceilingMode = 'cutaway',
  handoffs = [],
  labelRegistry,
  onDoorSound,
}: OfficeSceneProps) {
  const [mainDoorOpen, setMainDoorOpen] = useState(false);
  const [openDoors, setOpenDoors] = useState<Record<string, boolean>>({});
  const agentWorldPositions = useRef<Record<string, THREE.Vector3>>({});

  const handleToggleMainDoor = useCallback(() => {
    setMainDoorOpen((prev) => !prev);
    onDoorSound?.();
  }, [onDoorSound]);

  const handleToggleRoomDoor = useCallback(
    (roomId: RoomId) => {
      setOpenDoors((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
      onDoorSound?.();
    },
    [onDoorSound]
  );

  const handleAgentPositionUpdate = useCallback((code: string, pos: THREE.Vector3) => {
    if (!agentWorldPositions.current[code]) {
      agentWorldPositions.current[code] = new THREE.Vector3();
    }
    agentWorldPositions.current[code].copy(pos);
  }, []);

  return (
    <group>
      {/* ── Architectural Sky, HDRI Reflections & Time-of-Day Lighting Rig ── */}
      <OfficeLighting timeOfDay={timeOfDay} qualityPreset={qualityPreset} />

      {/* ── Layer 1 Exterior Campus: Facade, Sliding Doors, Urban Skyline & Trees ── */}
      <OfficeExterior
        timeOfDay={timeOfDay}
        qualityPreset={qualityPreset}
        mainDoorOpen={mainDoorOpen}
        onToggleMainDoor={handleToggleMainDoor}
        onEnterLobby={() => onSelectRoom('reception_lobby', '/workspace')}
      />

      {/* ── Architectural HQ Foundation, PBR Concrete Floor & 4-Facade Glass Curtain Walls ── */}
      <OfficeFloor />

      {/* ── Suspended Acoustic Ceiling, Recessed LEDs, HVAC & Sprinklers (Cutaway / Interior) ── */}
      <OfficeCeiling ceilingMode={ceilingMode} timeOfDay={timeOfDay} />

      {/* ── 14 Interactive Enclosed Department Rooms, Glass Doors & Realistic Furniture ── */}
      <DepartmentRooms
        activeRoomId={activeRoomId}
        hoveredRoomId={hoveredRoomId}
        pendingReviewCount={pendingReviewCount}
        openExceptionCount={openExceptionCount}
        openDoors={openDoors}
        onToggleDoor={handleToggleRoomDoor}
        agentWorldPositions={agentWorldPositions}
        onHoverRoom={onHoverRoom}
        onSelectRoom={onSelectRoom}
        onOpenModal={onOpenModal}
        labelRegistry={labelRegistry}
      />

      {/* ── Central Autonomous Command Core (Autopilot-reactive) ── */}
      <CentralAICore
        agents={agents}
        selectedAgentId={selectedAgentId}
        isAutopilotOn={isAutopilotOn}
        onClickCore={() => onSelectRoom('command_center', '/dashboard')}
      />

      {/* ── Architectural Wall Displays & Indoor Plants ── */}
      <OfficeDecorations onSelectWallDisplay={() => onSelectRoom('command_center', '/dashboard')} />

      {/* ── Real Active Workflow Handoff Beams ── */}
      <AgentHandoffBeam handoffs={handoffs} />

      {/* ── 8 Workstation Desks (PBR Oak/Aluminum/Dual-Screen Textures) ── */}
      {agents.map((agent) => (
        <AgentDeskPlaceholder
          key={`desk-${agent.code}`}
          agent={agent}
          isSelected={selectedAgentId === agent.code}
          isHovered={hoveredAgentCode === agent.code}
          onSelect={onSelectAgent}
          onHoverChange={(isHov) => onHoverAgent?.(isHov ? agent.code : null)}
          labelRegistry={labelRegistry}
        />
      ))}

      {/* ── 8 Semi-Realistic Articulated Humanoid AI Agents (Skeleton + Morph Face + Walk Pathfinding) ── */}
      {agents.map((agent) => (
        <group
          key={`human-${agent.code}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectAgent(agent.code);
          }}
        >
          <HumanAgentCharacter
            agent={agent}
            isSelected={selectedAgentId === agent.code}
            statusColor={
              agent.status === 'running'
                ? '#0EA5E9'
                : agent.status === 'needs_review'
                  ? '#F59E0B'
                  : agent.status === 'completed'
                    ? '#10B981'
                    : agent.status === 'error'
                      ? '#F43F5E'
                      : '#64748B'
            }
            handoffs={handoffs}
            onPositionUpdate={handleAgentPositionUpdate}
          />
        </group>
      ))}

      {/* ── Native 3D->DOM Label Projector (zero extra React roots) ── */}
      {labelRegistry && <OfficeHtmlProjector registry={labelRegistry} />}
    </group>
  );
}
