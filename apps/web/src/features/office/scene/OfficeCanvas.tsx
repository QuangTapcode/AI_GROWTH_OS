'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { OfficeScene } from './OfficeScene';
import { OfficeCamera } from './OfficeCamera';
import { createHtmlAnchorRegistry, OfficeHtmlOverlayLayer } from './OfficeHtmlOverlay';
import {
  CameraPreset,
  CeilingMode,
  DepartmentRoomConfig,
  OfficeAgentViewModel,
  QualityPreset,
  RoomId,
  TimeOfDayPreset,
  WorkflowHandoff,
} from '../types';

interface OfficeCanvasProps {
  agents: OfficeAgentViewModel[];
  selectedAgent: OfficeAgentViewModel | null;
  activeRoom: DepartmentRoomConfig | null;
  hoveredRoomId: RoomId | null;
  pendingReviewCount: number;
  openExceptionCount: number;
  isAutopilotOn: boolean;
  onSelectAgent: (code: string) => void;
  onHoverRoom: (roomId: RoomId | null) => void;
  onSelectRoom: (roomId: RoomId, targetRoute?: string) => void;
  onOpenModal?: (modal: 'wallet' | 'daily_report' | 'help') => void;
  cameraPreset: CameraPreset;
  qualityPreset?: QualityPreset;
  timeOfDay?: TimeOfDayPreset;
  ceilingMode?: CeilingMode;
  handoffs?: WorkflowHandoff[];
  onContextLostFallback?: () => void;
  onDoorSound?: () => void;
  onFpsSample?: (fps: number) => void;
}

/** Throttled FPS sampler running strictly outside React per-frame state updates (updates max once per 1.5s). */
function FpsMonitor({ onFpsSample }: { onFpsSample?: (fps: number) => void }) {
  const frames = useRef(0);
  const lastSample = useRef(0);

  useFrame(() => {
    if (!onFpsSample) return;
    frames.current += 1;
    const now = performance.now();
    if (lastSample.current === 0) {
      lastSample.current = now;
      return;
    }
    const elapsed = now - lastSample.current;
    if (elapsed >= 1500) {
      const fps = Math.round((frames.current * 1000) / elapsed);
      frames.current = 0;
      lastSample.current = now;
      onFpsSample(fps);
    }
  });

  return null;
}

export default function OfficeCanvas({
  agents,
  selectedAgent,
  activeRoom,
  hoveredRoomId,
  pendingReviewCount,
  openExceptionCount,
  isAutopilotOn,
  onSelectAgent,
  onHoverRoom,
  onSelectRoom,
  onOpenModal,
  cameraPreset,
  qualityPreset = 'balanced',
  timeOfDay = 'daytime',
  ceilingMode = 'cutaway',
  handoffs = [],
  onContextLostFallback,
  onDoorSound,
  onFpsSample,
}: OfficeCanvasProps) {
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [contextLost, setContextLost] = useState(false);
  const [hoveredAgentCode, setHoveredAgentCode] = useState<string | null>(null);
  const labelRegistry = useMemo(() => createHtmlAnchorRegistry(), []);

  useEffect(() => {
    function handleVisibilityChange() {
      setIsTabVisible(!document.hidden);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const dpr: [number, number] | number =
    qualityPreset === 'performance' ? 1 : qualityPreset === 'balanced' ? [1, 1.25] : [1, 1.5];

  return (
    <div className="w-full h-full relative select-none">
      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 text-white p-6">
          <div className="max-w-md text-center space-y-3 bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <p className="text-sm font-bold text-amber-300">WebGL Context tạm thời bị ngắt</p>
            <p className="text-xs text-slate-300">
              Trình duyệt đã tạm giải phóng tài nguyên GPU. Bạn có thể khôi phục hoặc chuyển sang chế độ 2D.
            </p>
            {onContextLostFallback && (
              <button
                type="button"
                onClick={onContextLostFallback}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold cursor-pointer"
              >
                Chuyển sang chế độ 2D ổn định
              </button>
            )}
          </div>
        </div>
      )}

      <Canvas
        shadows={qualityPreset !== 'performance'}
        camera={{ position: [36, 32, 36], fov: 36, near: 0.2, far: 300 }}
        dpr={dpr}
        performance={{ min: 0.5 }}
        frameloop={isTabVisible ? 'always' : 'never'}
        gl={{
          antialias: qualityPreset !== 'performance',
          powerPreference: qualityPreset === 'performance' ? 'default' : 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          alpha: false,
          depth: true,
          stencil: false,
        }}
        onCreated={({ gl }) => {
          const dom = gl.domElement;
          const handleLost = (e: Event) => {
            e.preventDefault();
            setContextLost(true);
          };
          const handleRestored = () => {
            setContextLost(false);
          };
          dom.addEventListener('webglcontextlost', handleLost, false);
          dom.addEventListener('webglcontextrestored', handleRestored, false);
        }}
      >
        <OfficeScene
          agents={agents}
          selectedAgentId={selectedAgent?.code ?? null}
          hoveredAgentCode={hoveredAgentCode}
          activeRoomId={activeRoom?.id ?? null}
          hoveredRoomId={hoveredRoomId}
          pendingReviewCount={pendingReviewCount}
          openExceptionCount={openExceptionCount}
          isAutopilotOn={isAutopilotOn}
          onSelectAgent={onSelectAgent}
          onHoverAgent={setHoveredAgentCode}
          onHoverRoom={onHoverRoom}
          onSelectRoom={onSelectRoom}
          onOpenModal={onOpenModal}
          qualityPreset={qualityPreset}
          timeOfDay={timeOfDay}
          ceilingMode={ceilingMode}
          handoffs={handoffs}
          labelRegistry={labelRegistry}
          onDoorSound={onDoorSound}
        />

        <OfficeCamera
          selectedAgent={selectedAgent}
          activeRoom={activeRoom}
          cameraPreset={cameraPreset}
        />

        <FpsMonitor onFpsSample={onFpsSample} />
      </Canvas>

      <OfficeHtmlOverlayLayer
        registry={labelRegistry}
        agents={agents}
        selectedAgentId={selectedAgent?.code ?? null}
        hoveredAgentCode={hoveredAgentCode}
        activeRoomId={activeRoom?.id ?? null}
        hoveredRoomId={hoveredRoomId}
        pendingReviewCount={pendingReviewCount}
        onSelectAgent={onSelectAgent}
        onHoverAgent={setHoveredAgentCode}
        onSelectRoom={onSelectRoom}
        onHoverRoom={onHoverRoom}
      />
    </div>
  );
}
