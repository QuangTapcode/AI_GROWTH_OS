'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OFFICE_ROOMS } from '../config/roomRegistry';
import { DepartmentRoomConfig, RoomId } from '../types';
import { HtmlAnchorRegistry, OfficeHtmlAnchor } from './OfficeHtmlOverlay';
import { getDoorForRoom, DoorSide } from './OfficeNavigation';
import { getMonitorScreenTexture, getPbrTextureSet } from './pbrMaterials';

interface DepartmentRoomsProps {
  activeRoomId: RoomId | null;
  hoveredRoomId: RoomId | null;
  pendingReviewCount: number;
  openExceptionCount: number;
  openDoors?: Record<string, boolean>;
  onToggleDoor?: (roomId: RoomId) => void;
  agentWorldPositions?: React.MutableRefObject<Record<string, THREE.Vector3>>;
  onHoverRoom: (roomId: RoomId | null) => void;
  onSelectRoom: (roomId: RoomId, targetRoute?: string) => void;
  onOpenModal?: (modal: 'wallet' | 'daily_report' | 'help') => void;
  labelRegistry?: HtmlAnchorRegistry;
}

/** Articulated Glass Office Door that swings open smoothly on click or when an Agent approaches. */
function RoomInteractiveDoor({
  roomId,
  width,
  depth,
  cx,
  cz,
  side,
  isOpen,
  onToggle,
  agentWorldPositions,
}: {
  roomId: RoomId;
  width: number;
  depth: number;
  cx: number;
  cz: number;
  side: DoorSide;
  isOpen: boolean;
  onToggle?: (roomId: RoomId) => void;
  agentWorldPositions?: React.MutableRefObject<Record<string, THREE.Vector3>>;
}) {
  const pivotRef = useRef<THREE.Group>(null);
  const doorSpec = useMemo(() => getDoorForRoom(roomId), [roomId]);
  const doorWidth = 1.65;
  const doorHeight = 2.35;

  const { doorPos, rotY } = useMemo(() => {
    const hw = width / 2 - 0.08;
    const hd = depth / 2 - 0.08;
    switch (side) {
      case 'north':
        return { doorPos: [cx - doorWidth / 2, 0, cz - hd] as [number, number, number], rotY: 0 };
      case 'south':
        return { doorPos: [cx - doorWidth / 2, 0, cz + hd] as [number, number, number], rotY: 0 };
      case 'east':
        return {
          doorPos: [cx + hw, 0, cz - doorWidth / 2] as [number, number, number],
          rotY: -Math.PI / 2,
        };
      case 'west':
        return {
          doorPos: [cx - hw, 0, cz - doorWidth / 2] as [number, number, number],
          rotY: -Math.PI / 2,
        };
    }
  }, [cx, cz, width, depth, side]);

  useFrame((_, delta) => {
    if (!pivotRef.current) return;
    let agentNear = false;
    if (agentWorldPositions && doorSpec) {
      const [dx, , dz] = doorSpec.position;
      for (const pos of Object.values(agentWorldPositions.current)) {
        if (Math.hypot(pos.x - dx, pos.z - dz) < 2.4) {
          agentNear = true;
          break;
        }
      }
    }
    const targetAngle = isOpen || agentNear ? Math.PI * 0.48 : 0;
    pivotRef.current.rotation.y = THREE.MathUtils.lerp(
      pivotRef.current.rotation.y,
      targetAngle,
      Math.min(1, delta * 6.5)
    );
  });

  return (
    <group position={doorPos} rotation={[0, rotY, 0]}>
      <group
        ref={pivotRef}
        onClick={(e) => {
          e.stopPropagation();
          onToggle?.(roomId);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        }}
      >
        {/* Tempered Glass Door Leaf */}
        <mesh position={[doorWidth / 2, doorHeight / 2, 0]} castShadow>
          <boxGeometry args={[doorWidth - 0.08, doorHeight, 0.05]} />
          <meshPhysicalMaterial
            color="#e0f2fe"
            transparent
            opacity={0.42}
            roughness={0.08}
            metalness={0.12}
          />
        </mesh>
        {/* Brushed Aluminum Stile Frame */}
        <mesh position={[doorWidth / 2, 0.06, 0]}>
          <boxGeometry args={[doorWidth - 0.06, 0.12, 0.07]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[doorWidth / 2, doorHeight - 0.05, 0]}>
          <boxGeometry args={[doorWidth - 0.06, 0.1, 0.07]} />
          <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Brushed Steel Door Handle Bar */}
        <mesh position={[doorWidth - 0.24, 1.05, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.45, 8]} />
          <meshStandardMaterial color="#cbd5e1" metalness={0.92} roughness={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/** Renders full 3D architectural walls (acoustic wainscot + glass curtain + doorway split) for a room. */
function RoomArchitecturalWalls({
  room,
  isOpenDoor,
  onToggleDoor,
  agentWorldPositions,
}: {
  room: DepartmentRoomConfig;
  isOpenDoor: boolean;
  onToggleDoor?: (roomId: RoomId) => void;
  agentWorldPositions?: React.MutableRefObject<Record<string, THREE.Vector3>>;
}) {
  const wallTex = useMemo(() => getPbrTextureSet('acousticWall'), []);
  const aluminumTex = useMemo(() => getPbrTextureSet('brushedAluminum'), []);
  const { x, z, width, depth } = room.bounds;

  // Command center is an open central atrium colonnade connecting seamlessly to rotunda corridors
  if (room.id === 'command_center') {
    return (
      <group>
        {[
          [-6.6, -5.6],
          [6.6, -5.6],
          [-6.6, 5.6],
          [6.6, 5.6],
        ].map(([px, pz], idx) => (
          <mesh key={`cmd-col-${idx}`} position={[px, 1.6, pz]} castShadow receiveShadow>
            <boxGeometry args={[0.36, 3.2, 0.36]} />
            <meshStandardMaterial
              color="#1e293b"
              map={aluminumTex?.map ?? null}
              metalness={0.75}
              roughness={0.25}
            />
          </mesh>
        ))}
      </group>
    );
  }

  const hw = width / 2 - 0.08;
  const hd = depth / 2 - 0.08;
  const doorSide = getDoorForRoom(room.id)?.side ?? 'south';
  const doorGap = 1.8;
  const isSolidSide = room.id === 'server_room';
  const wallHeight = 2.85;
  const wainscotH = 0.92;
  const glassH = wallHeight - wainscotH - 0.08;

  const renderWallSpan = (
    key: string,
    pos: [number, number, number],
    rotY: number,
    spanLength: number,
    hasDoorway: boolean
  ) => {
    if (hasDoorway) {
      const segLen = Math.max(0.4, (spanLength - doorGap) / 2);
      const offset = doorGap / 2 + segLen / 2;
      return (
        <group key={key} position={pos} rotation={[0, rotY, 0]}>
          {[-offset, offset].map((sx, idx) => (
            <group key={`${key}-seg-${idx}`} position={[sx, 0, 0]}>
              <mesh position={[0, wainscotH / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[segLen, wainscotH, 0.12]} />
                <meshStandardMaterial
                  color="#e2e8f0"
                  map={wallTex?.map ?? null}
                  roughness={0.75}
                />
              </mesh>
              <mesh position={[0, wainscotH + glassH / 2, 0]}>
                <boxGeometry args={[segLen - 0.04, glassH, 0.06]} />
                <meshPhysicalMaterial
                  color={isSolidSide ? '#94a3b8' : '#e0f2fe'}
                  transparent
                  opacity={isSolidSide ? 0.55 : 0.24}
                  roughness={isSolidSide ? 0.45 : 0.08}
                />
              </mesh>
              <mesh position={[0, wallHeight - 0.04, 0]}>
                <boxGeometry args={[segLen, 0.08, 0.14]} />
                <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.25} />
              </mesh>
            </group>
          ))}
          {/* Doorway Transom Header & Aluminum Jamb Posts */}
          <mesh position={[0, 2.58, 0]}>
            <boxGeometry args={[doorGap, 0.46, 0.13]} />
            <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.25} />
          </mesh>
          <mesh position={[-doorGap / 2, 1.4, 0]}>
            <boxGeometry args={[0.09, wallHeight, 0.15]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[doorGap / 2, 1.4, 0]}>
            <boxGeometry args={[0.09, wallHeight, 0.15]} />
            <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
          </mesh>
        </group>
      );
    }

    return (
      <group key={key} position={pos} rotation={[0, rotY, 0]}>
        <mesh position={[0, wainscotH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[spanLength, wainscotH, 0.12]} />
          <meshStandardMaterial color="#e2e8f0" map={wallTex?.map ?? null} roughness={0.75} />
        </mesh>
        <mesh position={[0, wainscotH + glassH / 2, 0]}>
          <boxGeometry args={[spanLength - 0.06, glassH, 0.06]} />
          <meshPhysicalMaterial
            color={isSolidSide ? '#64748b' : '#e0f2fe'}
            transparent
            opacity={isSolidSide ? 0.65 : 0.22}
            roughness={isSolidSide ? 0.5 : 0.08}
          />
        </mesh>
        <mesh position={[0, wallHeight - 0.04, 0]}>
          <boxGeometry args={[spanLength, 0.08, 0.14]} />
          <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.25} />
        </mesh>
      </group>
    );
  };

  return (
    <group>
      {renderWallSpan('wall-n', [x, 0, z - hd], 0, width - 0.2, doorSide === 'north')}
      {renderWallSpan('wall-s', [x, 0, z + hd], 0, width - 0.2, doorSide === 'south')}
      {renderWallSpan('wall-w', [x - hw, 0, z], Math.PI / 2, depth - 0.2, doorSide === 'west')}
      {renderWallSpan('wall-e', [x + hw, 0, z], Math.PI / 2, depth - 0.2, doorSide === 'east')}

      <RoomInteractiveDoor
        roomId={room.id}
        width={width}
        depth={depth}
        cx={x}
        cz={z}
        side={doorSide}
        isOpen={isOpenDoor}
        onToggle={onToggleDoor}
        agentWorldPositions={agentWorldPositions}
      />
    </group>
  );
}

/** Coffee Machine with subtle environmental steam in Community/Break Hub. */
function CoffeeStation({ position }: { position: [number, number, number] }) {
  const steamRef = useRef<THREE.Mesh>(null);
  const wood = useMemo(() => getPbrTextureSet('naturalOak'), []);

  useFrame((state) => {
    if (!steamRef.current) return;
    const t = state.clock.elapsedTime;
    steamRef.current.position.y = 1.28 + ((t * 0.18) % 0.28);
    const mat = steamRef.current.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.28 * (1 - ((t * 0.18) % 0.28) / 0.28);
  });

  return (
    <group position={position}>
      {/* Kitchenette Oak Counter */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.9, 0.8]} />
        <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.92, 0]} castShadow>
        <boxGeometry args={[2.26, 0.05, 0.86]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.2} metalness={0.1} />
      </mesh>
      {/* Espresso Machine */}
      <mesh position={[-0.4, 1.12, 0]} castShadow>
        <boxGeometry args={[0.42, 0.36, 0.38]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[-0.4, 1.0, 0.15]}>
        <cylinderGeometry args={[0.05, 0.04, 0.09, 12]} />
        <meshStandardMaterial color="#ffffff" roughness={0.2} />
      </mesh>
      <mesh ref={steamRef} position={[-0.4, 1.28, 0.15]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.22} />
      </mesh>
      {/* Stainless Mini Fridge */}
      <mesh position={[1.45, 0.65, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.72, 1.3, 0.72]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Rich, scaled interior furniture + live canvas screens for ALL 14 rooms. */
function RoomInteractiveProps({
  room,
  pendingReviewCount,
  onSelectRoom,
  onOpenModal,
}: {
  room: DepartmentRoomConfig;
  pendingReviewCount: number;
  onSelectRoom: (roomId: RoomId, targetRoute?: string) => void;
  onOpenModal?: (modal: 'wallet' | 'daily_report' | 'help') => void;
}) {
  const { x, z, width, depth } = room.bounds;
  const wood = useMemo(() => getPbrTextureSet('naturalOak'), []);
  const fabric = useMemo(() => getPbrTextureSet('officeFabric'), []);
  const granite = useMemo(() => getPbrTextureSet('darkGranite'), []);

  const brandTex = useMemo(() => getMonitorScreenTexture('brand', '#38BDF8'), []);
  const analyticsTex = useMemo(() => getMonitorScreenTexture('analytics', '#38BDF8'), []);
  const reviewTex = useMemo(() => getMonitorScreenTexture('review', '#F59E0B'), []);
  const pipelineTex = useMemo(() => getMonitorScreenTexture('pipeline', '#0EA5E9'), []);
  const mapsTex = useMemo(() => getMonitorScreenTexture('maps', '#F97316'), []);
  const chatTex = useMemo(() => getMonitorScreenTexture('chat', '#14B8A6'), []);
  const serverTex = useMemo(() => getMonitorScreenTexture('server', '#A855F7'), []);
  const codeTex = useMemo(() => getMonitorScreenTexture('code', '#0EA5E9'), []);

  switch (room.id) {
    case 'command_center':
      return (
        <group position={[x, 0, z]}>
          {/* Executive Curved Conference Arc Seating on South side of Central Core */}
          {[-2.8, -1.0, 1.0, 2.8].map((sx, idx) => (
            <group key={`cmd-seat-${idx}`} position={[sx, 0, 3.8]} rotation={[0, Math.PI, 0]}>
              <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.62, 0.08, 0.6]} />
                <meshStandardMaterial color="#1e293b" map={fabric?.map ?? null} roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.8, 0.26]} castShadow>
                <boxGeometry args={[0.58, 0.65, 0.08]} />
                <meshStandardMaterial color="#0f172a" roughness={0.6} />
              </mesh>
            </group>
          ))}
        </group>
      );

    case 'reception_lobby':
      return (
        <group position={[x, 0, z]}>
          {/* Marble & Navy Reception Desk facing North Main Entrance */}
          <mesh position={[0, 0.55, 0.6]} castShadow receiveShadow>
            <boxGeometry args={[6.4, 1.1, 1.1]} />
            <meshStandardMaterial color="#0f172a" map={granite?.map ?? null} roughness={0.24} metalness={0.45} />
          </mesh>
          <mesh position={[0, 1.12, 0.6]} castShadow>
            <boxGeometry args={[6.6, 0.08, 1.25]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.18} metalness={0.15} />
          </mesh>
          {/* Visitor Waiting Lounge Sofa (West Wing of Lobby) */}
          <group position={[-5.6, 0, -0.8]}>
            <mesh position={[0, 0.28, 0]} castShadow>
              <boxGeometry args={[2.8, 0.52, 0.95]} />
              <meshStandardMaterial color="#334155" map={fabric?.map ?? null} roughness={0.75} />
            </mesh>
            <mesh position={[0, 0.62, -0.36]} castShadow>
              <boxGeometry args={[2.8, 0.62, 0.22]} />
              <meshStandardMaterial color="#1e293b" roughness={0.75} />
            </mesh>
            {/* Coffee Table */}
            <mesh position={[0, 0.34, 1.1]} castShadow>
              <boxGeometry args={[1.5, 0.06, 0.8]} />
              <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.45} />
            </mesh>
          </group>
          {/* Corporate Feature Wall Display (East Wing of Lobby) */}
          <group
            position={[5.2, 1.75, 1.5]}
            rotation={[0, -0.25, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('reception_lobby', '/workspace-integrations');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.4, 2.0, 0.14]} />
              <meshStandardMaterial color="#090d16" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
              <planeGeometry args={[4.15, 1.75]} />
              <meshBasicMaterial map={brandTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'server_room':
      return (
        <group position={[x, 0, z]}>
          {/* Anti-Static Raised Dark Server Floor */}
          <mesh position={[0, 0.04, 0]} receiveShadow>
            <boxGeometry args={[width - 1.0, 0.08, depth - 1.0]} />
            <meshStandardMaterial color="#0f172a" roughness={0.32} metalness={0.75} />
          </mesh>
          {/* 4 AI GPU Server Racks + Overhead Cable Tray */}
          <mesh position={[0, 3.05, -2.5]}>
            <boxGeometry args={[8.6, 0.08, 0.6]} />
            <meshStandardMaterial color="#475569" metalness={0.85} roughness={0.25} />
          </mesh>
          {[-3.2, -1.1, 1.1, 3.2].map((rx, idx) => (
            <group key={`rack-${idx}`} position={[rx, 0, -2.5]}>
              <mesh position={[0, 1.4, 0]} castShadow>
                <boxGeometry args={[1.15, 2.8, 1.0]} />
                <meshStandardMaterial color="#090d16" roughness={0.25} metalness={0.85} />
              </mesh>
              {[0.5, 1.0, 1.5, 2.0, 2.4].map((ry, sIdx) => (
                <mesh key={`blade-${sIdx}`} position={[0, ry, 0.51]}>
                  <boxGeometry args={[0.9, 0.12, 0.03]} />
                  <meshBasicMaterial color={sIdx % 2 === 0 ? '#a855f7' : '#06b6d4'} />
                </mesh>
              ))}
            </group>
          ))}
          {/* Precision Cooling HVAC Unit */}
          <mesh position={[-4.8, 1.35, 1.6]} castShadow>
            <boxGeometry args={[1.1, 2.7, 1.3]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.5} roughness={0.35} />
          </mesh>
          {/* Multi-LLM & GPU Console Kiosk */}
          <group
            position={[0.8, 0, 1.8]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('server_room', '/admin/llm');
            }}
          >
            <mesh position={[0, 0.6, 0]} castShadow>
              <boxGeometry args={[2.4, 1.1, 0.8]} />
              <meshStandardMaterial color="#1e1b4b" metalness={0.6} roughness={0.25} />
            </mesh>
            <mesh position={[0, 1.65, -0.1]}>
              <boxGeometry args={[2.2, 1.15, 0.08]} />
              <meshStandardMaterial color="#090d16" metalness={0.8} />
            </mesh>
            <mesh position={[0, 1.65, -0.05]}>
              <planeGeometry args={[2.05, 1.0]} />
              <meshBasicMaterial map={serverTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'review_room':
      return (
        <group position={[x, 0, z]}>
          {/* Executive Glass Review Table */}
          <mesh position={[0, 0.4, 0]} castShadow>
            <boxGeometry args={[3.6, 0.74, 1.3]} />
            <meshStandardMaterial color="#1e293b" roughness={0.35} metalness={0.6} />
          </mesh>
          <mesh position={[0, 0.8, 0]} castShadow>
            <boxGeometry args={[4.2, 0.07, 2.0]} />
            <meshPhysicalMaterial color="#bae6fd" transparent opacity={0.48} roughness={0.08} />
          </mesh>
          {/* 4 Conference Chairs */}
          {[-1.2, 1.2].map((cx) =>
            [-1.35, 1.35].map((cz) => (
              <mesh key={`rev-ch-${cx}-${cz}`} position={[cx, 0.45, cz]} castShadow>
                <boxGeometry args={[0.55, 0.08, 0.55]} />
                <meshStandardMaterial color="#334155" map={fabric?.map ?? null} roughness={0.7} />
              </mesh>
            ))
          )}
          {/* QC & Guardrail Inspection Display Wall */}
          <group
            position={[0, 1.75, 3.6]}
            rotation={[0, Math.PI, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('review_room', '/review-queue');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.8, 1.9, 0.14]} />
              <meshStandardMaterial
                color="#0f172a"
                emissive={pendingReviewCount > 0 ? '#f59e0b' : '#10b981'}
                emissiveIntensity={pendingReviewCount > 0 ? 0.35 : 0.15}
              />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
              <planeGeometry args={[4.55, 1.7]} />
              <meshBasicMaterial map={reviewTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'workflow_center':
      return (
        <group position={[x, 0, z]}>
          {/* Holographic Pipeline Table */}
          <mesh
            position={[0, 0.44, 0]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('workflow_center', '/workflows');
            }}
          >
            <boxGeometry args={[4.6, 0.84, 2.2]} />
            <meshStandardMaterial color="#0f172a" map={granite?.map ?? null} metalness={0.65} roughness={0.25} />
          </mesh>
          {[-1.5, -0.5, 0.5, 1.5].map((nx, idx) => (
            <mesh key={`wf-node-${idx}`} position={[nx, 0.92, 0]}>
              <cylinderGeometry args={[0.24, 0.24, 0.1, 16]} />
              <meshBasicMaterial color={idx < 2 ? '#10b981' : idx === 2 ? '#38bdf8' : '#f59e0b'} />
            </mesh>
          ))}
          <group position={[0, 1.75, -3.4]}>
            <mesh castShadow>
              <boxGeometry args={[4.2, 1.7, 0.12]} />
              <meshStandardMaterial color="#090d16" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.0, 1.5]} />
              <meshBasicMaterial map={pipelineTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'knowledge_library':
      return (
        <group position={[x, 0, z]}>
          {/* Wood & Steel Knowledge Archive Shelving */}
          {[-2.5, 0, 2.5].map((sz, idx) => (
            <group key={`lib-shelf-${idx}`} position={[-3.6, 0, sz]}>
              <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.75, 2.5, 1.9]} />
                <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.6} />
              </mesh>
              <mesh position={[0.39, 1.6, 0]}>
                <boxGeometry args={[0.04, 1.8, 1.6]} />
                <meshStandardMaterial color="#1e1b4b" emissive="#4338ca" emissiveIntensity={0.22} />
              </mesh>
            </group>
          ))}
        </group>
      );

    case 'research_room':
      return (
        <group position={[x, 0, z]}>
          <group
            position={[0, 1.75, -4.1]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('research_room', '/agents/research');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[6.2, 2.0, 0.14]} />
              <meshStandardMaterial color="#0f172a" metalness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.08]}>
              <planeGeometry args={[5.9, 1.75]} />
              <meshBasicMaterial map={analyticsTex ?? null} />
            </mesh>
          </group>
          <mesh position={[-2.0, 0.42, -1.0]} castShadow>
            <boxGeometry args={[3.2, 0.8, 1.4]} />
            <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.5} />
          </mesh>
        </group>
      );

    case 'content_studio':
      return (
        <group position={[x, 0, z]}>
          {/* SEO & Content Briefing Screen on West Wall */}
          <group
            position={[-4.8, 1.75, 0]}
            rotation={[0, Math.PI / 2, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('content_studio', '/agents/content');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.6, 1.9, 0.12]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.35, 1.7]} />
              <meshBasicMaterial map={codeTex ?? null} />
            </mesh>
          </group>
          {/* Creative Asset Reference Table */}
          <mesh position={[2.2, 0.42, 2.4]} castShadow>
            <boxGeometry args={[2.4, 0.8, 1.1]} />
            <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.5} />
          </mesh>
        </group>
      );

    case 'publishing_studio':
      return (
        <group position={[x, 0, z]}>
          {/* Studio Tripod & Ring Light facing Publisher Desk */}
          <group position={[2.8, 0, -1.2]} rotation={[0, -0.5, 0]}>
            <mesh position={[0, 0.85, 0]} castShadow>
              <cylinderGeometry args={[0.04, 0.35, 1.7, 6]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} />
            </mesh>
            <mesh position={[0, 1.85, 0]}>
              <torusGeometry args={[0.32, 0.035, 12, 32]} />
              <meshBasicMaterial color="#fdf4ff" />
            </mesh>
          </group>
          {/* Multi-Channel Broadcast Wall */}
          <group
            position={[0, 1.75, 3.6]}
            rotation={[0, Math.PI, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('publishing_studio', '/distribution');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.4, 1.8, 0.12]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.15, 1.6]} />
              <meshBasicMaterial map={analyticsTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'gmaps_lab':
      return (
        <group position={[x, 0, z]}>
          {/* Interactive Geographic Relief Map Table */}
          <group
            position={[-2.6, 0, -1.2]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('gmaps_lab', '/gmaps');
            }}
          >
            <mesh position={[0, 0.45, 0]} castShadow>
              <boxGeometry args={[2.6, 0.86, 1.8]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[2.4, 1.6]} />
              <meshBasicMaterial map={mapsTex ?? null} />
            </mesh>
          </group>
          {/* Wall Map Analytics Screen */}
          <group position={[0, 1.75, 3.6]} rotation={[0, Math.PI, 0]}>
            <mesh castShadow>
              <boxGeometry args={[4.4, 1.8, 0.12]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.15, 1.6]} />
              <meshBasicMaterial map={mapsTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'social_center':
      return (
        <group position={[x, 0, z]}>
          <group
            position={[4.8, 1.75, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('social_center', '/agents/community#comments');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.4, 1.8, 0.12]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.15, 1.6]} />
              <meshBasicMaterial map={chatTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'concierge_lounge':
      return (
        <group position={[x, 0, z]}>
          {/* 1-1 Consultation Round Table + Armchairs */}
          <group position={[-2.2, 0, -2.0]}>
            <mesh position={[0, 0.38, 0]} castShadow>
              <cylinderGeometry args={[0.85, 0.85, 0.06, 24]} />
              <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.18, 0]}>
              <cylinderGeometry args={[0.12, 0.35, 0.36, 16]} />
              <meshStandardMaterial color="#334155" metalness={0.8} />
            </mesh>
          </group>
          <group
            position={[3.9, 1.75, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoom('concierge_lounge', '/booking-leads');
            }}
          >
            <mesh castShadow>
              <boxGeometry args={[4.2, 1.7, 0.12]} />
              <meshStandardMaterial color="#0f172a" />
            </mesh>
            <mesh position={[0, 0, 0.07]}>
              <planeGeometry args={[4.0, 1.5]} />
              <meshBasicMaterial map={chatTex ?? null} />
            </mesh>
          </group>
        </group>
      );

    case 'community_hub':
      return (
        <group position={[x, 0, z]}>
          {/* Collaborative Sofa Lounge */}
          <mesh position={[-2.4, 0.28, -1.6]} castShadow>
            <boxGeometry args={[2.6, 0.52, 0.95]} />
            <meshStandardMaterial color="#0f766e" map={fabric?.map ?? null} roughness={0.78} />
          </mesh>
          <mesh position={[-2.4, 0.6, -2.0]} castShadow>
            <boxGeometry args={[2.6, 0.65, 0.24]} />
            <meshStandardMaterial color="#115e59" roughness={0.78} />
          </mesh>
          {/* Corporate Break Corner (Kitchenette, Coffee Machine with steam & Fridge) */}
          <CoffeeStation position={[-2.2, 0, 2.8]} />
        </group>
      );

    case 'help_finance_desk':
      return (
        <group position={[x, 0, z]}>
          {/* Executive Briefing / Boardroom Table */}
          <mesh position={[0, 0.42, 1.4]} castShadow receiveShadow>
            <boxGeometry args={[4.4, 0.08, 1.8]} />
            <meshStandardMaterial color="#b6895b" map={wood?.map ?? null} roughness={0.42} />
          </mesh>
          <mesh position={[-1.4, 0.21, 1.4]} castShadow>
            <boxGeometry args={[0.14, 0.42, 1.1]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          <mesh position={[1.4, 0.21, 1.4]} castShadow>
            <boxGeometry args={[0.14, 0.42, 1.1]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} />
          </mesh>
          {/* Finance VietQR Terminal */}
          <mesh
            position={[-1.6, 0.65, -1.6]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal?.('wallet');
            }}
          >
            <boxGeometry args={[1.05, 1.25, 0.75]} />
            <meshStandardMaterial color="#065f46" emissive="#10b981" emissiveIntensity={0.22} metalness={0.5} />
          </mesh>
          {/* Daily Briefing Pedestal */}
          <mesh
            position={[1.6, 0.65, -1.6]}
            castShadow
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal?.('daily_report');
            }}
          >
            <boxGeometry args={[1.05, 1.25, 0.75]} />
            <meshStandardMaterial color="#102f70" emissive="#3b82f6" emissiveIntensity={0.22} metalness={0.5} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
}

export function DepartmentRooms({
  activeRoomId,
  hoveredRoomId,
  pendingReviewCount,
  openExceptionCount,
  openDoors = {},
  onToggleDoor,
  agentWorldPositions,
  onHoverRoom,
  onSelectRoom,
  onOpenModal,
  labelRegistry,
}: DepartmentRoomsProps) {
  return (
    <group>
      {OFFICE_ROOMS.map((room) => {
        const isActive = activeRoomId === room.id;
        const isHovered = hoveredRoomId === room.id;
        const { x, z, width, depth } = room.bounds;

        const hasAttention =
          (room.id === 'review_room' && pendingReviewCount > 0) ||
          (room.id === 'command_center' && openExceptionCount > 0);

        return (
          <group key={room.id} position={[0, 0, 0]}>
            {/* Interactive Room Architectural Floor Pad */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[x, 0.015, z]}
              receiveShadow
              onPointerOver={(e) => {
                e.stopPropagation();
                onHoverRoom(room.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                onHoverRoom(null);
                document.body.style.cursor = 'auto';
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectRoom(room.id);
              }}
            >
              <planeGeometry args={[width - 0.18, depth - 0.18]} />
              <meshStandardMaterial
                color={isHovered || isActive ? room.accentColor : room.zoneColor}
                transparent
                opacity={isActive ? 0.24 : isHovered ? 0.18 : 0.07}
                roughness={0.72}
              />
            </mesh>

            {/* Attention Threshold Accent Strip (only pulses Amber if needing review/attention) */}
            {(hasAttention || isActive || isHovered) && (
              <mesh position={[x, 0.024, z - depth / 2 + 0.1]}>
                <boxGeometry args={[width - 0.4, 0.025, 0.06]} />
                <meshBasicMaterial
                  color={hasAttention ? '#f59e0b' : '#38bdf8'}
                  transparent
                  opacity={0.85}
                />
              </mesh>
            )}

            {/* Real Enclosed Architectural Room Walls, Mullions & Interactive Animated Door */}
            <RoomArchitecturalWalls
              room={room}
              isOpenDoor={Boolean(openDoors[room.id])}
              onToggleDoor={onToggleDoor}
              agentWorldPositions={agentWorldPositions}
            />

            {/* Room Interactive 3D Consoles & Furniture */}
            <RoomInteractiveProps
              room={room}
              pendingReviewCount={pendingReviewCount}
              onSelectRoom={onSelectRoom}
              onOpenModal={onOpenModal}
            />

            {/* Floating Room Nameplate 3D Anchor */}
            <OfficeHtmlAnchor
              id={`room:${room.id}`}
              registry={labelRegistry}
              position={[x, 3.05, z - depth / 2 + 0.6]}
              distanceFactor={26}
              zIndexRange={[5, 0]}
            />
          </group>
        );
      })}
    </group>
  );
}
