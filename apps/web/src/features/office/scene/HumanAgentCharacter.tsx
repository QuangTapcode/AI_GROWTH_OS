'use client';

import React, { Component, Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OfficeAgentViewModel, WorkflowHandoff } from '../types';
import { getRoomById } from '../config/roomRegistry';
import { OFFICE_AGENTS_CONFIG } from '../config/agentLocations';
import { buildOfficeWaypointPath } from './OfficeNavigation';
import {
  AGENT_HUMAN_APPEARANCES,
  createMouthWithMorphTargets,
  FacialExpressionState,
  getHumanAnimationClips,
  HumanAnimationState,
} from './AgentHumanRig';
import { getAgentGlbUrl, GlbAgentCharacter } from './AgentGlbLoader';

interface HumanAgentCharacterProps {
  agent: OfficeAgentViewModel;
  isSelected: boolean;
  statusColor: string;
  handoffs?: WorkflowHandoff[];
  onPositionUpdate?: (code: string, pos: THREE.Vector3) => void;
}

/** Isolates GLB asset network failures so a missing model falls back safely to the procedural rig. */
class GlbErrorBoundary extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/** Fallback procedural articulated human skeleton rig (only used while GLB suspends or if missing). */
function ProceduralHumanRigFallback({
  agent,
  isSelected,
  statusColor,
  navModeRef,
  celebrateUntilRef,
  moverRef,
}: {
  agent: OfficeAgentViewModel;
  isSelected: boolean;
  statusColor: string;
  navModeRef: React.MutableRefObject<'at_desk' | 'walking_out' | 'at_target' | 'returning'>;
  celebrateUntilRef: React.MutableRefObject<number>;
  moverRef: React.RefObject<THREE.Group | null>;
}) {
  const appearance = AGENT_HUMAN_APPEARANCES[agent.code] ?? AGENT_HUMAN_APPEARANCES.growth_lead;
  const rigRootRef = useRef<THREE.Group>(null);
  const headLookRef = useRef<THREE.Group>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const leftLidRef = useRef<THREE.Mesh>(null);
  const rightLidRef = useRef<THREE.Mesh>(null);
  const mouthRef = useRef<THREE.Mesh>(null);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<HumanAnimationState, THREE.AnimationAction>>>({});
  const currentAnimRef = useRef<HumanAnimationState>('sit');
  const blinkTimerRef = useRef(2.0 + (agent.code.length % 3));
  const blinkProgressRef = useRef(0);
  const { camera } = useThree();

  const mouthMorph = useMemo(() => createMouthWithMorphTargets(), []);
  useEffect(() => () => mouthMorph.geometry.dispose(), [mouthMorph]);

  useEffect(() => {
    const rigNode = rigRootRef.current;
    if (!rigNode) return;
    const mixer = new THREE.AnimationMixer(rigNode);
    const clips = getHumanAnimationClips();
    const map: Partial<Record<HumanAnimationState, THREE.AnimationAction>> = {};
    (Object.keys(clips) as HumanAnimationState[]).forEach((key) => {
      const action = mixer.clipAction(clips[key]);
      action.enabled = true;
      map[key] = action;
    });
    map.sit?.play();
    mixerRef.current = mixer;
    actionsRef.current = map;
    currentAnimRef.current = 'sit';
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(rigNode);
      mixerRef.current = null;
    };
  }, []);

  const switchAnim = (next: HumanAnimationState, duration = 0.28) => {
    if (currentAnimRef.current === next) return;
    const prevAction = actionsRef.current[currentAnimRef.current];
    const nextAction = actionsRef.current[next];
    if (!nextAction) return;
    nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (prevAction && prevAction !== nextAction) {
      prevAction.crossFadeTo(nextAction, duration, true);
    }
    currentAnimRef.current = next;
  };

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const navMode = navModeRef.current;

    if (navMode === 'walking_out' || navMode === 'returning') {
      switchAnim('walk', 0.22);
    } else if (navMode === 'at_target') {
      switchAnim('present', 0.32);
    } else if (performance.now() < celebrateUntilRef.current) {
      switchAnim('celebrate', 0.25);
    } else if (agent.status === 'running') {
      switchAnim('work', 0.3);
    } else if (agent.status === 'queued' || agent.status === 'needs_review') {
      switchAnim('think', 0.35);
    } else {
      switchAnim('sit', 0.4);
    }

    mixerRef.current?.update(dt);

    blinkTimerRef.current -= dt;
    if (blinkTimerRef.current <= 0) {
      blinkProgressRef.current += dt * 11;
      const blinkAmount = Math.sin(Math.min(Math.PI, blinkProgressRef.current));
      if (leftLidRef.current && rightLidRef.current) {
        leftLidRef.current.scale.y = 0.15 + blinkAmount * 0.95;
        rightLidRef.current.scale.y = 0.15 + blinkAmount * 0.95;
      }
      if (blinkProgressRef.current >= Math.PI) {
        blinkProgressRef.current = 0;
        blinkTimerRef.current = 3.2 + Math.random() * 2.8;
      }
    }

    let expr: FacialExpressionState = 'neutral';
    if (performance.now() < celebrateUntilRef.current) expr = 'smile';
    else if (navMode === 'at_target') expr = 'talking';
    else if (agent.status === 'running') expr = 'focused';
    else if (agent.status === 'queued') expr = 'thinking';
    else if (agent.status === 'needs_review' || agent.status === 'error') expr = 'concerned';
    else if (isSelected) expr = 'smile';

    if (mouthRef.current?.morphTargetInfluences) {
      const inf = mouthRef.current.morphTargetInfluences;
      const lerpF = Math.min(1, dt * 7);
      inf[0] = THREE.MathUtils.lerp(inf[0], expr === 'smile' ? 1 : 0, lerpF);
      inf[1] = THREE.MathUtils.lerp(inf[1], expr === 'talking' ? 0.5 : 0, lerpF);
      inf[2] = THREE.MathUtils.lerp(inf[2], expr === 'concerned' ? 0.9 : 0, lerpF);
      inf[3] = THREE.MathUtils.lerp(inf[3], expr === 'focused' ? 0.8 : 0, lerpF);
    }

    if (headLookRef.current && moverRef.current && isSelected && navMode === 'at_desk') {
      const toCamX = camera.position.x - moverRef.current.position.x;
      const toCamZ = camera.position.z - moverRef.current.position.z;
      const localCamYaw = Math.atan2(-toCamX, -toCamZ) - moverRef.current.rotation.y;
      const normYaw = Math.atan2(Math.sin(localCamYaw), Math.cos(localCamYaw));
      headLookRef.current.rotation.y = THREE.MathUtils.lerp(
        headLookRef.current.rotation.y,
        THREE.MathUtils.clamp(normYaw, -0.65, 0.65),
        dt * 4.5
      );
    }
  });

  return (
    <group ref={rigRootRef} scale={[appearance.shoulderScale ?? 1, appearance.heightScale ?? 1, appearance.shoulderScale ?? 1]}>
      <group name="Hips" position={[0, 0.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.32, 0.14, 0.2]} />
          <meshStandardMaterial color={appearance.pantsColor} roughness={0.78} />
        </mesh>
        <group name="Spine" position={[0, 0.08, 0]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <boxGeometry args={[0.28, 0.22, 0.17]} />
            <meshStandardMaterial color={appearance.shirtColor} roughness={0.65} />
          </mesh>
          <group name="Chest" position={[0, 0.22, 0]}>
            <mesh position={[0, 0.13, 0]} castShadow>
              <boxGeometry args={[0.35, 0.26, 0.2]} />
              <meshStandardMaterial color={appearance.jacketColor} roughness={0.58} />
            </mesh>
            <mesh position={[-0.1, 0.16, -0.105]}>
              <sphereGeometry args={[0.015, 8, 8]} />
              <meshBasicMaterial color={statusColor} />
            </mesh>
            <group name="Neck" position={[0, 0.28, 0]}>
              <mesh position={[0, 0.04, 0]} castShadow>
                <cylinderGeometry args={[0.052, 0.06, 0.1, 12]} />
                <meshStandardMaterial color={appearance.skinColor} roughness={0.62} />
              </mesh>
              <group name="Head" ref={headLookRef} position={[0, 0.17, 0]}>
                <mesh castShadow scale={[0.92, 1.06, 0.98]}>
                  <sphereGeometry args={[0.125, 16, 16]} />
                  <meshStandardMaterial color={appearance.skinColor} roughness={0.58} />
                </mesh>
                {[-0.042, 0.042].map((ex, eyeIdx) => (
                  <group key={`eye-${eyeIdx}`} position={[ex, 0.015, -0.108]}>
                    <mesh>
                      <sphereGeometry args={[0.018, 10, 10]} />
                      <meshStandardMaterial color="#f8fafc" roughness={0.2} />
                    </mesh>
                    <mesh ref={eyeIdx === 0 ? leftPupilRef : rightPupilRef} position={[0, 0, -0.012]}>
                      <sphereGeometry args={[0.009, 8, 8]} />
                      <meshStandardMaterial color={appearance.eyeColor} roughness={0.1} />
                    </mesh>
                    <mesh ref={eyeIdx === 0 ? leftLidRef : rightLidRef} position={[0, 0.012, -0.009]} scale={[1, 0.15, 1]}>
                      <boxGeometry args={[0.036, 0.034, 0.018]} />
                      <meshStandardMaterial color={appearance.skinColor} roughness={0.6} />
                    </mesh>
                  </group>
                ))}
                <mesh
                  ref={mouthRef}
                  geometry={mouthMorph.geometry}
                  morphTargetDictionary={mouthMorph.dictionary}
                  morphTargetInfluences={[0, 0, 0, 0]}
                  position={[0, -0.056, -0.115]}
                >
                  <meshStandardMaterial color="#b46960" roughness={0.55} />
                </mesh>
                <mesh position={[0, 0.045, 0.015]} castShadow scale={[0.96, 0.9, 1.02]}>
                  <sphereGeometry args={[0.128, 14, 14, 0, Math.PI * 2, 0, Math.PI * 0.56]} />
                  <meshStandardMaterial color={appearance.hairColor} roughness={0.82} />
                </mesh>
              </group>
            </group>
            <group name="LeftShoulder" position={[-0.21, 0.21, 0]}>
              <group name="LeftUpperArm">
                <mesh position={[0, -0.13, 0]} castShadow>
                  <capsuleGeometry args={[0.052, 0.2, 6, 10]} />
                  <meshStandardMaterial color={appearance.jacketColor} roughness={0.6} />
                </mesh>
                <group name="LeftForearm" position={[0, -0.26, 0]}>
                  <mesh position={[0, -0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.042, 0.18, 6, 10]} />
                    <meshStandardMaterial color={appearance.jacketColor} roughness={0.6} />
                  </mesh>
                </group>
              </group>
            </group>
            <group name="RightShoulder" position={[0.21, 0.21, 0]}>
              <group name="RightUpperArm">
                <mesh position={[0, -0.13, 0]} castShadow>
                  <capsuleGeometry args={[0.052, 0.2, 6, 10]} />
                  <meshStandardMaterial color={appearance.jacketColor} roughness={0.6} />
                </mesh>
                <group name="RightForearm" position={[0, -0.26, 0]}>
                  <mesh position={[0, -0.12, 0]} castShadow>
                    <capsuleGeometry args={[0.042, 0.18, 6, 10]} />
                    <meshStandardMaterial color={appearance.jacketColor} roughness={0.6} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
        <group name="LeftThigh" position={[-0.095, -0.04, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.068, 0.32, 6, 10]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.78} />
          </mesh>
          <group name="LeftShin" position={[0, -0.42, 0]}>
            <mesh position={[0, -0.19, 0]} castShadow>
              <capsuleGeometry args={[0.054, 0.32, 6, 10]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.78} />
            </mesh>
          </group>
        </group>
        <group name="RightThigh" position={[0.095, -0.04, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <capsuleGeometry args={[0.068, 0.32, 6, 10]} />
            <meshStandardMaterial color={appearance.pantsColor} roughness={0.78} />
          </mesh>
          <group name="RightShin" position={[0, -0.42, 0]}>
            <mesh position={[0, -0.19, 0]} castShadow>
              <capsuleGeometry args={[0.054, 0.32, 6, 10]} />
              <meshStandardMaterial color={appearance.pantsColor} roughness={0.78} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Shared Waypoint Pathfinding Controller wrapping either the validated `.glb` character model
 * (`public/models/agents/<role>.glb`) or the procedural fallback during suspend/offline errors.
 */
export function HumanAgentCharacter({
  agent,
  isSelected,
  statusColor,
  handoffs = [],
  onPositionUpdate,
}: HumanAgentCharacterProps) {
  const worldMoverRef = useRef<THREE.Group>(null);
  const waypointsRef = useRef<Array<[number, number, number]>>([]);
  const wpIndexRef = useRef(0);
  const navModeRef = useRef<'at_desk' | 'walking_out' | 'at_target' | 'returning'>('at_desk');
  const prevStatusRef = useRef(agent.status);
  const celebrateUntilRef = useRef(0);

  const glbUrl = getAgentGlbUrl(agent.code);

  const homeDeskConfig = useMemo(
    () => OFFICE_AGENTS_CONFIG.find((a) => a.code === agent.code),
    [agent.code]
  );

  const homeChairWorld = useMemo<[number, number, number]>(() => {
    const [dx, , dz] = agent.position;
    const rot = agent.rotationY;
    const localZ = 0.72;
    return [dx + Math.sin(rot) * localZ, 0, dz + Math.cos(rot) * localZ];
  }, [agent.position, agent.rotationY]);

  useEffect(() => {
    if (agent.status === 'completed' && prevStatusRef.current !== 'completed') {
      celebrateUntilRef.current = performance.now() + 2600;
    }
    prevStatusRef.current = agent.status;
  }, [agent.status]);

  const activeOutgoingHandoff = useMemo(
    () => handoffs.find((h) => h.active && h.sourceCode === agent.code),
    [handoffs, agent.code]
  );

  useEffect(() => {
    if (!homeDeskConfig) return;
    if (activeOutgoingHandoff) {
      const targetAgent = OFFICE_AGENTS_CONFIG.find((a) => a.code === activeOutgoingHandoff.targetCode);
      const targetRoom = targetAgent ? getRoomById(targetAgent.roomId) : getRoomById('command_center');
      if (targetRoom && targetRoom.id !== homeDeskConfig.roomId) {
        const destPoint: [number, number, number] = targetAgent
          ? [targetAgent.position[0] + 1.4, 0, targetAgent.position[2] + 1.4]
          : [targetRoom.bounds.x, 0, targetRoom.bounds.z];
        waypointsRef.current = buildOfficeWaypointPath(
          homeChairWorld,
          homeDeskConfig.roomId,
          targetRoom.id,
          destPoint
        );
        wpIndexRef.current = 1;
        navModeRef.current = 'walking_out';
        return;
      }
    }

    if (navModeRef.current === 'walking_out' || navModeRef.current === 'at_target') {
      const room = getRoomById(homeDeskConfig.roomId);
      const curPos = worldMoverRef.current
        ? ([
            worldMoverRef.current.position.x,
            0,
            worldMoverRef.current.position.z,
          ] as [number, number, number])
        : homeChairWorld;
      waypointsRef.current = buildOfficeWaypointPath(
        curPos,
        room?.id ?? 'command_center',
        homeDeskConfig.roomId,
        homeChairWorld
      );
      wpIndexRef.current = 1;
      navModeRef.current = 'returning';
    }
  }, [activeOutgoingHandoff, homeChairWorld, homeDeskConfig]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.08);
    const mover = worldMoverRef.current;
    if (!mover) return;

    const navMode = navModeRef.current;
    if (navMode === 'walking_out' || navMode === 'returning') {
      const pts = waypointsRef.current;
      const idx = wpIndexRef.current;
      if (idx < pts.length) {
        const [tx, , tz] = pts[idx];
        const dx = tx - mover.position.x;
        const dz = tz - mover.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist < 0.14) {
          wpIndexRef.current += 1;
        } else {
          const speed = 2.35;
          const step = Math.min(dist, speed * dt);
          mover.position.x += (dx / dist) * step;
          mover.position.z += (dz / dist) * step;

          const desiredYaw = Math.atan2(-dx, -dz);
          let diff = desiredYaw - mover.rotation.y;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          mover.rotation.y += diff * Math.min(1, dt * 8);
        }
      } else if (navMode === 'walking_out') {
        navModeRef.current = 'at_target';
      } else {
        navModeRef.current = 'at_desk';
        mover.position.set(...homeChairWorld);
      }
    } else if (navMode === 'at_desk') {
      mover.position.set(...homeChairWorld);
      let diff = agent.rotationY - mover.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      mover.rotation.y += diff * Math.min(1, dt * 8);
    }

    onPositionUpdate?.(agent.code, mover.position);
  });

  const fallbackNode = (
    <ProceduralHumanRigFallback
      agent={agent}
      isSelected={isSelected}
      statusColor={statusColor}
      navModeRef={navModeRef}
      celebrateUntilRef={celebrateUntilRef}
      moverRef={worldMoverRef}
    />
  );

  return (
    <group ref={worldMoverRef} position={homeChairWorld} rotation={[0, agent.rotationY, 0]}>
      {glbUrl ? (
        <GlbErrorBoundary fallback={fallbackNode}>
          <Suspense fallback={fallbackNode}>
            <GlbAgentCharacter
              modelUrl={glbUrl}
              agentCode={agent.code}
              status={agent.status}
              isSelected={isSelected}
              navModeRef={navModeRef}
              celebrateUntilRef={celebrateUntilRef}
              moverRef={worldMoverRef}
            />
          </Suspense>
        </GlbErrorBoundary>
      ) : (
        fallbackNode
      )}
    </group>
  );
}
