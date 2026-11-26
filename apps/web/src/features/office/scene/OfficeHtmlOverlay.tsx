'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OFFICE_ROOMS } from '../config/roomRegistry';
import { OfficeAgentViewModel, RoomId } from '../types';

export interface HtmlAnchorEntry {
  object: THREE.Object3D;
  distanceFactor: number;
  zIndexRange: [number, number];
}

interface CachedDomTransform {
  x: number;
  y: number;
  scale: number;
  zIndex: number | undefined;
  visible: boolean | null;
}

export interface HtmlAnchorRegistry {
  anchors: Map<string, HtmlAnchorEntry>;
  domElements: Map<string, HTMLDivElement>;
  lastStates: Map<string, CachedDomTransform>;
}

export function createHtmlAnchorRegistry(): HtmlAnchorRegistry {
  return {
    anchors: new Map(),
    domElements: new Map(),
    lastStates: new Map(),
  };
}

const _objPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _delta = new THREE.Vector3();

function isObjectBehindCamera(el: THREE.Object3D, camera: THREE.Camera): boolean {
  _objPos.setFromMatrixPosition(el.matrixWorld);
  _camPos.setFromMatrixPosition(camera.matrixWorld);
  _delta.subVectors(_objPos, _camPos);
  camera.getWorldDirection(_camDir);
  return _delta.angleTo(_camDir) > Math.PI / 2;
}

function calculateScale(el: THREE.Object3D, camera: THREE.Camera, distanceFactor: number): number {
  if (camera instanceof THREE.OrthographicCamera) {
    return camera.zoom * distanceFactor;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    _objPos.setFromMatrixPosition(el.matrixWorld);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    const vFOV = (camera.fov * Math.PI) / 180;
    const dist = _objPos.distanceTo(_camPos);
    const scaleFOV = 2 * Math.tan(vFOV / 2) * dist;
    return scaleFOV > 0 ? distanceFactor / scaleFOV : 1;
  }
  return 1;
}

function calculateZIndex(
  el: THREE.Object3D,
  camera: THREE.Camera,
  zIndexRange: [number, number]
): number | undefined {
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    _objPos.setFromMatrixPosition(el.matrixWorld);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    const dist = _objPos.distanceTo(_camPos);
    const span = camera.far - camera.near;
    if (span === 0) return zIndexRange[0];
    const slope = (zIndexRange[1] - zIndexRange[0]) / span;
    const intercept = zIndexRange[1] - slope * camera.far;
    return Math.round(slope * dist + intercept);
  }
  return undefined;
}

interface OfficeHtmlAnchorProps {
  id: string;
  registry?: HtmlAnchorRegistry;
  position: [number, number, number];
  distanceFactor?: number;
  zIndexRange?: [number, number];
}

/** Lightweight 3D anchor inside R3F scene; owns zero ReactDOM roots or unmount calls. */
export function OfficeHtmlAnchor({
  id,
  registry,
  position,
  distanceFactor = 24,
  zIndexRange = [5, 0],
}: OfficeHtmlAnchorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const zMin = zIndexRange[0];
  const zMax = zIndexRange[1];

  useEffect(() => {
    if (!registry || !groupRef.current) return;
    registry.anchors.set(id, {
      object: groupRef.current,
      distanceFactor,
      zIndexRange: [zMin, zMax],
    });
    return () => {
      registry.anchors.delete(id);
      registry.lastStates.delete(id);
    };
  }, [id, registry, distanceFactor, zMin, zMax]);

  return <group ref={groupRef} position={position} />;
}

/** Single render-loop projector syncing 3D anchors to native React DOM overlay elements. */
export function OfficeHtmlProjector({ registry }: { registry: HtmlAnchorRegistry }) {
  useFrame(({ camera, size }) => {
    if (size.width <= 0 || size.height <= 0) return;

    camera.updateMatrixWorld();
    const halfWidth = size.width / 2;
    const halfHeight = size.height / 2;

    registry.anchors.forEach((entry, id) => {
      const domEl = registry.domElements.get(id);
      if (!domEl) return;

      entry.object.updateWorldMatrix(true, false);
      const isVisible = !isObjectBehindCamera(entry.object, camera);

      let cached = registry.lastStates.get(id);
      if (!cached) {
        cached = { x: NaN, y: NaN, scale: NaN, zIndex: undefined, visible: null };
        registry.lastStates.set(id, cached);
      }

      if (cached.visible !== isVisible) {
        domEl.style.display = isVisible ? 'block' : 'none';
        cached.visible = isVisible;
      }

      if (!isVisible) return;

      _objPos.setFromMatrixPosition(entry.object.matrixWorld);
      _objPos.project(camera);

      const x = _objPos.x * halfWidth + halfWidth;
      const y = -(_objPos.y * halfHeight) + halfHeight;
      const rawScale = calculateScale(entry.object, camera, entry.distanceFactor);
      const scale = THREE.MathUtils.clamp(rawScale, 0.55, 1.0);
      const zIndex = calculateZIndex(entry.object, camera, entry.zIndexRange);

      const moved =
        Number.isNaN(cached.x) ||
        Math.abs(cached.x - x) > 0.05 ||
        Math.abs(cached.y - y) > 0.05 ||
        Math.abs(cached.scale - scale) > 0.001;

      if (moved) {
        domEl.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(4)})`;
        cached.x = x;
        cached.y = y;
        cached.scale = scale;
      }

      if (cached.zIndex !== zIndex) {
        domEl.style.zIndex = zIndex !== undefined ? `${zIndex}` : '';
        cached.zIndex = zIndex;
      }
    });
  });

  return null;
}

function ProjectedHtmlSlot({
  id,
  registry,
  children,
}: {
  id: string;
  registry: HtmlAnchorRegistry;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={(el) => {
        if (el) {
          registry.domElements.set(id, el);
        } else {
          registry.domElements.delete(id);
          registry.lastStates.delete(id);
        }
      }}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transformOrigin: '0 0',
        display: 'none',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          transform: 'translate3d(-50%, -50%, 0)',
          pointerEvents: 'auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface OfficeHtmlOverlayLayerProps {
  registry: HtmlAnchorRegistry;
  agents: OfficeAgentViewModel[];
  selectedAgentId: string | null;
  hoveredAgentCode: string | null;
  activeRoomId: RoomId | null;
  hoveredRoomId: RoomId | null;
  pendingReviewCount: number;
  onSelectAgent: (code: string) => void;
  onHoverAgent: (code: string | null) => void;
  onSelectRoom: (roomId: RoomId, targetRoute?: string) => void;
  onHoverRoom: (roomId: RoomId | null) => void;
}

/** Native React 19 DOM overlay rendering all room nameplates and agent overhead labels. */
export function OfficeHtmlOverlayLayer({
  registry,
  agents,
  selectedAgentId,
  hoveredAgentCode,
  activeRoomId,
  hoveredRoomId,
  pendingReviewCount,
  onSelectAgent,
  onHoverAgent,
  onSelectRoom,
  onHoverRoom,
}: OfficeHtmlOverlayLayerProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-[5] select-none">
      {OFFICE_ROOMS.map((room) => {
        const isActive = activeRoomId === room.id;
        const isHovered = hoveredRoomId === room.id;

        return (
          <ProjectedHtmlSlot key={`room-slot-${room.id}`} id={`room:${room.id}`} registry={registry}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectRoom(room.id);
              }}
              onMouseEnter={() => onHoverRoom(room.id)}
              onMouseLeave={() => onHoverRoom(null)}
              className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-[11px] font-bold whitespace-nowrap transition-all shadow-lg cursor-pointer backdrop-blur-md ${
                isActive
                  ? 'bg-blue-600/95 text-white border-blue-300 scale-105 ring-2 ring-blue-400/50'
                  : isHovered
                    ? 'bg-slate-900/95 text-white border-cyan-400/80 scale-105'
                    : 'bg-slate-900/80 text-slate-200 border-slate-700/70 hover:bg-slate-800/95'
              }`}
            >
              <span>{room.icon}</span>
              <span>{room.name}</span>
              {room.id === 'review_room' && pendingReviewCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-black animate-pulse">
                  {pendingReviewCount}
                </span>
              )}
            </button>
          </ProjectedHtmlSlot>
        );
      })}

      {agents.map((agent) => {
        const isSelected = selectedAgentId === agent.code;
        const isHovered = hoveredAgentCode === agent.code;

        return (
          <ProjectedHtmlSlot key={`agent-slot-${agent.code}`} id={`agent:${agent.code}`} registry={registry}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectAgent(agent.code);
              }}
              onMouseEnter={() => onHoverAgent(agent.code)}
              onMouseLeave={() => onHoverAgent(null)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-lg backdrop-blur-md cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 text-white ring-2 ring-white ring-offset-2 ring-offset-blue-600 scale-105'
                  : isHovered
                    ? 'bg-slate-900 text-white scale-105'
                    : 'bg-slate-900/85 text-slate-100 hover:bg-slate-900'
              }`}
            >
              <span className="text-sm">{agent.icon}</span>
              <span className="whitespace-nowrap">{agent.name}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  agent.status === 'running'
                    ? 'bg-cyan-400 animate-pulse'
                    : agent.status === 'needs_review'
                      ? 'bg-amber-400'
                      : agent.status === 'completed'
                        ? 'bg-emerald-400'
                        : agent.status === 'error'
                          ? 'bg-rose-400'
                          : 'bg-slate-400'
                }`}
              />
            </button>
          </ProjectedHtmlSlot>
        );
      })}
    </div>
  );
}
