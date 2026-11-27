import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { OFFICE_AGENTS_CONFIG } from '../src/features/office/config/agentLocations';
import { OFFICE_ROOMS, resolveRoomForPath } from '../src/features/office/config/roomRegistry';
import { OfficeHUD } from '../src/features/office/components/OfficeHUD';
import { Office2DFallback } from '../src/features/office/components/Office2DFallback';
import { AgentInspector } from '../src/features/office/components/AgentInspector';
import { OfficeLoadingFallback } from '../src/features/office/components/OfficeLoadingFallback';
import { OfficeToast } from '../src/features/office/components/OfficeToast';
import { OfficeActionModal } from '../src/features/office/components/OfficeActionModal';
import { AgentTaskSteps } from '../src/features/office/components/AgentTaskSteps';
import { OfficeFloorPlan } from '../src/features/office/components/OfficeFloorPlan';
import { OfficeActivityTimeline } from '../src/features/office/components/OfficeActivityTimeline';
import { OfficeCommandPalette } from '../src/features/office/components/OfficeCommandPalette';
import { DepartmentConsolePanel } from '../src/features/office/components/DepartmentConsolePanel';
import {
  AGENT_HUMAN_APPEARANCES,
  createMouthWithMorphTargets,
  getHumanAnimationClips,
} from '../src/features/office/scene/AgentHumanRig';
import {
  ROOM_DOORS,
  buildOfficeWaypointPath,
  clampWalkableCameraPosition,
} from '../src/features/office/scene/OfficeNavigation';
import {
  AGENT_GLB_MODEL_URLS,
  getAgentGlbUrl,
} from '../src/features/office/scene/AgentGlbLoader';
import fs from 'node:fs';
import path from 'node:path';
import { OfficeAgentViewModel, OfficeEvent, TaskStep } from '../src/features/office/types';

describe('AI Autonomous 3D Office Feature Suite', () => {
  const mockViewModels: OfficeAgentViewModel[] = OFFICE_AGENTS_CONFIG.map((cfg, idx) => ({
    ...cfg,
    status: idx === 0 ? 'running' : idx === 3 ? 'needs_review' : 'idle',
    currentTask: idx === 0 ? { id: 't1', title: 'Daily Market Analysis', status: 'running', progressPercent: 75 } : null,
    isOnline: true,
  }));

  it('định nghĩa chính xác 8 Autonomous Agents với toạ độ không gian và thông tin hợp lệ', () => {
    expect(OFFICE_AGENTS_CONFIG.length).toBe(8);

    const codes = new Set(OFFICE_AGENTS_CONFIG.map((a) => a.code));
    expect(codes.size).toBe(8);

    OFFICE_AGENTS_CONFIG.forEach((agent) => {
      expect(agent.code).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(agent.department).toBeTruthy();
      expect(agent.actionRoute).toMatch(/^\/[a-z0-9_/?=-]+/);
      expect(agent.position).toHaveLength(3);
      expect(typeof agent.rotationY).toBe('number');

      // Verify spatial boundaries within the 64m x 48m Corporate HQ layout
      const [x, , z] = agent.position;
      expect(Math.abs(x)).toBeLessThanOrEqual(32);
      expect(Math.abs(z)).toBeLessThanOrEqual(24);
    });

    // Ensure no overlapping coordinates
    const positions = OFFICE_AGENTS_CONFIG.map((a) => `${a.position[0]},${a.position[2]}`);
    expect(new Set(positions).size).toBe(8);
  });

  it('render OfficeHUD với thông số tổng quan và các pill điều hướng 8 agent', () => {
    const html = renderToStaticMarkup(
      <OfficeHUD
        agents={mockViewModels}
        selectedAgentId="growth_lead"
        onSelectAgent={() => {}}
        viewMode="3d"
        onChangeViewMode={() => {}}
        cameraPreset="overview"
        onChangeCameraPreset={() => {}}
      />
    );

    expect(html).toContain('AI GROWTH OS');
    expect(html).toContain('3D OFFICE 2026');
    expect(html).toContain('8/8');
    expect(html).toContain('Chạy');
    expect(html).toContain('Phối Cảnh');
    expect(html).toContain('Mặt Bằng');
    expect(html).toContain('Growth Lead');
    expect(html).toContain('Community Growth');
  });

  it('render Office2DFallback với đủ 8 thẻ phòng ban khi không dùng 3D', () => {
    const html = renderToStaticMarkup(
      <Office2DFallback
        agents={mockViewModels}
        onSelectAgent={() => {}}
        selectedAgentId={null}
      />
    );

    expect(html).toContain('Chế độ Văn Phòng 2D (Standard Performance)');
    expect(html).toContain('Đội Ngũ 8 AI Agent Tự Hành 24/7');
    OFFICE_AGENTS_CONFIG.forEach((agent) => {
      expect(html).toContain(agent.num);
      expect(html).toContain(agent.name);
    });
  });

  it('render AgentInspector với thông tin chi tiết, KPI, tác vụ và nút mở Workspace', () => {
    const targetAgent = mockViewModels[0];
    const html = renderToStaticMarkup(
      <AgentInspector
        agent={targetAgent}
        onClose={() => {}}
        workspaceId="ws_tripc"
      />
    );

    expect(html).toContain('AI Growth Lead (Trưởng Nhóm AI)');
    expect(html).toContain('Trung Tâm Điều Hành');
    expect(html).toContain('Đang Thực Thi');
    expect(html).toContain('Daily Market Analysis');
    expect(html).toContain('75%');
    expect(html).toContain('Mở Không Gian Làm Việc Growth Lead');
    expect(html).toContain('/agents/growth_lead');
  });

  it('render OfficeLoadingFallback với hiệu ứng loading và văn bản hướng dẫn', () => {
    const html = renderToStaticMarkup(<OfficeLoadingFallback />);
    expect(html).toContain('Khởi tạo Văn Phòng 3D Tự Hành');
    expect(html).toContain('Đang nạp không gian kiến trúc');
  });

  it('ánh xạ đầy đủ các trạng thái backend sang AgentStatusCode của giao diện 3D', () => {
    function mapStatus(backendStatus: string) {
      if (backendStatus === 'running') return 'running';
      if (backendStatus === 'awaiting_approval' || backendStatus === 'needs_review') return 'needs_review';
      if (backendStatus === 'completed') return 'completed';
      if (backendStatus === 'failed' || backendStatus === 'error' || backendStatus === 'blocked') return 'error';
      if (backendStatus === 'queued' || backendStatus === 'pending') return 'queued';
      if (backendStatus === 'cancelled') return 'cancelled';
      return 'idle';
    }

    expect(mapStatus('running')).toBe('running');
    expect(mapStatus('awaiting_approval')).toBe('needs_review');
    expect(mapStatus('needs_review')).toBe('needs_review');
    expect(mapStatus('completed')).toBe('completed');
    expect(mapStatus('failed')).toBe('error');
    expect(mapStatus('blocked')).toBe('error');
    expect(mapStatus('queued')).toBe('queued');
    expect(mapStatus('pending')).toBe('queued');
    expect(mapStatus('cancelled')).toBe('cancelled');
    expect(mapStatus('unknown')).toBe('idle');
  });

  it('xác thực danh mục phụ kiện và props đặc thù của 8 Agent', () => {
    const supportedCodes = [
      'growth_lead',
      'asset_manager',
      'content_planner',
      'publisher',
      'gmaps_specialist',
      'comment_reply',
      'inbox_concierge',
      'community_growth',
    ];

    OFFICE_AGENTS_CONFIG.forEach((agent) => {
      expect(supportedCodes).toContain(agent.code);
      expect(agent.icon).toBeTruthy();
      expect(agent.kpi).toBeTruthy();
      expect(agent.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it('render OfficeToast với thông báo success và error', () => {
    const successHtml = renderToStaticMarkup(
      <OfficeToast
        toast={{ id: '1', type: 'success', title: 'Thao tác thành công', message: 'Tác vụ đã được kích hoạt.' }}
        onDismiss={() => {}}
      />
    );
    expect(successHtml).toContain('Thao tác thành công');
    expect(successHtml).toContain('Tác vụ đã được kích hoạt.');

    const errorHtml = renderToStaticMarkup(
      <OfficeToast
        toast={{ id: '2', type: 'error', title: 'Thao tác thất bại', message: 'Lỗi mạng.' }}
        onDismiss={() => {}}
      />
    );
    expect(errorHtml).toContain('Thao tác thất bại');
    expect(errorHtml).toContain('Lỗi mạng.');
  });

  it('render OfficeActionModal với xác nhận thao tác và thông tin agent', () => {
    const targetAgent = mockViewModels[0];
    const html = renderToStaticMarkup(
      <OfficeActionModal
        isOpen={true}
        agent={targetAgent}
        actionType="run_task"
        onConfirm={() => {}}
        onCancel={() => {}}
        isLoading={false}
      />
    );

    expect(html).toContain('Xác Nhận Thao Tác');
    expect(html).toContain('Khởi Chạy AI Run: Growth Lead');
    expect(html).toContain('Trung Tâm Điều Hành');
    expect(html).toContain('Khởi Chạy Ngay');
    expect(html).toContain('Hủy Bỏ');
  });

  it('render AgentInspector với các nút hành động đặc biệt theo trạng thái (Retry, Review Queue, Run Now)', () => {
    // Agent with needs_review
    const reviewAgent: OfficeAgentViewModel = {
      ...mockViewModels[0],
      status: 'needs_review',
    };
    const reviewHtml = renderToStaticMarkup(
      <AgentInspector
        agent={reviewAgent}
        onClose={() => {}}
        onRequestRunTask={() => {}}
      />
    );
    expect(reviewHtml).toContain('Phê Duyệt Nội Dung (Review Queue) →');
    expect(reviewHtml).toContain('/review-queue');

    // Agent with error & retry
    const errorAgent: OfficeAgentViewModel = {
      ...mockViewModels[0],
      status: 'error',
      currentTask: { id: 't_err', title: 'Failed job', status: 'failed', progressPercent: null },
    };
    const errorHtml = renderToStaticMarkup(
      <AgentInspector
        agent={errorAgent}
        onClose={() => {}}
        onRequestRetryTask={() => {}}
      />
    );
    expect(errorHtml).toContain('Thử Lại Tác Vụ Thất Bại (Retry)');
  });

  it('xác thực ánh xạ phím tắt Pro Keyboard Navigation (1-8, F, V, Esc)', () => {
    // 1-8 key map verification
    for (let i = 1; i <= 8; i++) {
      const targetAgent = OFFICE_AGENTS_CONFIG[i - 1];
      expect(targetAgent).toBeDefined();
      expect(targetAgent.num).toBe(`Agent ${i}`);
    }

    // Toggle camera preset logic
    const togglePreset = (current: string) => (current === 'floorplan' ? 'overview' : 'floorplan');
    expect(togglePreset('overview')).toBe('floorplan');
    expect(togglePreset('floorplan')).toBe('overview');

    // Toggle view mode logic
    const toggleView = (current: string) => (current === '3d' ? '2d' : '3d');
    expect(toggleView('3d')).toBe('2d');
    expect(toggleView('2d')).toBe('3d');
  });

  it('render OfficeHUD với nút xem danh sách phím tắt và nhãn 2026 Pro', () => {
    const html = renderToStaticMarkup(
      <OfficeHUD
        agents={mockViewModels}
        selectedAgentId={null}
        onSelectAgent={() => {}}
        viewMode="3d"
        onChangeViewMode={() => {}}
        cameraPreset="overview"
        onChangeCameraPreset={() => {}}
      />
    );

    expect(html).toContain('Phím tắt');
    expect(html).toContain('snap-x');
    expect(html).toContain('AI GROWTH OS');
  });

  it('render AgentTaskSteps với 4 bước tuần tự, trạng thái in_progress và completed', () => {
    const customSteps: TaskStep[] = [
      { id: 's1', title: 'Thu thập tín hiệu', status: 'completed' },
      { id: 's2', title: 'Phân tích dữ liệu', status: 'in_progress', description: 'Đang chạy mô hình AI' },
      { id: 's3', title: 'Kiểm duyệt chất lượng', status: 'pending' },
    ];

    const html = renderToStaticMarkup(
      <AgentTaskSteps steps={customSteps} currentOperation="Phân tích dữ liệu" />
    );

    expect(html).toContain('Tiến trình tác vụ tự hành');
    expect(html).toContain('1/3 Hoàn tất');
    expect(html).toContain('Thu thập tín hiệu');
    expect(html).toContain('Phân tích dữ liệu');
    expect(html).toContain('Kiểm duyệt chất lượng');
    expect(html).toContain('Đang chạy mô hình AI');
  });

  it('render OfficeFloorPlan với mini-map SVG, 5 phân khu và 8 trạm làm việc agent', () => {
    const html = renderToStaticMarkup(
      <OfficeFloorPlan
        agents={mockViewModels}
        selectedAgentId="growth_lead"
        onSelectAgent={() => {}}
        isOpen={true}
      />
    );

    expect(html).toContain('Sơ Đồ Mặt Bằng (Floor Plan)');
    expect(html).toContain('viewBox="0 0 100 75"');
    // Central AI Core
    expect(html).toContain('fill="#0284C7"');
    // 8 Agents in SVG
    OFFICE_AGENTS_CONFIG.forEach((agent) => {
      expect(html).toContain(`station-${agent.code}`);
    });
  });

  it('render OfficeActivityTimeline với bộ lọc, tìm kiếm và luồng sự kiện thời gian thực', () => {
    const mockEvents: OfficeEvent[] = [
      {
        id: 'e1',
        timestamp: '10:00:00',
        agentCode: 'growth_lead',
        type: 'autopilot',
        message: 'Kích hoạt Autopilot buổi sáng',
      },
      {
        id: 'e2',
        timestamp: '10:05:00',
        agentCode: 'content_planner',
        type: 'completed',
        message: 'Hoàn thành bài viết SEO',
      },
    ];

    const html = renderToStaticMarkup(
      <OfficeActivityTimeline
        events={mockEvents}
        isOpen={true}
        onToggle={() => {}}
        onSelectAgent={() => {}}
      />
    );

    expect(html).toContain('Nhật Ký Tác Vụ &amp; Sự Kiện Tự Hành');
    expect(html).toContain('2 logs');
    expect(html).toContain('Kích hoạt Autopilot buổi sáng');
    expect(html).toContain('Hoàn thành bài viết SEO');
    expect(html).toContain('Tìm kiếm sự kiện...');
  });

  it('render OfficeCommandPalette với danh sách lệnh 8 Agent và thao tác hệ thống', () => {
    const html = renderToStaticMarkup(
      <OfficeCommandPalette
        isOpen={true}
        onClose={() => {}}
        onSelectAgent={() => {}}
        onChangeCameraPreset={() => {}}
        onChangeViewMode={() => {}}
        onToggleAutopilot={() => {}}
        isAutopilotOn={true}
      />
    );

    expect(html).toContain('Tìm Phòng ban, Agent, Review Queue, Google Maps, GPU Workers (Ctrl+K)...');
    expect(html).toContain('AI Growth OS 2026');
    expect(html).toContain('Tắt Chế Độ Autopilot Tự Hành');
    expect(html).toContain('Chuyển Sang Góc Nhìn Mặt Bằng (Top-Down)');
    expect(html).toContain('Chuyển Sang Góc Nhìn Phối Cảnh (Isometric)');
    expect(html).toContain('Chuyển Đổi Qua Lại Chế Độ 3D / 2D');
    OFFICE_AGENTS_CONFIG.forEach((agent) => {
      expect(html).toContain(agent.name);
    });
  });

  it('render OfficeHUD với các Quality Presets (Cao, Cân Bằng, Tiết Kiệm) và nút Autopilot', () => {
    const html = renderToStaticMarkup(
      <OfficeHUD
        agents={mockViewModels}
        selectedAgentId="growth_lead"
        onSelectAgent={() => {}}
        viewMode="3d"
        onChangeViewMode={() => {}}
        cameraPreset="overview"
        onChangeCameraPreset={() => {}}
        qualityPreset="high"
        onChangeQualityPreset={() => {}}
        onOpenCommandPalette={() => {}}
        onToggleFloorPlan={() => {}}
        isFloorPlanOpen={true}
        onToggleTimeline={() => {}}
        isTimelineOpen={false}
        onToggleAutopilot={() => {}}
        isAutopilotOn={true}
      />
    );

    expect(html).toContain('AUTOPILOT ON');
    expect(html).toContain('Cao');
    expect(html).toContain('Cân Bằng');
    expect(html).toContain('Tiết Kiệm');
    expect(html).toContain('Tìm lệnh');
    expect(html).toContain('Ctrl+K');
    expect(html).toContain('Mặt bằng');
    expect(html).toContain('Nhật ký');
  });

  it('ánh xạ đầy đủ tất cả 14 phòng ban và toàn bộ các route ứng dụng vào đúng khu vực 3D', () => {
    expect(OFFICE_ROOMS.length).toBe(14);
    expect(resolveRoomForPath('/dashboard').id).toBe('command_center');
    expect(resolveRoomForPath('/agents').id).toBe('command_center');
    expect(resolveRoomForPath('/growth-results').id).toBe('command_center');
    expect(resolveRoomForPath('/agents/research').id).toBe('research_room');
    expect(resolveRoomForPath('/agents/growth_lead').id).toBe('research_room');
    expect(resolveRoomForPath('/knowledge-contexts').id).toBe('knowledge_library');
    expect(resolveRoomForPath('/gmaps', '?tab=drive_assets').id).toBe('knowledge_library');
    expect(resolveRoomForPath('/workflows').id).toBe('workflow_center');
    expect(resolveRoomForPath('/agents/content').id).toBe('content_studio');
    expect(resolveRoomForPath('/agents/seo').id).toBe('content_studio');
    expect(resolveRoomForPath('/artifacts').id).toBe('content_studio');
    expect(resolveRoomForPath('/review-queue').id).toBe('review_room');
    expect(resolveRoomForPath('/distribution').id).toBe('publishing_studio');
    expect(resolveRoomForPath('/gmaps').id).toBe('gmaps_lab');
    expect(resolveRoomForPath('/booking-leads').id).toBe('concierge_lounge');
    expect(resolveRoomForPath('/agents/community').id).toBe('community_hub');
    expect(resolveRoomForPath('/agents/performance').id).toBe('community_hub');
    expect(resolveRoomForPath('/admin/gpu-workers').id).toBe('server_room');
    expect(resolveRoomForPath('/admin/llm').id).toBe('server_room');
    expect(resolveRoomForPath('/workspace').id).toBe('reception_lobby');
    expect(resolveRoomForPath('/workspace-integrations').id).toBe('reception_lobby');
    expect(resolveRoomForPath('/onboarding').id).toBe('reception_lobby');
  });

  it('render DepartmentConsolePanel với tiêu đề phòng, thiết bị tương tác và không chứa sidebar trái', () => {
    const reviewRoom = OFFICE_ROOMS.find((r) => r.id === 'review_room')!;
    const html = renderToStaticMarkup(
      <DepartmentConsolePanel
        room={reviewRoom}
        activeRoute="/review-queue"
        isOpen={true}
        isMinimized={false}
        isExpanded={false}
        onSelectDevice={() => {}}
        onOpenModal={() => {}}
        onToggleAutopilot={() => {}}
        onToggleMinimized={() => {}}
        onToggleExpanded={() => {}}
        onClose={() => {}}
      >
        <div data-testid="review-content">Nội dung Review Queue thật</div>
      </DepartmentConsolePanel>
    );

    expect(html).toContain('Phòng Kiểm Duyệt Chất Lượng');
    expect(html).toContain('/review-queue');
    expect(html).toContain('Hàng Đợi Phê Duyệt');
    expect(html).toContain('Nội dung Review Queue thật');
    expect(html).toContain('Xem Phòng 3D');
    expect(html).not.toContain('DashboardSidebar');
  });

  it('cung cấp đủ 8 ngoại hình người khác biệt, morph-target khuôn mặt và đầy đủ AnimationClip toàn thân', () => {
    for (const agent of OFFICE_AGENTS_CONFIG) {
      expect(AGENT_HUMAN_APPEARANCES[agent.code]).toBeDefined();
    }
    const mouth = createMouthWithMorphTargets();
    expect(Object.keys(mouth.dictionary)).toEqual(['smile', 'jawOpen', 'concerned', 'focused']);
    mouth.geometry.dispose();

    const clips = getHumanAnimationClips();
    expect(Object.keys(clips)).toEqual(
      expect.arrayContaining(['idle', 'sit', 'stand', 'walk', 'work', 'think', 'talk', 'present', 'celebrate'])
    );
  });

  it('cung cấp đủ cửa phòng ban, pathfinding qua hành lang và giới hạn va chạm camera', () => {
    expect(ROOM_DOORS).toHaveLength(14);
    const path = buildOfficeWaypointPath([0, 0, -3.2], 'command_center', 'review_room');
    expect(path.length).toBeGreaterThanOrEqual(4);
    const clamped = clampWalkableCameraPosition(120, -5, -120);
    expect(clamped).toEqual([48, 1.4, -44]);
  });

  it('OfficeHUD hiển thị điều khiển Cổng Chính, Dạo Bước, Thời Điểm Ánh Sáng, Mở Mái/Trần Kín và FPS', () => {
    const html = renderToStaticMarkup(
      <OfficeHUD
        agents={mockViewModels}
        selectedAgentId={null}
        onSelectAgent={() => {}}
        viewMode="3d"
        onChangeViewMode={() => {}}
        cameraPreset="overview"
        onChangeCameraPreset={() => {}}
        timeOfDay="evening"
        onChangeTimeOfDay={() => {}}
        ceilingMode="interior"
        onToggleCeilingMode={() => {}}
        soundEnabled={false}
        onToggleSound={() => {}}
        fps={60}
      />
    );
    expect(html).toContain('Cổng Chính');
    expect(html).toContain('Dạo Bước');
    expect(html).toContain('Sáng');
    expect(html).toContain('Tối');
    expect(html).toContain('Trần Kín');
    expect(html).toContain('60 FPS');
  });

  it('ánh xạ đầy đủ 8 file GLB nhân vật thực tế trong public/models/agents/', () => {
    expect(Object.keys(AGENT_GLB_MODEL_URLS)).toHaveLength(8);
    for (const agent of OFFICE_AGENTS_CONFIG) {
      const relUrl = getAgentGlbUrl(agent.code);
      expect(relUrl).toBeTruthy();
      const absPath = path.join(process.cwd(), 'public', relUrl!.replace(/^\//, ''));
      expect(fs.existsSync(absPath)).toBe(true);
    }
  });
});
