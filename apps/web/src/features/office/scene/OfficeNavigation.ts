'use client';

import { OFFICE_ROOMS } from '../config/roomRegistry';
import { OFFICE_AGENTS_CONFIG } from '../config/agentLocations';
import { RoomId } from '../types';

export type DoorSide = 'north' | 'south' | 'east' | 'west';

export interface RoomDoorSpec {
  roomId: RoomId;
  side: DoorSide;
  /** World center of the doorway threshold */
  position: [number, number, number];
  /** Walkable point just outside the door in the corridor */
  corridorApproach: [number, number, number];
  /** Walkable point just inside the room */
  roomEntry: [number, number, number];
  width: number;
}

export const ROOM_DOOR_SIDES: Record<RoomId, DoorSide> = {
  command_center: 'north',
  reception_lobby: 'south',
  research_room: 'south',
  knowledge_library: 'east',
  workflow_center: 'south',
  content_studio: 'east',
  review_room: 'north',
  publishing_studio: 'north',
  gmaps_lab: 'north',
  social_center: 'west',
  concierge_lounge: 'west',
  community_hub: 'north',
  server_room: 'south',
  help_finance_desk: 'south',
};

export const ROOM_DOORS: RoomDoorSpec[] = OFFICE_ROOMS.map((room) => {
  const side = ROOM_DOOR_SIDES[room.id];
  const { x, z, width, depth } = room.bounds;
  const hw = width / 2;
  const hd = depth / 2;

  let pos: [number, number, number];
  let outside: [number, number, number];
  let inside: [number, number, number];

  switch (side) {
    case 'north':
      pos = [x, 0, z - hd];
      outside = [x, 0, z - hd - 1.6];
      inside = [x, 0, z - hd + 1.5];
      break;
    case 'south':
      pos = [x, 0, z + hd];
      outside = [x, 0, z + hd + 1.6];
      inside = [x, 0, z + hd - 1.5];
      break;
    case 'east':
      pos = [x + hw, 0, z];
      outside = [x + hw + 1.6, 0, z];
      inside = [x + hw - 1.5, 0, z];
      break;
    case 'west':
      pos = [x - hw, 0, z];
      outside = [x - hw - 1.6, 0, z];
      inside = [x - hw + 1.5, 0, z];
      break;
  }

  return {
    roomId: room.id,
    side,
    position: pos,
    corridorApproach: outside,
    roomEntry: inside,
    width: 1.8,
  };
});

export function getDoorForRoom(roomId: RoomId): RoomDoorSpec | undefined {
  return ROOM_DOORS.find((d) => d.roomId === roomId);
}

/**
 * Computes a collision-safe corridor waypoint route between any desk/room and a target room.
 * Ensures agents stand up, exit through their own room's doorway, travel along the main
 * quartz cross-corridors (x = 0 or z = 0 / z = ±11.5), and enter through the target room's doorway.
 */
export function buildOfficeWaypointPath(
  fromPos: [number, number, number],
  fromRoomId: RoomId,
  toRoomId: RoomId,
  targetPoint?: [number, number, number]
): Array<[number, number, number]> {
  const startDoor = getDoorForRoom(fromRoomId);
  const endDoor = getDoorForRoom(toRoomId);
  const targetRoom = OFFICE_ROOMS.find((r) => r.id === toRoomId);

  const finalDest: [number, number, number] =
    targetPoint ??
    (targetRoom ? [targetRoom.bounds.x, 0, targetRoom.bounds.z] : [0, 0, 0]);

  if (fromRoomId === toRoomId) {
    return [fromPos, finalDest];
  }

  const waypoints: Array<[number, number, number]> = [fromPos];

  if (startDoor) {
    waypoints.push(startDoor.roomEntry);
    waypoints.push(startDoor.corridorApproach);
  }

  const startOut = startDoor?.corridorApproach ?? fromPos;
  const endOut = endDoor?.corridorApproach ?? finalDest;

  // Route along main arterial corridor spine (z = 0 or x = 0) so agents avoid cutting through walls
  const spineZ = 0;
  const spineX = 0;

  if (Math.abs(startOut[2] - endOut[2]) > 4) {
    waypoints.push([startOut[0], 0, spineZ]);
    waypoints.push([spineX, 0, spineZ]);
    waypoints.push([endOut[0], 0, spineZ]);
  } else if (Math.abs(startOut[0] - endOut[0]) > 4) {
    waypoints.push([spineX, 0, startOut[2]]);
    waypoints.push([spineX, 0, endOut[2]]);
  }

  if (endDoor) {
    waypoints.push(endDoor.corridorApproach);
    waypoints.push(endDoor.roomEntry);
  }

  waypoints.push(finalDest);
  return waypoints;
}

/**
 * Returns obstacle AABBs for all agent desks so walking characters & camera clamp never intersect desks.
 */
export const DESK_COLLIDERS = OFFICE_AGENTS_CONFIG.map((a) => ({
  code: a.code,
  minX: a.position[0] - 1.45,
  maxX: a.position[0] + 1.45,
  minZ: a.position[2] - 0.9,
  maxZ: a.position[2] + 0.9,
}));

/** Clamps a 3D walkthrough position safely within the 64m x 48m building & exterior plaza. */
export function clampWalkableCameraPosition(x: number, y: number, z: number): [number, number, number] {
  return [
    Math.max(-48, Math.min(48, x)),
    Math.max(1.4, Math.min(58, y)),
    Math.max(-44, Math.min(44, z)),
  ];
}
