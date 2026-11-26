'use client';

import React, { useState } from 'react';
import { OFFICE_ROOMS } from '../config/roomRegistry';
import { OfficeAgentViewModel, RoomId } from '../types';

interface OfficeFloorPlanProps {
  agents: OfficeAgentViewModel[];
  selectedAgentId: string | null;
  activeRoomId?: RoomId | null;
  onSelectAgent: (code: string) => void;
  onSelectRoom?: (roomId: RoomId) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function OfficeFloorPlan({
  agents,
  selectedAgentId,
  activeRoomId,
  onSelectAgent,
  onSelectRoom,
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
}: OfficeFloorPlanProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const handleToggle = controlledOnToggle ?? (() => setInternalIsOpen((prev) => !prev));

  // HQ footprint: X from -32 to 32 (width 64), Z from -24 to 24 (depth 48) -> SVG viewBox 100 x 75
  function toSvgCoords(x: number, z: number): [number, number] {
    const svgX = ((x + 32) / 64) * 100;
    const svgY = ((z + 24) / 48) * 75;
    return [svgX, svgY];
  }

  return (
    <div className="fixed bottom-16 left-4 z-30 pointer-events-none select-none">
      <div className="pointer-events-auto bg-slate-900/92 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Toggle Header */}
        <button
          type="button"
          onClick={handleToggle}
          className="flex items-center gap-2 px-3 py-2 bg-slate-950/70 hover:bg-slate-950/90 text-xs font-semibold text-slate-200 transition-colors w-full cursor-pointer"
        >
          <span>📐</span>
          <span>Sơ Đồ Mặt Bằng (Floor Plan)</span>
          <span className="text-[10px] text-slate-400 font-mono ml-auto">
            {isOpen ? 'Ẩn [P]' : 'Hiện [P]'}
          </span>
        </button>

        {/* Interactive Blueprint SVG Mini-Map */}
        {isOpen && (
          <div className="p-3 w-80 space-y-2 text-xs">
            <div className="relative w-full aspect-[64/48] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden p-1.5">
              <svg viewBox="0 0 100 75" className="w-full h-full">
                {/* Outer Perimeter */}
                <rect
                  x="1"
                  y="1"
                  width="98"
                  height="73"
                  fill="none"
                  stroke="#334155"
                  strokeWidth="0.8"
                  strokeDasharray="2 2"
                />

                {/* 14 Clickable Department Zones */}
                {OFFICE_ROOMS.map((room) => {
                  const [rx, ry] = toSvgCoords(
                    room.bounds.x - room.bounds.width / 2,
                    room.bounds.z - room.bounds.depth / 2
                  );
                  const rw = (room.bounds.width / 64) * 100;
                  const rh = (room.bounds.depth / 48) * 75;
                  const isActive = activeRoomId === room.id;

                  return (
                    <g
                      key={`room-map-${room.id}`}
                      className="cursor-pointer"
                      onClick={() => onSelectRoom?.(room.id)}
                    >
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        rx="1.5"
                        fill={room.accentColor}
                        fillOpacity={isActive ? 0.35 : 0.14}
                        stroke={isActive ? '#38BDF8' : room.accentColor}
                        strokeOpacity={isActive ? 1 : 0.45}
                        strokeWidth={isActive ? '0.9' : '0.4'}
                      />
                      <text
                        x={rx + rw / 2}
                        y={ry + rh / 2 + 0.8}
                        fontSize="2.2"
                        textAnchor="middle"
                        fill="#CBD5E1"
                        opacity={0.85}
                      >
                        {room.icon}
                      </text>
                    </g>
                  );
                })}

                {/* Central AI Core */}
                <circle cx="50" cy="37.5" r="3.5" fill="#0284C7" fillOpacity="0.25" stroke="#38BDF8" strokeWidth="0.6" />
                <circle cx="50" cy="37.5" r="1.4" fill="#38BDF8" />

                {/* 8 Agent Stations */}
                {agents.map((agent) => {
                  const [cx, cy] = toSvgCoords(agent.position[0], agent.position[2]);
                  const isSelected = selectedAgentId === agent.code;
                  const isRunning = agent.status === 'running';

                  return (
                    <g
                      key={`map-${agent.code}`}
                      id={`station-${agent.code}`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectAgent(agent.code);
                      }}
                    >
                      {(isSelected || isRunning) && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r="4.5"
                          fill="none"
                          stroke={isSelected ? '#38BDF8' : '#06B6D4'}
                          strokeWidth="0.7"
                          className="animate-ping"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r="2.8"
                        fill={agent.color}
                        stroke={isSelected ? '#FFFFFF' : '#0F172A'}
                        strokeWidth="0.7"
                      />
                      <text
                        x={cx}
                        y={cy + 0.9}
                        fontSize="2.3"
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontWeight="bold"
                      >
                        {agent.num.replace('Agent ', '')}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>14 phòng ban • 8 Agent</span>
              <span className="text-blue-400">Click phòng hoặc Agent</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
