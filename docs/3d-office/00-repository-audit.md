# AI GROWTH OS – DEEP REPOSITORY AUDIT (PHASE 0)
**Project**: AI Growth OS – Autonomous 3D Office 2026  
**Auditor**: Principal Frontend Architect & Senior 3D Web Technical Team  
**Date**: 2026-11-24  
**Status**: APPROVED BASELINE AUDIT

---

## 1. Source Structure & Workspaces
The repository is an enterprise-grade hybrid monorepo consisting of:
- `apps/web`: Next.js 16.3.8 App Router, React 19.3.0, Tailwind CSS v4, TypeScript 5.9.3.
- `apps/api`: Node.js/TypeScript REST API service handling workspaces, tasks, workflows, and authentications.
- `apps/worker`: TypeScript asynchronous queue worker for distributed tasks, outbox publisher, and reconciliation.
- `apps/pilot`: E2E / pilot evaluation harness.
- `services/ai`: Python-based AI microservice with multi-agent orchestration, prompt tuners, Gemini/Ollama adapters, and guardrails.
- `contracts/`: Shared schemas, data contracts, and protocol definitions.

### Web Directory Layout (`apps/web`):
```text
apps/web/
├── package.json               # Node >=24.14.1 <25, Next 16.3.8, React 19.3.0, Three 0.187.0
├── next.config.ts             # Turbopack config, CPU experiment: 1
├── tsconfig.json              # Strict mode TypeScript 5.9.3
├── public/                    # Static assets, SVG icons
├── src/
│   ├── app/                   # Next.js App Router (19 routes including /office)
│   ├── components/            # Shared UI components (ApprovalView, MediaAssetImage)
│   ├── features/
│   │   ├── shell/             # AppShell, WorkspaceProvider, StatusViews
│   │   ├── dashboard/         # DashboardSidebar, DashboardHeader, MetricCards
│   │   ├── agents/            # AgentOperations, AgentDetailView, CommunityGrowthHub
│   │   ├── billing/           # WalletTopupModal
│   │   ├── reports/           # DailyExecutiveReportModal
│   │   └── office/            # 3D Autonomous Office feature module
│   └── lib/                   # API clients (apiRequest, growthApi), useApiData, session, i18n
└── tests/                     # Vitest component test suites & Playwright e2e
```

---

## 2. Framework & Dependency Versions
- **Next.js**: `16.3.8` (App Router with Turbopack)
- **React**: `19.3.0`
- **React DOM**: `19.3.0`
- **TypeScript**: `5.9.3`
- **Tailwind CSS**: `4.3.3` (with `@tailwindcss/postcss`)
- **Node.js**: `>=24.14.1 <25` (Active LTS)
- **3D Stack**:
  - `three`: `0.187.0`
  - `@types/three`: `0.187.0`
  - `@react-three/fiber`: `9.8.2` (officially compatible with `react >=19 <19.4`)
  - `@react-three/drei`: `10.7.9`
- **Testing**:
  - `vitest`: `5.1.1`
  - `@playwright/test`: `1.63.0`

---

## 3. Existing Routes Mapping
| Route Path | Type | Role & Existing Component |
| :--- | :--- | :--- |
| `/` | Static | Landing / redirect to `/dashboard` or `/login` |
| `/login` | Static | Authentication & session initialization |
| `/dashboard` | Static | Executive KPI Overview & multi-channel summary |
| `/agents` | Static | Agent Operations overview (8 Autonomous Agents grid) |
| `/agents/[role]` | SSG | Role-specific deep dive workspace (`growth_lead`, `content`, `seo`, etc.) |
| `/workflows` | Static | Workflow pipelines & task queue monitor |
| `/review-queue` | Static | Content approval queue & claim-verification |
| `/artifacts` | Static | Content artifacts repository & version history |
| `/distribution` | Static | Multi-channel publishing calendar & TikTok outbox |
| `/gmaps` | Static | Google Business Profile manager & Drive asset ingestion |
| `/growth-results` | Static | Growth metric trends, experiment outcomes |
| `/booking-leads` | Static | Omnichannel 1-1 lead inbox & CRM pipeline |
| `/knowledge-contexts` | Static | RAG knowledge base & business context |
| `/onboarding` | Static | Workspace onboarding wizard |
| `/workspace` | Static | Workspace settings & profile |
| `/workspace-integrations` | Static | OAuth connectors (Facebook, TikTok, Maps) |
| `/admin/gpu-workers` | Static | GPU worker nodes health monitor & leases |
| `/admin/llm` | Static | LLM provider settings & rate limits |
| `/office` | Static | **AI Autonomous 3D Office 2026 (New interactive 3D layer)** |

---

## 4. Agent Mapping: 6 Backend Roles vs 8 Marketing Office Agents
The backend engine operates on 6 canonical roles (`research`, `growth_lead`, `seo`, `content`, `community`, `performance`).  
The Marketing Office UI maps them into 8 specialized Autonomous Agents:

| Agent # | UI Code | Title & Specialization | Backend Role | Core Handlers & API Endpoints |
| :---: | :--- | :--- | :---: | :--- |
| **1** | `growth_lead` | **AI Growth Lead** (Trưởng nhóm AI) | `growth_lead` | `growthApi.createAiRun(id, { operation: "research.run" })`, Daily Executive Report |
| **2** | `asset_manager` | **Drive Asset Ingestion** (Tư liệu thực tế) | `seo` / `content` | Auto-scan Drive, Gemini Vision Tagging -> `GET/POST /gmaps?tab=drive_assets` |
| **3** | `content_planner` | **Content Planner & SEO** (Lập kế hoạch) | `seo` + `research` | Grounded article generator, anti-duplicate calendar -> `POST /seo-handoff` |
| **4** | `publisher` | **Multi-Channel Publisher** (TikTok Video) | `content` | Auto-publish Facebook/TikTok 9:16 -> `POST /workspaces/:id/publishing-jobs` |
| **5** | `gmaps_specialist` | **Google Maps Specialist** (Local SEO) | `community` / `seo` | 100% Auto-Reply reviews, local posts -> `GET/POST /gmaps` |
| **6** | `comment_reply` | **Social Comment Reply 24/7** (SLA < 3m) | `community` | RAG auto-reply public comments -> `POST /workspaces/:id/ai-tasks` |
| **7** | `inbox_concierge` | **Omnichannel Inbox Concierge** (1-1) | `community` | Lead capture & 1-1 consultation -> `GET/POST /booking-leads` |
| **8** | `community_growth` | **Community Growth & Retention** | `community` | 4-week roadmap, group auto-invite -> `POST /workspaces/:id/tasks` |

---

## 5. Task Status & Business State Mapping
Backend canonical TaskStatus enums:
- `pending`: Task created, awaiting worker pick-up.
- `queued`: Placed in queue for GPU or orchestrator.
- `running`: Currently executing in worker container / AI microservice.
- `awaiting_approval`: Output generated, waiting human review in Review Queue.
- `completed`: Successfully verified and published / saved.
- `failed`: Errored with error code, eligible for Retry.
- `cancelled`: Manually or system aborted.

3D Office ViewModel Status Mapping (`AgentStatusCode`):
```ts
if (status === 'running') return 'running';
if (status === 'awaiting_approval' || status === 'needs_review') return 'needs_review';
if (status === 'completed') return 'completed';
if (status === 'failed' || status === 'error' || status === 'blocked') return 'error';
if (status === 'queued' || status === 'pending') return 'queued';
if (status === 'cancelled') return 'cancelled';
return 'idle';
```

---

## 6. API Client & Polling Architecture
- **API Client**: `apiRequest<T>(path, options)` and `growthApi` in `apps/web/src/lib/api.ts`.
- **Authentication**: Bearer token via `getSession()`, automatic redirect on 401.
- **Data Fetching Hook**: `useApiData<T>(key, fetcher)`. Automatically handles `AbortController`, preventing stale race conditions.
- **Existing Polling Intervals**:
  - `AgentOperations.tsx`: Polling `/workspaces/${id}/automation` every ~5000ms.
  - `AgentDetailView.tsx`: Polling active task status every ~2000ms.
- **3D Render Loop Isolation**:
  - WebGL animation loop runs strictly on `useFrame` using imperative refs.
  - Polling runs asynchronously and updates ViewModel without remounting Canvas or rebuilding WebGL textures.

---

## 7. Existing Tests & Verification Baseline
- `tests/MediaAssetImage.test.tsx`: 6/6 tests passed.
- `tests/ApprovalView.test.tsx`: 11/11 tests passed.
- `tests/OfficeFeature.test.tsx`: 12/12 tests passed.
- Total web unit tests: **29/29 PASSED**.
- TypeScript strict mode: **0 ERRORS**.
- Production build: **27/27 routes compiled successfully**.

---

## 8. Protected Files (Do Not Modify Without Reason)
- `apps/web/src/features/shell/WorkspaceProvider.tsx` (Core multitenancy session)
- `apps/web/src/lib/i18n/LanguageContext.tsx` (i18n state)
- `apps/web/src/lib/api.ts` (REST client & endpoint contracts)
- `apps/web/src/lib/apiTypes.ts` (Backend DTO definitions)
- `apps/web/src/features/shell/AppShell.tsx` (Root visual shell)
- All 2D route files under `src/app/` (`dashboard`, `agents`, `workflows`, etc.)
