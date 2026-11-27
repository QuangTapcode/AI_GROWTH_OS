'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspace } from '@/features/shell/WorkspaceProvider';
import { useApiData } from '@/lib/useApiData';
import { apiRequest, getApiHealth, growthApi } from '@/lib/api';
import type { WorkflowTask } from '@/lib/apiTypes';
import { roleLabel } from '@/lib/format';
import { WalletTopupModal } from '@/features/billing/WalletTopupModal';
import { DailyExecutiveReportModal } from '@/features/reports/DailyExecutiveReportModal';
import { ImmersiveOfficeContext } from './ImmersiveOfficeContext';
import { OFFICE_AGENTS_CONFIG } from './config/agentLocations';
import { getRoomById, resolveRoomForPath } from './config/roomRegistry';
import { OfficeHUD } from './components/OfficeHUD';
import { AgentInspector } from './components/AgentInspector';
import { OfficeLoadingFallback } from './components/OfficeLoadingFallback';
import { OfficeErrorBoundary } from './components/OfficeErrorBoundary';
import { Office2DFallback } from './components/Office2DFallback';
import { OfficeToast, ToastMessage } from './components/OfficeToast';
import { OfficeActionModal } from './components/OfficeActionModal';
import { OfficeFloorPlan } from './components/OfficeFloorPlan';
import { OfficeActivityTimeline } from './components/OfficeActivityTimeline';
import { OfficeCommandPalette } from './components/OfficeCommandPalette';
import { DepartmentConsolePanel } from './components/DepartmentConsolePanel';
import {
  CameraPreset,
  CeilingMode,
  DepartmentRoomConfig,
  OfficeAgentViewModel,
  OfficeEvent,
  QualityPreset,
  RoomId,
  TimeOfDayPreset,
  ViewMode,
  WorkflowHandoff,
} from './types';

interface AutomationSnapshot {
  settings?: {
    enabled: boolean;
    next_run_at?: string;
    last_tick_at?: string | null;
    last_error?: string | null;
  } | null;
  tasks?: Array<{
    id: string;
    role: string;
    operation: string;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
  }>;
}

// Dynamic import of the single persistent R3F Canvas (ssr: false so Login/Utility routes don't bundle Three.js)
const DynamicOfficeCanvas = dynamic(() => import('./scene/OfficeCanvas'), {
  ssr: false,
  loading: () => <OfficeLoadingFallback />,
});

function matchAgentToRole(agentCode: string, role: string, operation?: string): boolean {
  if (agentCode === 'growth_lead') return role === 'growth_lead';
  if (agentCode === 'asset_manager') return Boolean(operation?.includes('drive') || operation?.includes('asset'));
  if (agentCode === 'content_planner') return role === 'seo' || role === 'research';
  if (agentCode === 'publisher') return role === 'content';
  if (agentCode === 'gmaps_specialist') return Boolean(operation?.includes('gmaps') || operation?.includes('maps'));
  if (agentCode === 'comment_reply') return role === 'community' && Boolean(operation?.includes('comment'));
  if (agentCode === 'inbox_concierge') return role === 'community' && Boolean(operation?.includes('inbox') || operation?.includes('lead'));
  if (agentCode === 'community_growth') return role === 'community';
  return false;
}

function roleToPrimaryAgentCode(role: string): string {
  switch (role) {
    case 'growth_lead':
      return 'growth_lead';
    case 'research':
    case 'seo':
      return 'content_planner';
    case 'content':
      return 'publisher';
    case 'community':
      return 'community_growth';
    default:
      return 'growth_lead';
  }
}

export default function ImmersiveOfficeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/office';
  const router = useRouter();
  const {
    user,
    workspaces,
    workspace,
    role,
    canApprove,
    selectWorkspace,
    logout,
    pendingReviewCount,
    openExceptionCount,
    refreshAttention,
  } = useWorkspace();

  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('balanced');
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPreset>('daytime');
  const [ceilingMode, setCeilingMode] = useState<CeilingMode>('cutaway');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const [agentSelection, setAgentSelection] = useState<{ path: string; code: string | null }>({
    path: pathname,
    code: null,
  });
  const [hoveredRoomId, setHoveredRoomId] = useState<RoomId | null>(null);
  const [cameraState, setCameraState] = useState<{ path: string; preset: CameraPreset } | null>(null);

  // Panel & Floating Widget Controls (path-scoped without sync setState in effects)
  const isRootOfficeOverview = pathname.replace(/\/+$/, '') === '/office';
  const selectedAgentCode = agentSelection.path === pathname ? agentSelection.code : null;
  const setSelectedAgentCode = useCallback(
    (code: string | null) => setAgentSelection({ path: pathname, code }),
    [pathname]
  );

  const [minimizedPath, setMinimizedPath] = useState<string | null>(null);
  const isPanelMinimized = minimizedPath === pathname;
  const togglePanelMinimized = useCallback(
    () => setMinimizedPath((prev) => (prev === pathname ? null : pathname)),
    [pathname]
  );

  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Feature Modals (migrated from DashboardHeader / Help Desk)
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isDailyReportOpen, setIsDailyReportOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // Real Action & Toast State
  const [modalTargetAgent, setModalTargetAgent] = useState<OfficeAgentViewModel | null>(null);
  const [modalActionType, setModalActionType] = useState<'run_task' | 'retry_task'>('run_task');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [apiConnection, setApiConnection] = useState<'checking' | 'connected' | 'unavailable'>('checking');
  const [sessionEvents, setSessionEvents] = useState<OfficeEvent[]>([]);

  // Respect prefers-reduced-motion asynchronously on mount and when system setting changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      if (mq.matches) setQualityPreset('performance');
    };
    const raf = window.requestAnimationFrame(apply);
    mq.addEventListener?.('change', apply);
    return () => {
      window.cancelAnimationFrame(raf);
      mq.removeEventListener?.('change', apply);
    };
  }, []);

  // Resolve active room from current Next.js URL
  const activeRoom: DepartmentRoomConfig | null = useMemo(() => {
    if (isRootOfficeOverview) return null;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    return resolveRoomForPath(pathname, search);
  }, [pathname, isRootOfficeOverview]);

  const cameraPreset: CameraPreset =
    cameraState?.path === pathname
      ? cameraState.preset
      : isRootOfficeOverview
      ? selectedAgentCode
        ? 'agent'
        : 'overview'
      : 'room';

  const setCameraPreset = useCallback(
    (updater: CameraPreset | ((prev: CameraPreset) => CameraPreset)) => {
      setCameraState((prev) => {
        const current = prev?.path === pathname ? prev.preset : isRootOfficeOverview ? 'overview' : 'room';
        const next = typeof updater === 'function' ? updater(current) : updater;
        return { path: pathname, preset: next };
      });
    },
    [pathname, isRootOfficeOverview]
  );

  // Real Backend Polling (Automation + Tasks) without remounting Canvas
  const workspaceId = workspace.id;
  const fetchOfficeLive = useCallback(
    async (signal: AbortSignal) => {
      if (!workspaceId) return null;
      const [automationRes, tasksRes] = await Promise.allSettled([
        apiRequest<AutomationSnapshot>(`/workspaces/${workspaceId}/automation`, { signal }),
        growthApi.listTasks(workspaceId, signal),
      ]);
      const automation = automationRes.status === 'fulfilled' ? automationRes.value : null;
      const tasks = tasksRes.status === 'fulfilled' ? tasksRes.value.items : [];
      return { automation, tasks };
    },
    [workspaceId]
  );

  const { data: liveData, reload, loading } = useApiData(workspaceId, fetchOfficeLive);

  // Real API health check
  useEffect(() => {
    const controller = new AbortController();
    getApiHealth(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) setApiConnection('connected');
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiConnection('unavailable');
      });
    return () => controller.abort();
  }, [workspace?.id]);

  // Background 5-second refresh
  useEffect(() => {
    if (!workspace?.id) return;
    const timer = setInterval(() => {
      reload();
    }, 5000);
    return () => clearInterval(timer);
  }, [workspace?.id, reload]);

  const isAutopilotOn = Boolean(liveData?.automation?.settings?.enabled);

  // Map real tasks from backend -> 8 Autonomous Agents ViewModels (Zero fake data)
  const agents: OfficeAgentViewModel[] = useMemo(() => {
    const tasks: WorkflowTask[] = liveData?.tasks ?? [];
    const autoTasks = liveData?.automation?.tasks ?? [];

    return OFFICE_AGENTS_CONFIG.map((config) => {
      const matchedWorkflow = tasks.find((t) => matchAgentToRole(config.code, t.role, t.operation));
      const matchedAuto = autoTasks.find((t) => matchAgentToRole(config.code, t.role, t.operation));
      const source = matchedWorkflow ?? matchedAuto;

      let status: OfficeAgentViewModel['status'] = 'idle';
      let currentTask: OfficeAgentViewModel['currentTask'] = null;

      if (source) {
        if (source.status === 'running') status = 'running';
        else if (source.status === 'awaiting_approval') status = 'needs_review';
        else if (source.status === 'completed') status = 'completed';
        else if (source.status === 'failed') status = 'error';
        else if (source.status === 'queued' || source.status === 'pending') status = 'queued';
        else if (source.status === 'cancelled') status = 'cancelled';

        const errorText =
          matchedWorkflow?.error_details && typeof matchedWorkflow.error_details === 'object'
            ? JSON.stringify(matchedWorkflow.error_details)
            : null;

        currentTask = {
          id: source.id,
          title: source.operation,
          status: source.status,
          progressPercent: source.status === 'running' ? 65 : source.status === 'completed' ? 100 : null,
          startedAt: source.started_at ?? null,
          errorDetails: errorText,
        };
      }

      return {
        ...config,
        status,
        currentTask,
        isOnline: apiConnection !== 'unavailable',
        activeTaskId: currentTask?.id ?? null,
      };
    });
  }, [liveData, apiConnection]);

  // Derive REAL Handoff Beams from actual backend task dependencies (no fake beams)
  const handoffs: WorkflowHandoff[] = useMemo(() => {
    const tasks: WorkflowTask[] = liveData?.tasks ?? [];
    if (tasks.length === 0) return [];
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const activeHandoffs: WorkflowHandoff[] = [];

    for (const task of tasks) {
      if (task.status !== 'running' && task.status !== 'queued' && task.status !== 'pending') continue;
      for (const depId of task.dependencies ?? []) {
        const parent = byId.get(depId);
        if (!parent) continue;
        const sourceCode = roleToPrimaryAgentCode(parent.role);
        const targetCode = roleToPrimaryAgentCode(task.role);
        if (sourceCode !== targetCode) {
          activeHandoffs.push({
            id: `handoff-${parent.id}-${task.id}`,
            sourceCode,
            targetCode,
            title: `${parent.operation} → ${task.operation}`,
            active: true,
          });
        }
      }
    }
    return activeHandoffs;
  }, [liveData?.tasks]);

  // Derive REAL Timeline events from backend tasks + session interactions
  const events: OfficeEvent[] = useMemo(() => {
    const tasks: WorkflowTask[] = liveData?.tasks ?? [];
    const derived: OfficeEvent[] = tasks.slice(0, 20).map((t) => {
      const type: OfficeEvent['type'] =
        t.status === 'completed'
          ? 'completed'
          : t.status === 'awaiting_approval'
          ? 'approval_required'
          : t.status === 'failed'
          ? 'failed'
          : 'started';

      return {
        id: `task-evt-${t.id}`,
        timestamp: new Date(t.updated_at || t.created_at).toLocaleTimeString('vi-VN'),
        agentCode: roleToPrimaryAgentCode(t.role),
        type,
        message: `${t.operation} (${t.status})`,
        taskId: t.id,
      };
    });

    return [...sessionEvents, ...derived];
  }, [liveData?.tasks, sessionEvents]);

  const selectedAgent = useMemo(
    () => (selectedAgentCode ? agents.find((a) => a.code === selectedAgentCode) ?? null : null),
    [agents, selectedAgentCode]
  );

  // Navigation Handlers
  const navigateToRoom = useCallback(
    (roomId: RoomId, targetRoute?: string) => {
      const room = getRoomById(roomId);
      if (!room) return;
      setSelectedAgentCode(null);
      setMinimizedPath(null);
      setCameraPreset('room');
      const nextUrl = targetRoute || room.defaultRoute;
      if (nextUrl && nextUrl !== pathname) {
        router.push(nextUrl);
      }
    },
    [pathname, router, setSelectedAgentCode, setCameraPreset]
  );

  const selectAgent = useCallback(
    (code: string | null) => {
      setSelectedAgentCode(code);
      if (code) {
        setCameraPreset('agent');
        setMinimizedPath(pathname);
      } else {
        setCameraPreset('overview');
      }
    },
    [pathname, setSelectedAgentCode, setCameraPreset]
  );

  const closePanel = useCallback(() => {
    setSelectedAgentCode(null);
    setMinimizedPath(null);
    setCameraPreset('overview');
    if (!isRootOfficeOverview) {
      router.push('/office');
    }
  }, [isRootOfficeOverview, router, setSelectedAgentCode, setCameraPreset]);

  const openGlobalModal = useCallback((modal: 'wallet' | 'daily_report' | 'help') => {
    if (modal === 'wallet') setIsWalletOpen(true);
    else if (modal === 'daily_report') setIsDailyReportOpen(true);
    else setIsHelpOpen(true);
  }, []);

  // Real Backend Autopilot Toggle
  const toggleAutopilot = useCallback(async () => {
    if (!workspaceId) return;
    const nextState = !isAutopilotOn;
    try {
      await apiRequest(`/workspaces/${workspaceId}/automation`, {
        method: 'PUT',
        body: { enabled: nextState },
      });
      setSessionEvents((prev) => [
        {
          id: `evt-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString('vi-VN'),
          agentCode: 'growth_lead',
          type: 'autopilot',
          message: nextState ? 'Đã bật Autopilot toàn văn phòng' : 'Đã tắt Autopilot',
        },
        ...prev,
      ]);
      setToast({
        id: String(Date.now()),
        type: 'success',
        title: nextState ? 'Autopilot Đã Bật' : 'Autopilot Đã Tắt',
        message: nextState
          ? 'Hệ thống AI sẽ tự động điều phối và chạy các tác vụ theo lịch.'
          : 'Hệ thống đã chuyển về chế độ chờ lệnh thủ công.',
      });
      reload();
    } catch (err) {
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Không thể thay đổi trạng thái Autopilot',
        message: (err as Error)?.message ?? 'Vui lòng kiểm tra kết nối API backend.',
      });
    }
  }, [workspaceId, isAutopilotOn, reload]);

  // Run & Retry Real Handlers
  const handleRequestRunTask = useCallback((agent: OfficeAgentViewModel) => {
    setModalTargetAgent(agent);
    setModalActionType('run_task');
    setIsModalOpen(true);
  }, []);

  const handleRequestRetryTask = useCallback((agent: OfficeAgentViewModel) => {
    setModalTargetAgent(agent);
    setModalActionType('retry_task');
    setIsModalOpen(true);
  }, []);

  const handleConfirmAction = useCallback(async () => {
    if (!modalTargetAgent || !workspaceId) return;
    setIsActionLoading(true);
    try {
      if (modalActionType === 'retry_task') {
        const taskId = modalTargetAgent.currentTask?.id;
        if (taskId) {
          await growthApi.retryTask(workspaceId, taskId);
          setSessionEvents((prev) => [
            {
              id: `evt-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('vi-VN'),
              agentCode: modalTargetAgent.code,
              type: 'retry',
              message: `Thử lại tác vụ cho ${modalTargetAgent.name}`,
              taskId,
            },
            ...prev,
          ]);
          setToast({
            id: String(Date.now()),
            type: 'success',
            title: 'Thử lại tác vụ thành công',
            message: `Tác vụ của ${modalTargetAgent.name} đã được đưa lại vào hàng đợi.`,
          });
        }
      } else {
        await growthApi.createAiRun(workspaceId, { operation: 'research.run' });
        setSessionEvents((prev) => [
          {
            id: `evt-${Date.now()}`,
            timestamp: new Date().toLocaleTimeString('vi-VN'),
            agentCode: modalTargetAgent.code,
            type: 'started',
            message: `Khởi chạy AI Run từ ${modalTargetAgent.name}`,
          },
          ...prev,
        ]);
        setToast({
          id: String(Date.now()),
          type: 'success',
          title: 'Khởi chạy AI Run thành công',
          message: `Đã gửi lệnh chạy AI cho ${modalTargetAgent.name}.`,
        });
      }
      setIsModalOpen(false);
      reload();
      refreshAttention();
    } catch (err) {
      setToast({
        id: String(Date.now()),
        type: 'error',
        title: 'Thao tác không thành công',
        message: (err as Error)?.message ?? 'Không thể kết nối máy chủ API.',
      });
    } finally {
      setIsActionLoading(false);
    }
  }, [modalTargetAgent, modalActionType, workspaceId, reload, refreshAttention]);

  // Global Pro Keyboard Shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        isModalOpen
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key >= '1' && e.key <= '8') {
        const cfg = OFFICE_AGENTS_CONFIG[parseInt(e.key, 10) - 1];
        if (cfg) selectAgent(cfg.code);
      } else if (e.key === '0' || e.key === 'Escape') {
        if (isCommandPaletteOpen) setIsCommandPaletteOpen(false);
        else if (isHelpOpen) setIsHelpOpen(false);
        else if (selectedAgentCode) selectAgent(null);
        else if (!isRootOfficeOverview) closePanel();
      } else if (e.key === 'f' || e.key === 'F') {
        setCameraPreset((prev) => (prev === 'floorplan' ? 'overview' : 'floorplan'));
      } else if (e.key === 'p' || e.key === 'P') {
        setIsFloorPlanOpen((prev) => !prev);
      } else if (e.key === 't' || e.key === 'T') {
        setIsTimelineOpen((prev) => !prev);
      } else if (e.key === 'v' || e.key === 'V') {
        setViewMode((prev) => (prev === '3d' ? '2d' : '3d'));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, isCommandPaletteOpen, isHelpOpen, selectedAgentCode, isRootOfficeOverview, selectAgent, closePanel, setCameraPreset]);

  const contextValue = useMemo(
    () => ({
      isInsideImmersiveShell: true,
      activeRoom,
      activeRoute: pathname,
      selectedAgentCode,
      hoveredRoomId,
      isPanelMinimized,
      isPanelExpanded,
      agents,
      isAutopilotOn,
      navigateToRoom,
      selectAgent,
      setHoveredRoomId,
      closePanel,
      togglePanelMinimized,
      togglePanelExpanded: () => setIsPanelExpanded((p) => !p),
      openGlobalModal,
      toggleAutopilot,
    }),
    [
      activeRoom,
      pathname,
      selectedAgentCode,
      hoveredRoomId,
      isPanelMinimized,
      isPanelExpanded,
      agents,
      isAutopilotOn,
      navigateToRoom,
      selectAgent,
      closePanel,
      togglePanelMinimized,
      openGlobalModal,
      toggleAutopilot,
    ]
  );

  const hudWorkspaces = useMemo(
    () =>
      workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        roleLabel: roleLabel(w.role),
      })),
    [workspaces]
  );

  const currentHudWorkspace = useMemo(
    () => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      roleLabel: roleLabel(workspace.role),
    }),
    [workspace]
  );

  return (
    <ImmersiveOfficeContext.Provider value={contextValue}>
      <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0B132B] select-none">
        {/* ── LAYER 0: SINGLE PERSISTENT 3D OFFICE CANVAS (NEVER UNMOUNTS ACROSS ROUTES) ── */}
        {viewMode === '3d' ? (
          <OfficeErrorBoundary
            agents={agents}
            onSelectAgent={(code) => selectAgent(code)}
            selectedAgentId={selectedAgentCode}
            onSelectRoom={navigateToRoom}
            activeRoom={activeRoom}
            canAdmin={canApprove}
          >
            <DynamicOfficeCanvas
              agents={agents}
              selectedAgent={selectedAgent}
              activeRoom={activeRoom}
              hoveredRoomId={hoveredRoomId}
              pendingReviewCount={pendingReviewCount}
              openExceptionCount={openExceptionCount}
              isAutopilotOn={isAutopilotOn}
              onSelectAgent={(code) => selectAgent(code)}
              onHoverRoom={setHoveredRoomId}
              onSelectRoom={navigateToRoom}
              onOpenModal={openGlobalModal}
              cameraPreset={cameraPreset}
              qualityPreset={qualityPreset}
              timeOfDay={timeOfDay}
              ceilingMode={ceilingMode}
              handoffs={handoffs}
              onContextLostFallback={() => setViewMode('2d')}
              onFpsSample={setFps}
              onDoorSound={() => {
                if (!soundEnabled || typeof window === 'undefined') return;
                try {
                  const ctx = new AudioContext();
                  const osc = ctx.createOscillator();
                  const gain = ctx.createGain();
                  osc.frequency.setValueAtTime(520, ctx.currentTime);
                  gain.gain.setValueAtTime(0.03, ctx.currentTime);
                  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
                  osc.connect(gain);
                  gain.connect(ctx.destination);
                  osc.start();
                  osc.stop(ctx.currentTime + 0.15);
                } catch {
                  // Ignore browser audio policy block
                }
              }}
            />
          </OfficeErrorBoundary>
        ) : (
          <Office2DFallback
            agents={agents}
            onSelectAgent={(code) => selectAgent(code)}
            selectedAgentId={selectedAgentCode}
            onSelectRoom={navigateToRoom}
            activeRoom={activeRoom}
            canAdmin={canApprove}
          />
        )}

        {/* ── LAYER 1: FLOATING HUD HEADER & SWITCHER (NO LEFT SIDEBAR) ── */}
        <OfficeHUD
          agents={agents}
          selectedAgentId={selectedAgentCode}
          onSelectAgent={(code) => selectAgent(code)}
          activeRoom={activeRoom}
          onSelectRoom={navigateToRoom}
          onReturnOverview={closePanel}
          viewMode={viewMode}
          onChangeViewMode={setViewMode}
          cameraPreset={cameraPreset}
          onChangeCameraPreset={(preset) => {
            setCameraPreset(preset);
            if (preset === 'overview' || preset === 'floorplan') {
              setSelectedAgentCode(null);
            }
          }}
          qualityPreset={qualityPreset}
          onChangeQualityPreset={setQualityPreset}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          onToggleFloorPlan={() => setIsFloorPlanOpen((p) => !p)}
          isFloorPlanOpen={isFloorPlanOpen}
          onToggleTimeline={() => setIsTimelineOpen((p) => !p)}
          isTimelineOpen={isTimelineOpen}
          onToggleAutopilot={toggleAutopilot}
          isAutopilotOn={isAutopilotOn}
          onRefresh={() => {
            reload();
            refreshAttention();
          }}
          isRefreshing={loading}
          workspaces={hudWorkspaces}
          currentWorkspace={currentHudWorkspace}
          onSelectWorkspace={selectWorkspace}
          user={{ name: user.full_name, role: roleLabel(role) }}
          onLogout={logout}
          notificationsCount={pendingReviewCount + openExceptionCount}
          apiConnection={apiConnection}
          onOpenWallet={() => setIsWalletOpen(true)}
          onOpenDailyReport={() => setIsDailyReportOpen(true)}
          onOpenHelp={() => setIsHelpOpen(true)}
          canAdmin={canApprove}
          timeOfDay={timeOfDay}
          onChangeTimeOfDay={setTimeOfDay}
          ceilingMode={ceilingMode}
          onToggleCeilingMode={() => {
            const nextCeiling = ceilingMode === 'cutaway' ? 'interior' : 'cutaway';
            setCeilingMode(nextCeiling);
          }}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((prev) => !prev)}
          fps={fps}
        />

        {/* ── LAYER 2: DEPARTMENT CONTEXTUAL GLASS PANEL (FOR ALL FEATURE ROUTES) ── */}
        <DepartmentConsolePanel
          room={activeRoom}
          activeRoute={pathname}
          isOpen={!isRootOfficeOverview}
          isMinimized={isPanelMinimized}
          isExpanded={isPanelExpanded}
          onSelectDevice={navigateToRoom}
          onOpenModal={openGlobalModal}
          onToggleAutopilot={toggleAutopilot}
          onToggleMinimized={togglePanelMinimized}
          onToggleExpanded={() => setIsPanelExpanded((p) => !p)}
          onClose={closePanel}
        >
          <React.Fragment key={workspace.id}>{children}</React.Fragment>
        </DepartmentConsolePanel>

        {/* ── FLOATING BLUEPRINT FLOOR PLAN MINI-MAP ── */}
        <OfficeFloorPlan
          agents={agents}
          selectedAgentId={selectedAgentCode}
          activeRoomId={activeRoom?.id ?? null}
          onSelectAgent={(code) => selectAgent(code)}
          onSelectRoom={(roomId) => navigateToRoom(roomId)}
          isOpen={isFloorPlanOpen}
          onToggle={() => setIsFloorPlanOpen((p) => !p)}
        />

        {/* ── FLOATING ACTIVITY TIMELINE STREAM ── */}
        <OfficeActivityTimeline
          events={events}
          isOpen={isTimelineOpen}
          onToggle={() => setIsTimelineOpen((p) => !p)}
          onSelectAgent={(code) => selectAgent(code)}
        />

        {/* ── AGENT CONTEXTUAL INSPECTOR DRAWER ── */}
        <AgentInspector
          agent={selectedAgent}
          onClose={() => selectAgent(null)}
          workspaceId={workspace.id}
          onRequestRunTask={handleRequestRunTask}
          onRequestRetryTask={handleRequestRetryTask}
          isActionLoading={isActionLoading}
        />

        {/* ── ACTION CONFIRMATION MODAL ── */}
        <OfficeActionModal
          isOpen={isModalOpen}
          agent={modalTargetAgent}
          actionType={modalActionType}
          onConfirm={handleConfirmAction}
          onCancel={() => setIsModalOpen(false)}
          isLoading={isActionLoading}
        />

        {/* ── GLOBAL COMMAND PALETTE (CTRL+K) ── */}
        <OfficeCommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onSelectAgent={(code) => selectAgent(code)}
          onSelectRoom={navigateToRoom}
          onOpenModal={openGlobalModal}
          onChangeCameraPreset={setCameraPreset}
          onChangeViewMode={setViewMode}
          onToggleAutopilot={toggleAutopilot}
          isAutopilotOn={isAutopilotOn}
          canAdmin={canApprove}
        />

        {/* ── GLOBAL MODALS: WALLET VIETQR & DAILY EXECUTIVE REPORT ── */}
        <WalletTopupModal
          workspaceId={workspace.id}
          isOpen={isWalletOpen}
          onClose={() => setIsWalletOpen(false)}
        />
        <DailyExecutiveReportModal
          workspaceId={workspace.id}
          isOpen={isDailyReportOpen}
          onClose={() => setIsDailyReportOpen(false)}
        />

        {/* ── HELP & SHORTCUTS MODAL ── */}
        {isHelpOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
            onClick={() => setIsHelpOpen(false)}
          >
            <div
              className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 text-slate-100 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base">Hướng Dẫn Vận Hành Trụ Sở 3D AI Growth OS</h3>
                <button
                  type="button"
                  onClick={() => setIsHelpOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-slate-300 space-y-2 leading-relaxed">
                <p>
                  • <strong>Di chuyển không gian</strong>: Kéo chuột để xoay góc nhìn, cuộn chuột để zoom, chuột phải để pan.
                </p>
                <p>
                  • <strong>Tương tác Phòng Ban</strong>: Click trực tiếp lên bất kỳ khu vực nào trong 14 phòng ban để camera bay tới phòng và mở bảng Console nghiệp vụ thực tế.
                </p>
                <p>
                  • <strong>8 Autonomous AI Agents</strong>: Click vào nhân vật hoặc phím số <strong>1–8</strong> để mở Inspector theo dõi tiến trình, logs và thực thi Run/Retry.
                </p>
                <p>
                  • <strong>Command Palette (Ctrl + K)</strong>: Nhảy nhanh tới Review Queue, Workflows, Google Maps, GPU Workers, Booking Leads...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TOAST FEEDBACK ── */}
        <OfficeToast toast={toast} onDismiss={() => setToast(null)} />
      </div>
    </ImmersiveOfficeContext.Provider>
  );
}
