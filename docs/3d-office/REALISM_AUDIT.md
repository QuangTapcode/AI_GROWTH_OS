# PHASE 0 – VISUAL AND TECHNICAL REALISM AUDIT
**Project**: AI Growth OS – Ultra Realistic Corporate Headquarters 2026  
**Workspace**: `apps/web/src/features/office`  
**Audit Date**: 2026-11-25  
**Baseline Stack**: Next.js `16.3.8`, React `19.3.0`, Three.js `^0.187.0`, `@react-three/fiber` `^9.8.2`, `@react-three/drei` `^10.7.9`, `motion` `^14.14.0`, TypeScript `5.9.3`

---

## 1. Current 3D Implementation Audit Matrix

| # | Component / Area | Current File | Current Implementation | Gap vs 2026 Realism Spec | Reusability |
|---|---|---|---|---|---|
| 1 | **OfficeCanvas** | `scene/OfficeCanvas.tsx` | Single persistent `<Canvas>` with `dpr` quality presets (`performance`/`balanced`/`high`), `visibilitychange` frameloop pause, WebGL context-loss fallback, React 19 native `OfficeHtmlOverlayLayer`. | Lacks Environment HDRI/Sky reflection rig, Time-of-Day lighting selector, Cutaway vs Interior ceiling toggle, FPS/telemetry benchmark hook. | **Keep & Extend** |
| 2 | **OfficeScene** | `scene/OfficeScene.tsx` | Mounts floor, 14 department floor pads, `CentralAICore`, `OfficeDecorations`, `AgentHandoffBeam`, 8 `AgentDeskPlaceholder`s, `OfficeHtmlProjector`. | Lacks Layer 1 Exterior building/entrance/landscape, architectural walls/doors/ceilings, Time-of-Day lighting, navigation graph & walking agents. | **Keep & Extend** |
| 3 | **OfficeEnvironment / Floor** | `scene/OfficeFloor.tsx` | Single 64m×48m flat `#E2E8F0` plane, cross-corridors, dark rotunda, 0.28m perimeter baseboards, flat North glass strip (`opacity: 0.22`), East/West balustrades. | No PBR textures (flat scalar colors), no exterior building facade, no main sliding entrance doors, no AI Growth OS signage, no outdoor urban cityscape/trees/parking/driveway, no sky/HDRI. | **Major Upgrade (Phase 1)** |
| 4 | **Department Rooms** | `scene/DepartmentRooms.tsx` & `config/roomRegistry.ts` | `roomRegistry.ts` maps all 27 routes across 14 rooms accurately. 3D scene renders translucent floor pads + neon strips + East/West low glass partitions (1.8m). Interactive props exist for 8 rooms only (`reception_lobby`, `server_room`, `review_room`, `workflow_center`, `knowledge_library`, `research_room`, `help_finance_desk`, `community_hub`). | Missing solid/glass enclosed walls, real hinged/sliding interactive doors, suspended ceiling with recessed LEDs/HVAC/sprinklers, and dedicated realistic furniture for 6 remaining rooms (`content_studio`, `publishing_studio`, `gmaps_lab`, `social_center`, `concierge_lounge`, `command_center` executive table) + break/boardroom assets. | **Upgrade Architecture & Furniture (Phase 1–2)** |
| 5 | **Agent Characters** | `scene/AgentDeskPlaceholder.tsx` | Stylized capsule torso (`capsuleGeometry`), sphere head (`sphereGeometry`), visor box, capsule arms. Animation uses inline sinusoidal rotation (`Math.sin(elapsed * 12)`). | **CRITICAL GAP**: No human anatomy (no legs, feet, hands, fingers, face, hair, clothing), no skeleton (`THREE.Skeleton`/`Bone`), no facial rig/morph targets (`Blink`, `Smile`, `Focused`, `Talking`), no eye tracking (`LookAt`), no `AnimationMixer`/`AnimationClip`, no walking or door navigation. | **Replace Avatar Layer; Keep Desk/Route Binding (Phase 4–7)** |
| 6 | **Agent Desk & Accessories** | `scene/AgentDeskPlaceholder.tsx`, `scene/AgentRoleAccessories.tsx` | 2.5m×1.2m desk, dual curved monitors, keyboard, mouse, ergonomic chair, 8 role accessories (wireframe globe, NVMe stack, dossier, 9:16 phone, Maps pin, chat bubble, VIP bell, community ring). | Flat scalar materials (no wood/metal/fabric PBR texture maps), monitors use solid `#0284C7`/status colors instead of live canvas/procedural telemetry screens, un-instanced geometry across 8 stations, inline `pointLight` per desk (8 lights). | **Upgrade Materials & Instancing (Phase 3 & 12)** |
| 7 | **Agent Animation & Behavior** | Inside `AgentDeskPlaceholder.tsx` | Inline `useFrame` math on capsule avatar & `statusBeaconRef` / `ringRef`. | No `AnimationMixer`, `AnimationAction`, `.crossFadeTo()` blending, no posture transitions (`sit ↔ stand ↔ walk ↔ talk ↔ present`), no Break Room or Boardroom attendance behaviors. | **BuildDedicated Animation + Behavior System (Phase 4–9)** |
| 8 | **Agent Status Effect & Handoff** | `scene/AgentDeskPlaceholder.tsx`, `workflow/AgentHandoffBeam.tsx` | Floating octahedron status beacon + floor ring + curved bezier particle stream between `OFFICE_AGENTS_CONFIG` coordinates. | `AgentHandoffBeam.tsx` and `CentralAICore.tsx` instantiate `new THREE.Line(new THREE.BufferGeometry()...)` directly inside JSX `.map()` on render without memoization/disposal (**memory leak**). | **Fix Memory Leak & Preserve Business Event Triggers** |
| 9 | **OfficeCamera** | `scene/OfficeCamera.tsx` | Smooth damped `OrbitControls` with 4 presets (`overview`, `floorplan`, `room`, `agent`). | Lacks `Immersive Walkthrough` mode (WASD + mouse exploration + height clamping), camera floor/wall collision clamping, and auto ceiling cutaway detection. | **Extend (Phase 9)** |
| 10 | **OfficeLighting** | Inside `scene/OfficeScene.tsx` | 1 ambientLight + 3 directionalLights (`shadowMapSize` 512/1024/2048). | Static lighting only; lacks `Morning` / `Daytime` / `Evening` / `Night` presets, procedural HDR environment map reflections, realistic interior recessed ceiling lights, exterior street/facade lights at night. | **Extract & Upgrade to `OfficeLighting.tsx` (Phase 8)** |
| 11 | **UI Consoles & Shell** | `ImmersiveOfficeShell.tsx`, `AgentInspector.tsx`, `DepartmentConsolePanel.tsx`, `OfficeHUD.tsx`, `OfficeFloorPlan.tsx`, `OfficeCommandPalette.tsx`, `OfficeHtmlOverlay.tsx` | Full sidebar-free unified shell preserving all 27 routes, real API calls, Vitest coverage, and React 19 native `OfficeHtmlOverlayLayer` (0 unmount errors). | Add non-intrusive HUD controls for Time-of-Day (`Morning`/`Day`/`Evening`/`Night`), Ceiling (`Cutaway`/`Interior`), Camera Walkthrough (`WASD`), and optional muted ambience/SFX toggle without altering business routes. | **100% Preserve & Lightly Extend** |

---

## 2. GLB / VRM / PBR / Rig Verification Summary

- **GLB / VRM Assets in `apps/web/public/models/`**: **None (0 `.glb`, 0 `.gltf`, 0 `.vrm`, 0 `.hdr` files)**. Only `ATTRIBUTION.md` exists.
- **Skeletons Found**: **0** (avatars are primitive meshes in `AgentDeskPlaceholder.tsx`).
- **Facial Rigs / Morph Targets Found**: **0**.
- **Animation Clips Found**: **0** (`THREE.AnimationMixer` is not currently used anywhere in `apps/web`).
- **PBR Texture Maps Found**: **0** (all materials rely on scalar `color`, `roughness`, `metalness`).
- **Colliders / Navigation Graph Found**: **0** (no room wall colliders, doorway triggers, or walkable corridor graph).
- **FPS / Draw-Call Risks Identified**:
  1. `CentralAICore.tsx:166` and `AgentHandoffBeam.tsx:59` construct `new THREE.Line(new THREE.BufferGeometry()..., new THREE.LineBasicMaterial(...))` inline inside JSX `.map()` without `useMemo` or `.dispose()`.
  2. ~16 active `<pointLight>` instances across desks, accessories, handoff spheres, and core increase fragment shader cost unnecessarily.
  3. Repeated furniture/mullion/plant meshes do not share memoized geometries or `InstancedMesh`.

---

## 3. Baseline Verification Snapshot (Pre-Implementation)

- `cd apps/web && npm run typecheck`: **PASS** (0 errors).
- `cd apps/web && npx eslint src/features/office`: **PASS** (0 errors).
- `cd apps/web && npm run test:components`: **PASS** (`36/36` tests across `MediaAssetImage.test.tsx`, `ApprovalView.test.tsx`, `OfficeFeature.test.tsx`).
- `cd apps/web && npm run build`: **PASS** (`27/27` routes built).
- `cd apps/web && npm test` (`tests/bootstrap.test.mjs`): **FAIL (Expected due to UI preview flag)** — asserts `/` redirects to `/login`, currently temporarily set to `/office` per user request for UI inspection without backend `:4000`.
- `Playwright live browser audit` (`http://localhost:3000/office`): **PASS** — `UNMOUNT_ERRORS_COUNT: 0`, only console error is `ERR_CONNECTION_REFUSED` when local API `:4000` is stopped.

---

## 4. Asset Gap & Human Review Plan

Because `public/models/` currently contains zero external `.glb`/`.vrm`/`.hdr` files:
1. **Architecture, Interior, Exterior & Procedural PBR Pipeline (Phases 1–3, 8–10)**:
   - Implement procedural high-resolution `CanvasTexture` PBR generators (`map`, `roughnessMap`, `bumpMap/normalMap`) cached in GPU memory for polished concrete, oak wood, marble granite, brushed aluminum, perforated acoustic ceiling tiles, fabric upholstery, and asphalt/brick paving.
   - Build a complete multi-layer architectural building (`64m × 48m` interior + surrounding outdoor plaza, automated sliding entrance doors, glass curtain walls, real walls/doors for all 14 rooms, cutaway/interior ceiling with recessed LEDs/HVAC/sprinklers, Time-of-Day lighting, exterior urban skyline & trees).
2. **Human Character Pipeline (Phases 4–7)**:
   - Implement a **dual-mode Human Character Engine**:
     - **Path A (GLB/VRM Production Loader)**: Automatic loader checking `/models/agents/<code >.glb` (or `.vrm`) with full `SkeletonUtils` cloning, `THREE.AnimationMixer` + `.crossFadeTo()` clip blending, morph-target facial expression driver, and bone `LookAt` eye/head tracking.
     - **Path B (Articulated Procedural Human Rig — Built-in Fallback)**: Until sculpted external Blender/CC0 human `.glb`/`.vrm` models are supplied for the 8 roles, replace all capsule/sphere droids with **anatomically proportioned, clothed humanoid rigs** built from hierarchical `THREE.Bone`/`Group` skeletons (`Hips` → `Spine` → `Chest` → `Neck` → `Head`, `Clavicle`/`UpperArm`/`Forearm`/`Hand`, `Thigh`/`Shin`/`Foot`), distinct facial geometry (eyes with pupils/irises, blinking eyelids, eyebrows, nose, articulated jaw/lips morphing expressions), layered hair, role-specific corporate outfits, and genuine `THREE.AnimationMixer` `KeyframeTrack` `AnimationClip`s (`idle`, `walk`, `sit`, `stand`, `work`, `think`, `talk`, `present`, `celebrate`).
   - **Explicit Human Review Disclosure**: Procedural humanoid geometry cannot match bespoke ZBrush/Blender photogrammetry facial skin/cloth creases; any external `.glb`/`.vrm` character pack selected by human reviewers can be dropped into `public/models/agents/` to upgrade meshes seamlessly while keeping 100% of our rigging, animation blending, pathfinding, and business logic.
