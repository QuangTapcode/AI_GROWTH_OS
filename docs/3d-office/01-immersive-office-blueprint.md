# PHASE 0 & PHASE 1: COMPLETE SOURCE AUDIT, FUNCTION INVENTORY & ROOM MAPPING
**Project**: AI Growth OS — Full Immersive Autonomous 3D Office 2026  
**Date**: 2026-11-25  

---

## 1. Phase 0 — Source Audit Findings

### 1.1 Tech Stack Verified from `apps/web/package.json` & `package-lock.json`
- **Next.js**: `16.3.8` (App Router + Turbopack)
- **React / React DOM**: `19.3.0`
- **TypeScript**: `5.9.3` (strict)
- **Tailwind CSS**: `4.3.3` (`@tailwindcss/postcss` `^4.3.3`)
- **Node.js**: `>=24.14.1 <25`
- **3D Engine Installed**:
  - `three`: `0.187.0` (`@types/three`: `0.187.0`)
  - `@react-three/fiber`: `9.8.2` (stable v9 compatible with React 19; no v10 alpha)
  - `@react-three/drei`: `10.7.9`
  - `motion`: `^14.14.0` (`motion/react`)
- **Testing**: `vitest`, `@playwright/test` (`1.63.0`)

### 1.2 Left Sidebar Audit (Targets for Complete Removal from Authenticated UI)
Searching `DashboardSidebar` and `DashboardHeader` across `apps/web/src/` identified **exactly 2 files** rendering the old sidebar layout:
1. `apps/web/src/features/shell/AppShell.tsx` — wraps almost all authenticated pages with `<DashboardSidebar>` + `<DashboardHeader>`.
2. `apps/web/src/features/workspace-integrations/components/WorkspaceIntegrationsClientView.tsx` — independently imports and renders `<DashboardSidebar>` + `<DashboardHeader>`.
3. `apps/web/src/app/admin/gpu-workers/page.tsx` — standalone full-screen layout with `min-h-screen bg-slate-50` and manual breadcrumb.

### 1.3 Existing 3D Office Module Audit (`apps/web/src/features/office/`)
Previously built for `/office` route only:
- `OfficeClient.tsx`, `types.ts`, `config/agentLocations.ts`
- `scene/`: `OfficeCanvas.tsx`, `OfficeScene.tsx`, `OfficeFloor.tsx`, `CentralAICore.tsx`, `OfficeDecorations.tsx`, `OfficeCamera.tsx`, `AgentDeskPlaceholder.tsx`, `AgentRoleAccessories.tsx`
- `workflow/`: `AgentHandoffBeam.tsx`
- `components/`: `OfficeHUD.tsx`, `AgentInspector.tsx`, `AgentTaskSteps.tsx`, `OfficeFloorPlan.tsx`, `OfficeActivityTimeline.tsx`, `OfficeCommandPalette.tsx`, `OfficeActionModal.tsx`, `OfficeToast.tsx`, `OfficeErrorBoundary.tsx`, `Office2DFallback.tsx`, `OfficeLoadingFallback.tsx`
- **Gap identified**: Previously `/office` lived inside `AppShell` (which rendered `DashboardSidebar`), only covered `/office` instead of unifying all 18 routes into one persistent Canvas, contained hardcoded `INITIAL_EVENTS`/`INITIAL_HANDOFFS`, and only had 5 basic floor rugs instead of 14 distinct architectural corporate rooms with clickable terminals/doors.

### 1.4 Protected Core Infrastructure (100% Preserved)
- `WorkspaceProvider.tsx` (`useWorkspace`, `canEdit`, `canApprove`, `pendingReviewCount`, `openExceptionCount`, `selectWorkspace`, `logout`)
- `LanguageContext.tsx` (`vi`/`en` i18n)
- `lib/api.ts` (`apiRequest`, `growthApi`, `getApiHealth`) & `lib/apiTypes.ts`
- `lib/session.ts` (`getSession`, `saveSession`, `clearSession`, `getSelectedWorkspaceId`, `setSelectedWorkspaceId`)
- `lib/useApiData.ts` (`AbortController`-safe data hook)
- `WalletTopupModal.tsx` (VietQR topup) & `DailyExecutiveReportModal.tsx`

---

## 2. Phase 1 — Complete Function Inventory & 14-Room Spatial Mapping

Corporate HQ Footprint: **`64m (X: -32..32) x 48m (Z: -24..24)`**

| Room ID | Department Name | Zone [X, Z] | Size [W, D] | Existing Routes Mapped | Existing Feature Components Reused | Interactive 3D Objects |
|---|---|---|---|---|---|---|
| `command_center` | **Central Command Center** | `[0, 0]` | `14 x 12` | `/office`, `/dashboard`, `/agents`, `/growth-results`, `/health` | `DashboardClientView`, `AgentOperations`, `GrowthResultsClientView`, `ApiStatus`, Autopilot console | Central Holographic Core, Autopilot Console, Main Analytics Wall, Agent Ops Table |
| `reception_lobby` | **Integration Reception & Lobby** | `[0, -16]` | `18 x 8` | `/workspace`, `/workspace-integrations`, `/onboarding` | `WorkspaceClientView`, `WorkspaceIntegrationsClientView`, `ZeroTechOnboarding` | Reception Desk, Channel Connection Wall, Welcome Kiosk |
| `research_room` | **Research & Strategy Room** | `[-18, -14]` | `12 x 10` | `/agents/research`, `/agents/growth_lead` | `AgentDetailView` (`research`, `growth_lead`), `ResearchDiscoveryPanel` | Research Wall, Strategy Desk, Analytics Terminal |
| `knowledge_library` | **Asset & Knowledge Library** | `[-24, -2]` | `10 x 10` | `/knowledge-contexts`, `/gmaps?tab=drive_assets` | `KnowledgeContextsPage`, `GoogleMapsHub` (Drive Assets tab) | Digital Archive Pillars, Search Terminal, Drive Storage Rack |
| `workflow_center` | **Workflow Operations Center** | `[-12, -6]` | `10 x 8` | `/workflows` | `WorkflowsClientView`, `WorkflowPipelineCard`, `TasksTable`, `CreateTaskModal` | Workflow Holographic Table, Pipeline Wall, Task Console |
| `content_studio` | **Content Creation Studio** | `[-22, 10]` | `12 x 10` | `/agents/content`, `/agents/seo`, `/artifacts` | `AgentDetailView` (`content`, `seo`), `ArtifactsClientView` | Writing Desk, SEO Analytics Display, Artifact Vault |
| `review_room` | **Review & Quality Control Room** | `[-14, 17]` | `12 x 9` | `/review-queue` | `ReviewQueueClientView`, `ApprovalView`, `ReviewDetailView` | Executive Review Desk, Pending Approval Wall, QC Console |
| `publishing_studio` | **Publishing & Distribution Studio** | `[-2, 17]` | `10 x 9` | `/distribution` | `DistributionClientView`, `TikTokStudioSection`, `GeneratedPosts` | TikTok 9:16 Stage, Distribution Control Wall, Scheduling Desk |
| `gmaps_lab` | **Local Growth & Google Maps Lab** | `[10, 17]` | `10 x 9` | `/gmaps` | `GoogleMapsHub` | Interactive 3D Map Table, Local Business Display |
| `social_center` | **Social Engagement Center** | `[22, 10]` | `12 x 10` | `/agents/community#comments` | `AgentDetailView` (`community`), `KnowledgeGapsPanel` | Social Monitoring Wall, Comment Operations Desk |
| `concierge_lounge` | **Omnichannel Concierge** | `[24, -2]` | `10 x 10` | `/booking-leads` | `BookingLeadsHub` | VIP Concierge Desk, Customer Wall, Booking Terminal |
| `community_hub` | **Community & Performance Hub** | `[12, 6]` | `10 x 9` | `/agents/community`, `/agents/performance` | `CommunityGrowthHub`, `PerformanceEvidence`, `PerformanceExperiments` | Community Lounge Sofa, Growth Analytics Display |
| `server_room` | **AI Engine & Infrastructure Room** | `[18, -14]` | `12 x 10` | `/admin/gpu-workers`, `/admin/llm` | `GpuWorkersAdminPage`, `LLMAdapterAdmin` | AI Server Racks, GPU Monitoring Screen, Multi-LLM Console |
| `help_finance_desk` | **Help & Account / Finance Desk** | `[11, -6]` | `8 x 8` | Global Modals & `/workspace#profile` | `WalletTopupModal`, `DailyExecutiveReportModal`, Help & Shortcuts Kiosk | Finance Kiosk (VietQR), Daily Briefing Pedestal, Help Terminal |

### 2.1 Canonical 8 Agents Spatial Assignment
1. **Agent 1 (`growth_lead`)**: `[0, 0, -4]` — Central Command Center (Executive Podium overlooking HQ)
2. **Agent 2 (`asset_manager`)**: `[-22, 0, -2]` — Asset & Knowledge Library
3. **Agent 3 (`content_planner`)**: `[-21, 0, 10]` — Content Creation Studio
4. **Agent 4 (`publisher`)**: `[-2, 0, 16]` — Publishing & Distribution Studio
5. **Agent 5 (`gmaps_specialist`)**: `[10, 0, 16]` — Local Growth & Google Maps Lab
6. **Agent 6 (`comment_reply`)**: `[21, 0, 10]` — Social Engagement Center
7. **Agent 7 (`inbox_concierge`)**: `[22, 0, -2]` — Omnichannel Concierge
8. **Agent 8 (`community_growth`)**: `[12, 0, 6]` — Community & Performance Hub
