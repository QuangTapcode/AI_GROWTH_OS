'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinnedScene } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { AgentStatusCode } from '../types';

export type GlbClipName =
  | 'Idle'
  | 'Typing'
  | 'Walk'
  | 'Thinking'
  | 'Talking'
  | 'Success'
  | 'SitDown';

/**
 * Maps the 8 AI Growth OS agent codes to the validated GLB character assets
 * located in `/apps/web/public/models/agents/`.
 */
export const AGENT_GLB_MODEL_URLS: Record<string, string> = {
  growth_lead: '/models/agents/growth-lead.glb',
  asset_manager: '/models/agents/drive-asset-manager.glb',
  content_planner: '/models/agents/content-planner-seo.glb',
  publisher: '/models/agents/multi-channel-publisher.glb',
  gmaps_specialist: '/models/agents/google-maps-specialist.glb',
  comment_reply: '/models/agents/social-comment-reply.glb',
  inbox_concierge: '/models/agents/omnichannel-inbox-concierge.glb',
  community_growth: '/models/agents/community-growth.glb',
};

export function hasCustomGlbAgent(agentCode: string): boolean {
  return Boolean(AGENT_GLB_MODEL_URLS[agentCode]);
}

export function getAgentGlbUrl(agentCode: string): string | null {
  return AGENT_GLB_MODEL_URLS[agentCode] ?? null;
}

function applyMorphTarget(mesh: THREE.Mesh, key: string, target: number, alpha: number) {
  const dict = mesh.morphTargetDictionary;
  const inf = mesh.morphTargetInfluences;
  if (!dict || !inf) return;
  const idx = dict[key];
  if (idx !== undefined) {
    inf[idx] = THREE.MathUtils.lerp(inf[idx], target, alpha);
  }
}

const _tmpBox = new THREE.Box3();

/**
 * Resolves the exported primitive-order material shift present in the 8 GLB assets by matching
 * each primitive mesh's exact vertex count & anatomical Y bounds back to its named material
 * (`Skin`, `Hair`, `Jacket`, `Shirt`, `Pants`, `Shoes`, `Sole`, `Eye White`, `Iris`, `Pupil`, etc.).
 */
function remapGlbMaterialsByAnatomy(root: THREE.Object3D): THREE.Material[] {
  const matByName = new Map<string, THREE.Material>();
  const meshes: THREE.Mesh[] = [];

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      meshes.push(mesh);
      const mat = mesh.material;
      if (mat && !Array.isArray(mat) && mat.name && !matByName.has(mat.name)) {
        matByName.set(mat.name, mat);
      }
    }
  });

  const createdExtras: THREE.Material[] = [];
  if (!matByName.has('Glasses')) {
    const m = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.8, roughness: 0.2, name: 'Glasses' });
    matByName.set('Glasses', m);
    createdExtras.push(m);
  }
  if (!matByName.has('Screen')) {
    const m = new THREE.MeshStandardMaterial({
      color: '#0369a1',
      emissive: '#38bdf8',
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.35,
      name: 'Screen',
    });
    matByName.set('Screen', m);
    createdExtras.push(m);
  }

  for (const mesh of meshes) {
    const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const v = pos.count;
    _tmpBox.setFromBufferAttribute(pos);

    let targetMatName: string | null = null;
    if (v === 7037) targetMatName = 'Skin';
    else if (v === 2442) targetMatName = 'Jacket';
    else if (v === 1204) targetMatName = 'Shirt';
    else if (v === 2115) targetMatName = 'Pants';
    else if (v === 690) targetMatName = 'Shoes';
    else if (v === 48) targetMatName = 'Sole';
    else if (v === 888) targetMatName = 'Eye White';
    else if (v === 494) targetMatName = 'Iris';
    else if (v === 374) targetMatName = 'Pupil';
    else if (v === 231) targetMatName = 'Mouth';
    else if (v === 153) targetMatName = 'Teeth';
    else if (v === 720) targetMatName = 'Glasses';
    else if (v === 468) targetMatName = 'Metal';
    else if (v === 99 || (v === 24 && _tmpBox.max.y < 1.0)) targetMatName = 'Screen';
    else if (v === 24 || v === 87) targetMatName = 'Metal';
    else if (v === 516) targetMatName = 'Fabric Detail';
    else if (v >= 2200 && _tmpBox.max.y > 1.79) targetMatName = 'Hair';
    else if (v === 519 || v === 543 || v === 1127 || v === 362) targetMatName = 'Accent';

    if (targetMatName) {
      const resolved = matByName.get(targetMatName);
      if (resolved) mesh.material = resolved;
    }
  }

  return createdExtras;
}

interface GlbAgentCharacterProps {
  modelUrl: string;
  agentCode: string;
  status: AgentStatusCode;
  isSelected: boolean;
  navModeRef: React.MutableRefObject<'at_desk' | 'walking_out' | 'at_target' | 'returning'>;
  celebrateUntilRef: React.MutableRefObject<number>;
  moverRef: React.RefObject<THREE.Group | null>;
}

/**
 * Renders an official rigged `.glb` human character (`17` joints, `6` facial morph targets, `7` clips).
 * - Clones via `SkeletonUtils.clone` per instance for independent animations & morph weights
 * - Layers seated leg pose (`SitDown` clamped) beneath `Idle`/`Typing`/`Thinking`/`Success` when at desk
 * - Drives real morph targets (`smile`, `blinkLeft`, `blinkRight`, `focused`, `surprised`, `jawOpen`)
 * - Applies Head bone LookAt tracking toward monitors or selected camera
 */
export function GlbAgentCharacter({
  modelUrl,
  agentCode,
  status,
  isSelected,
  navModeRef,
  celebrateUntilRef,
  moverRef,
}: GlbAgentCharacterProps) {
  const gltf = useGLTF(modelUrl);
  const { camera } = useThree();

  const innerSeatRef = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Partial<Record<GlbClipName, THREE.AnimationAction>>>({});
  const morphMeshesRef = useRef<THREE.Mesh[]>([]);
  const headBoneRef = useRef<THREE.Object3D | null>(null);
  const activeUpperClipRef = useRef<GlbClipName>('Idle');
  const wasSeatedRef = useRef(true);
  const blinkTimerRef = useRef(2.2 + (agentCode.length % 3) * 0.7);
  const blinkPhaseRef = useRef(0);

  // Clone scene cleanly, fix anatomical material assignments & sanitize SitDown leg tracks
  const { clonedScene, sanitizedClips, createdMaterials } = useMemo(() => {
    const cloned = cloneSkinnedScene(gltf.scene);
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = true;
      }
    });
    const extraMats = remapGlbMaterialsByAnatomy(cloned);

    const clips: Partial<Record<GlbClipName, THREE.AnimationClip>> = {};
    for (const rawClip of gltf.animations) {
      const name = rawClip.name as GlbClipName;
      if (name === 'SitDown') {
        const clonedSit = rawClip.clone();
        clonedSit.tracks = clonedSit.tracks.filter((t) => !t.name.startsWith('Chest.'));
        clips.SitDown = clonedSit;
      } else {
        clips[name] = rawClip;
      }
    }

    return { clonedScene: cloned, sanitizedClips: clips, createdMaterials: extraMats };
  }, [gltf.scene, gltf.animations]);

  useEffect(() => {
    return () => {
      for (const m of createdMaterials) m.dispose();
    };
  }, [createdMaterials]);

  // Initialize AnimationMixer, morph target meshes & Head bone safely inside useEffect
  useEffect(() => {
    const meshes: THREE.Mesh[] = [];
    let headObj: THREE.Object3D | null = null;
    clonedScene.traverse((obj) => {
      if (obj.name === 'Head') headObj = obj;
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
          meshes.push(mesh);
        }
      }
    });
    morphMeshesRef.current = meshes;
    headBoneRef.current = headObj;

    const mixer = new THREE.AnimationMixer(clonedScene);
    const actionMap: Partial<Record<GlbClipName, THREE.AnimationAction>> = {};

    (Object.keys(sanitizedClips) as GlbClipName[]).forEach((name) => {
      const clip = sanitizedClips[name];
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.enabled = true;
      if (name === 'SitDown') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else if (name === 'Success') {
        action.setLoop(THREE.LoopRepeat, 2);
      }
      actionMap[name] = action;
    });

    // Start seated cleanly at the desk on initial mount
    const sitAction = actionMap.SitDown;
    if (sitAction) {
      sitAction.play();
      sitAction.time = sitAction.getClip().duration;
    }
    const idleAction = actionMap.Idle;
    if (idleAction) {
      idleAction.play();
    }

    mixerRef.current = mixer;
    actionsRef.current = actionMap;
    activeUpperClipRef.current = 'Idle';
    wasSeatedRef.current = true;

    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(clonedScene);
      mixerRef.current = null;
    };
  }, [clonedScene, sanitizedClips]);

  const fadeToClip = (nextName: GlbClipName, duration = 0.28) => {
    if (activeUpperClipRef.current === nextName) return;
    const prevAction = actionsRef.current[activeUpperClipRef.current];
    const nextAction = actionsRef.current[nextName];
    if (!nextAction) return;
    nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (prevAction && prevAction !== nextAction) {
      prevAction.crossFadeTo(nextAction, duration, true);
    }
    activeUpperClipRef.current = nextName;
  };

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.08);
    const elapsed = state.clock.elapsedTime;
    const navMode = navModeRef.current;
    const isSeated = navMode === 'at_desk';

    // 1. Sync seated hip offset so legs sit accurately on chair cushion (y = 0.49) & stand at floor y = 0
    if (innerSeatRef.current) {
      const targetY = isSeated ? -0.43 : 0;
      innerSeatRef.current.position.y = THREE.MathUtils.lerp(
        innerSeatRef.current.position.y,
        targetY,
        Math.min(1, dt * 7.5)
      );
    }

    // 2. Sync SitDown leg posture layer
    const sitAction = actionsRef.current.SitDown;
    if (sitAction && wasSeatedRef.current !== isSeated) {
      if (isSeated) {
        sitAction.reset().setEffectiveWeight(1).play();
      } else {
        sitAction.fadeOut(0.24);
      }
      wasSeatedRef.current = isSeated;
    }

    // 3. Choose upper-body / full-body AnimationClip matching exact business state
    if (navMode === 'walking_out' || navMode === 'returning') {
      fadeToClip('Walk', 0.22);
    } else if (navMode === 'at_target') {
      fadeToClip('Talking', 0.28);
    } else {
      const nowMs = performance.now();
      if (nowMs < celebrateUntilRef.current) {
        fadeToClip('Success', 0.22);
      } else if (status === 'running') {
        fadeToClip('Typing', 0.26);
      } else if (status === 'queued' || status === 'needs_review') {
        fadeToClip('Thinking', 0.3);
      } else {
        fadeToClip('Idle', 0.35);
      }
    }

    // 4. Advance AnimationMixer
    if (mixerRef.current) {
      mixerRef.current.update(dt);
    }

    // 5. Real Morph Target Facial Rig (`smile`, `blinkLeft`, `blinkRight`, `focused`, `surprised`, `jawOpen`)
    blinkTimerRef.current -= dt;
    let blinkWeight = 0;
    if (blinkTimerRef.current <= 0) {
      blinkPhaseRef.current += dt * 12;
      blinkWeight = Math.sin(Math.min(Math.PI, blinkPhaseRef.current));
      if (blinkPhaseRef.current >= Math.PI) {
        blinkPhaseRef.current = 0;
        blinkTimerRef.current = 3.0 + Math.random() * 2.8;
      }
    }

    const isCelebrating = performance.now() < celebrateUntilRef.current;
    const isTalking = navMode === 'at_target';
    const wantSmile = isCelebrating || isSelected ? 0.85 : status === 'completed' ? 0.6 : 0;
    const wantFocused = status === 'running' ? 0.8 : 0;
    const wantSurprised = status === 'needs_review' || status === 'error' ? 0.55 : 0;
    const wantJawOpen = isTalking ? 0.3 + Math.abs(Math.sin(elapsed * 9)) * 0.55 : 0;

    for (const mesh of morphMeshesRef.current) {
      applyMorphTarget(mesh, 'blinkLeft', blinkWeight, Math.min(1, dt * 24));
      applyMorphTarget(mesh, 'blinkRight', blinkWeight, Math.min(1, dt * 24));
      applyMorphTarget(mesh, 'smile', wantSmile, Math.min(1, dt * 6));
      applyMorphTarget(mesh, 'focused', wantFocused, Math.min(1, dt * 6));
      applyMorphTarget(mesh, 'surprised', wantSurprised, Math.min(1, dt * 6));
      applyMorphTarget(mesh, 'jawOpen', wantJawOpen, Math.min(1, dt * 14));
    }

    // 6. Head LookAt subtle bone tracking toward dual monitors or selected user camera
    const headNode = headBoneRef.current;
    if (headNode && moverRef.current) {
      let yawOffset = 0;
      let pitchOffset = 0;

      if (isSelected && isSeated) {
        const toCamX = camera.position.x - moverRef.current.position.x;
        const toCamZ = camera.position.z - moverRef.current.position.z;
        const localCamYaw = Math.atan2(toCamX, toCamZ) - (moverRef.current.rotation.y + Math.PI);
        const normYaw = Math.atan2(Math.sin(localCamYaw), Math.cos(localCamYaw));
        yawOffset = THREE.MathUtils.clamp(normYaw, -0.55, 0.55);
        pitchOffset = -0.08;
      } else if (status === 'running' && isSeated) {
        yawOffset = Math.sin(elapsed * 0.85) * 0.18;
        pitchOffset = 0.08;
      }

      headNode.rotation.y = THREE.MathUtils.lerp(
        headNode.rotation.y,
        yawOffset,
        Math.min(1, dt * 4)
      );
      headNode.rotation.x = THREE.MathUtils.lerp(
        headNode.rotation.x,
        pitchOffset,
        Math.min(1, dt * 4)
      );
    }
  });

  // Rotate GLB +Z forward by Math.PI so it aligns cleanly with desk -Z forward convention
  return (
    <group ref={innerSeatRef} position={[0, -0.43, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}
