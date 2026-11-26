# 3D MODEL & ASSET ATTRIBUTION MANIFEST
**Project**: AI Growth OS – Ultra Realistic Autonomous Corporate Headquarters 2026  
**License Compliance**: Production Grade Verification

---

## 1. Rigged Humanoid Agent GLB Models (`/public/models/agents/`)
All 8 Autonomous Agent roles use bespoke GLTF/GLB rigged character assets featuring a **17-joint hierarchical skeleton** (`Hips`, `Spine`, `Chest`, `Neck`, `Head`, `UpperArm_L/R`, `LowerArm_L/R`, `Hand_L/R`, `UpperLeg_L/R`, `LowerLeg_L/R`, `Foot_L/R`), **6 facial morph targets** (`smile`, `blinkLeft`, `blinkRight`, `focused`, `surprised`, `jawOpen`), and **7 embedded animation clips** (`Idle`, `Typing`, `Walk`, `Thinking`, `Talking`, `Success`, `SitDown`).

| Agent Code | GLB File Path | File Size | Joints / Morphs / Clips | Origin |
| :--- | :--- | :--- | :--- | :--- |
| `growth_lead` | `public/models/agents/growth-lead.glb` | 3.06 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `asset_manager` | `public/models/agents/drive-asset-manager.glb` | 3.09 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `content_planner` | `public/models/agents/content-planner-seo.glb` | 3.02 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `publisher` | `public/models/agents/multi-channel-publisher.glb` | 2.89 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `gmaps_specialist` | `public/models/agents/google-maps-specialist.glb` | 3.03 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `comment_reply` | `public/models/agents/social-comment-reply.glb` | 3.44 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `inbox_concierge` | `public/models/agents/omnichannel-inbox-concierge.glb` | 3.18 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |
| `community_growth` | `public/models/agents/community-growth.glb` | 3.18 MB | 17 / 6 / 7 | AI Growth OS Agent Character Builder |

---

## 2. Procedural Architectural Environment & PBR Surfaces
| Asset Component | Geometry, Rig & Material Specs | Author / Origin | License | File Path |
| :--- | :--- | :--- | :--- | :--- |
| **Corporate Exterior Plaza & Facade** | 74m×58m paved sidewalk, 160m north boulevard, street lamps, parking, double sliding glass entrance doors with motion sensor & access pedestal, urban skyline & trees. | AI Growth OS Team | MIT | `src/features/office/scene/OfficeExterior.tsx` |
| **PBR Floor, Quartz Corridors & Curtain Walls** | 64m×48m polished concrete floor (`roughnessMap`), quartz cross-corridors, dark granite rotunda, 4-facade panoramic glass curtain walls with aluminum mullions & blinds. | AI Growth OS Team | MIT | `src/features/office/scene/OfficeFloor.tsx`, `pbrMaterials.ts` |
| **Suspended Ceiling & Technical Systems** | Acoustic tile ceiling grid, recessed LED troffers, steel structural beams, HVAC supply diffusers, fire sprinklers (`cutaway` / `interior` modes). | AI Growth OS Team | MIT | `src/features/office/scene/OfficeCeiling.tsx` |
| **14 Enclosed Department Rooms & Glass Doors** | Acoustic wainscot + tempered glass partition walls, swinging interactive/auto-trigger glass doors, live-textured screens, coffee machine w/ steam, GPU server racks. | AI Growth OS Team | MIT | `src/features/office/scene/DepartmentRooms.tsx`, `OfficeNavigation.ts` |
| **PBR Workstations & Dual Role Displays** | Natural oak tabletop (`bumpMap`), brushed aluminum frame, fabric ergonomic chairs, dual role-specific telemetry canvas monitors. | AI Growth OS Team | MIT | `src/features/office/scene/AgentDeskPlaceholder.tsx`, `pbrMaterials.ts` |
