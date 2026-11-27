'use client';

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import { CameraPreset, DepartmentRoomConfig, OfficeAgentViewModel } from '../types';
import { clampWalkableCameraPosition } from './OfficeNavigation';

interface OfficeCameraProps {
  selectedAgent: OfficeAgentViewModel | null;
  activeRoom: DepartmentRoomConfig | null;
  cameraPreset: CameraPreset;
}

const WALK_FORWARD = new THREE.Vector3();
const WALK_RIGHT = new THREE.Vector3();

export function OfficeCamera({ selectedAgent, activeRoom, cameraPreset }: OfficeCameraProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  const targetLookAt = useRef(new THREE.Vector3(0, 1, 0));
  const targetCamPos = useRef(new THREE.Vector3(36, 32, 36));
  const isTransitioning = useRef(false);
  const pressedKeysRef = useRef<Record<string, boolean>>({});

  // Track WASD / Arrow keys when in Walkthrough mode (or general exploration)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      pressedKeysRef.current[e.code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  useEffect(() => {
    if (cameraPreset === 'floorplan') {
      targetLookAt.current.set(0, 0, 0);
      targetCamPos.current.set(0, 62, 0.01);
      isTransitioning.current = true;
    } else if (cameraPreset === 'entrance') {
      // Looking straight at the North HQ Facade, Signage, Sliding Glass Doors & Reception Lobby
      targetLookAt.current.set(0, 2.2, -22);
      targetCamPos.current.set(0, 5.2, -42.5);
      isTransitioning.current = true;
    } else if (cameraPreset === 'walkthrough') {
      // Human eye-level start inside Reception Lobby looking toward Central Atrium
      targetLookAt.current.set(0, 1.65, -4);
      targetCamPos.current.set(0, 1.85, -18.5);
      isTransitioning.current = true;
    } else if (cameraPreset === 'agent' && selectedAgent) {
      const [x, , z] = selectedAgent.position;
      targetLookAt.current.set(x, 1.25, z);
      targetCamPos.current.set(x + 5.8, 5.8, z + 5.8);
      isTransitioning.current = true;
    } else if (cameraPreset === 'room' && activeRoom) {
      targetLookAt.current.set(...activeRoom.cameraTarget);
      targetCamPos.current.set(...activeRoom.cameraPos);
      isTransitioning.current = true;
    } else {
      // Default Isometric Corporate HQ Overview showing glass curtain walls & landscaping
      targetLookAt.current.set(0, 1.2, -2);
      targetCamPos.current.set(36, 32, 36);
      isTransitioning.current = true;
    }
  }, [selectedAgent, activeRoom, cameraPreset]);

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (isTransitioning.current) {
      const lerpAlpha = Math.min(1, delta * 3.8);
      controls.target.lerp(targetLookAt.current, lerpAlpha);
      camera.position.lerp(targetCamPos.current, lerpAlpha);
      controls.update();

      if (
        controls.target.distanceTo(targetLookAt.current) < 0.06 &&
        camera.position.distanceTo(targetCamPos.current) < 0.1
      ) {
        isTransitioning.current = false;
      }
    }

    // Immersive Walkthrough WASD / Arrow movement
    const keys = pressedKeysRef.current;
    const moveZ = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const moveX = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);

    if ((moveZ !== 0 || moveX !== 0) && cameraPreset === 'walkthrough') {
      isTransitioning.current = false;
      camera.getWorldDirection(WALK_FORWARD);
      WALK_FORWARD.y = 0;
      WALK_FORWARD.normalize();
      WALK_RIGHT.crossVectors(WALK_FORWARD, camera.up).normalize();

      const speed = 7.5 * Math.min(delta, 0.08);
      const dx = (WALK_FORWARD.x * moveZ + WALK_RIGHT.x * moveX) * speed;
      const dz = (WALK_FORWARD.z * moveZ + WALK_RIGHT.z * moveX) * speed;

      const [cx, cy, cz] = clampWalkableCameraPosition(
        camera.position.x + dx,
        camera.position.y,
        camera.position.z + dz
      );
      const actualDx = cx - camera.position.x;
      const actualDz = cz - camera.position.z;

      camera.position.set(cx, cy, cz);
      controls.target.x += actualDx;
      controls.target.z += actualDz;
      controls.update();
    } else {
      // Prevent manual orbit panning from clipping beneath floor or far outside skyline
      const [cx, cy, cz] = clampWalkableCameraPosition(
        camera.position.x,
        camera.position.y,
        camera.position.z
      );
      camera.position.set(cx, cy, cz);
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.08}
      minDistance={cameraPreset === 'walkthrough' ? 2.5 : 5}
      maxDistance={95}
      minPolarAngle={cameraPreset === 'floorplan' ? 0 : Math.PI / 10}
      maxPolarAngle={cameraPreset === 'floorplan' ? Math.PI : Math.PI / 2.08}
      onStart={() => {
        isTransitioning.current = false;
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      enablePan
      enableZoom
      enableRotate
    />
  );
}
