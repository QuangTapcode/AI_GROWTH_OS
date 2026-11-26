import { DepartmentRoomConfig, RoomId } from '../types';

/**
 * Bản đồ 14 khu vực / phòng ban hợp nhất trong Trụ sở AI Growth OS (64m x 48m).
 * Mỗi route ứng dụng cũ được ánh xạ chính xác vào phòng ban và thiết bị tương tác thực tế.
 */
export const OFFICE_ROOMS: DepartmentRoomConfig[] = [
  {
    id: 'command_center',
    name: 'Trung Tâm Điều Hành',
    nameEn: 'Central Command Center',
    subtitle: 'Dashboard · Autopilot Core · 8 Agents · Growth Results',
    icon: '🏛️',
    accentColor: '#1D4ED8',
    zoneColor: '#1E3A8A',
    bounds: { x: 0, z: 0, width: 14, depth: 12 },
    cameraPos: [14, 15, 16],
    cameraTarget: [0, 1.2, 0],
    defaultRoute: '/dashboard',
    routes: ['/office', '/dashboard', '/agents', '/growth-results', '/health'],
    agentCode: 'growth_lead',
    devices: [
      { id: 'dev-overview', label: 'Bảng Tổng Quan (Overview)', route: '/dashboard', icon: '📊', description: 'KPI, Traffic & Growth Summary' },
      { id: 'dev-agents', label: 'Đội Ngũ 8 AI Agents', route: '/agents', icon: '🤖', description: 'Trạng thái & điều phối 8 Agent' },
      { id: 'dev-results', label: 'Kết Quả Tăng Trưởng', route: '/growth-results', icon: '📈', description: 'Leads & Analytics thực tế' },
      { id: 'dev-autopilot', label: 'Autopilot Console', route: '/office', icon: '⚡', modalAction: 'autopilot', description: 'Bật/Tắt vận hành tự hành 24/7' },
    ],
  },
  {
    id: 'reception_lobby',
    name: 'Sảnh Đón & Tích Hợp',
    nameEn: 'Integration Reception',
    subtitle: 'Workspace Settings · Integrations · Onboarding',
    icon: '🏢',
    accentColor: '#2563EB',
    zoneColor: '#1E40AF',
    bounds: { x: 0, z: -17, width: 18, depth: 8 },
    cameraPos: [0, 12, -5],
    cameraTarget: [0, 1.2, -17],
    defaultRoute: '/workspace',
    routes: ['/workspace', '/workspace-integrations', '/onboarding'],
    devices: [
      { id: 'dev-ws', label: 'Cài Đặt Workspace', route: '/workspace', icon: '⚙️', description: 'Hồ sơ doanh nghiệp & thành viên' },
      { id: 'dev-int', label: 'Trung Tâm Tích Hợp', route: '/workspace-integrations', icon: '🔌', description: 'Kênh kết nối & brand voice' },
      { id: 'dev-onb', label: 'Kết Nối Kênh (Onboarding)', route: '/onboarding', icon: '🔗', description: 'Fanpage, Maps, Drive, Group' },
    ],
  },
  {
    id: 'research_room',
    name: 'Phòng Nghiên Cứu & Chiến Lược',
    nameEn: 'Research & Strategy Room',
    subtitle: 'Market Discovery · Growth Lead · Strategic Planning',
    icon: '🔭',
    accentColor: '#3B82F6',
    zoneColor: '#1D4ED8',
    bounds: { x: -18, z: -15, width: 12, depth: 10 },
    cameraPos: [-10, 11, -5],
    cameraTarget: [-18, 1.2, -15],
    defaultRoute: '/agents/research',
    routes: ['/agents/research', '/agents/growth_lead'],
    agentCode: 'growth_lead',
    devices: [
      { id: 'dev-research', label: 'Research & Trend Console', route: '/agents/research', icon: '🔭', description: 'Khám phá cơ hội & đối thủ' },
      { id: 'dev-growth-lead', label: 'Growth Lead Console', route: '/agents/growth_lead', icon: '🎩', description: 'Chiến lược & learning round' },
    ],
  },
  {
    id: 'knowledge_library',
    name: 'Thư Viện Tri Thức & Tư Liệu',
    nameEn: 'Asset & Knowledge Library',
    subtitle: 'Knowledge Contexts · Drive Assets · RAG Snapshots',
    icon: '📚',
    accentColor: '#6366F1',
    zoneColor: '#312E81',
    bounds: { x: -24, z: -2, width: 10, depth: 10 },
    cameraPos: [-13, 10, 5],
    cameraTarget: [-24, 1.2, -2],
    defaultRoute: '/knowledge-contexts',
    routes: ['/knowledge-contexts'],
    agentCode: 'asset_manager',
    devices: [
      { id: 'dev-knowledge', label: 'Knowledge Contexts', route: '/knowledge-contexts', icon: '🧠', description: 'Tạo snapshot bối cảnh RAG' },
      { id: 'dev-drive', label: 'Kho Tư Liệu Drive', route: '/gmaps?tab=drive_assets', icon: '📁', description: 'Quét ảnh & gắn thẻ Gemini Vision' },
    ],
  },
  {
    id: 'workflow_center',
    name: 'Trung Tâm Quy Trình (Workflows)',
    nameEn: 'Workflow Operations Center',
    subtitle: 'Task Pipelines · Dependencies · Execution Logs',
    icon: '🔀',
    accentColor: '#0284C7',
    zoneColor: '#075985',
    bounds: { x: -12, z: -6, width: 10, depth: 8 },
    cameraPos: [-4, 11, 4],
    cameraTarget: [-12, 1.0, -6],
    defaultRoute: '/workflows',
    routes: ['/workflows'],
    devices: [
      { id: 'dev-workflows', label: 'Pipeline & Task Manager', route: '/workflows', icon: '🔀', description: 'Quản lý luồng chạy & retry task' },
    ],
  },
  {
    id: 'content_studio',
    name: 'Studio Sáng Tạo & SEO',
    nameEn: 'Content Creation Studio',
    subtitle: 'Content Planner · SEO Articles · Artifacts Vault',
    icon: '✍️',
    accentColor: '#0EA5E9',
    zoneColor: '#0369A1',
    bounds: { x: -22, z: 10, width: 12, depth: 10 },
    cameraPos: [-12, 11, 18],
    cameraTarget: [-22, 1.2, 10],
    defaultRoute: '/agents/content',
    routes: ['/agents/content', '/agents/seo', '/artifacts'],
    agentCode: 'content_planner',
    devices: [
      { id: 'dev-content', label: 'Content Studio', route: '/agents/content', icon: '✍️', description: 'Kịch bản & Social Pack' },
      { id: 'dev-seo', label: 'SEO Worker Console', route: '/agents/seo', icon: '🔎', description: 'Bài viết SEO & trích dẫn nguồn' },
      { id: 'dev-artifacts', label: 'Kho Sản Phẩm (Artifacts)', route: '/artifacts', icon: '📦', description: 'Phiên bản & biên tập nội dung' },
    ],
  },
  {
    id: 'review_room',
    name: 'Phòng Kiểm Duyệt Chất Lượng',
    nameEn: 'Review & Quality Control Room',
    subtitle: 'Human Approval Queue · OCR Guardrail · Fact Check',
    icon: '✅',
    accentColor: '#F59E0B',
    zoneColor: '#78350F',
    bounds: { x: -14, z: 17, width: 11, depth: 9 },
    cameraPos: [-7, 11, 26],
    cameraTarget: [-14, 1.2, 17],
    defaultRoute: '/review-queue',
    routes: ['/review-queue'],
    devices: [
      { id: 'dev-review', label: 'Hàng Đợi Phê Duyệt', route: '/review-queue', icon: '✅', description: 'Approve / Reject sản phẩm AI' },
    ],
  },
  {
    id: 'publishing_studio',
    name: 'Phòng Phát Hành Đa Kênh',
    nameEn: 'Publishing & Distribution Studio',
    subtitle: 'Multi-Channel Calendar · TikTok 9:16 Studio · Outbox',
    icon: '🚀',
    accentColor: '#EC4899',
    zoneColor: '#831843',
    bounds: { x: -1, z: 17, width: 11, depth: 9 },
    cameraPos: [4, 11, 26],
    cameraTarget: [-1, 1.2, 17],
    defaultRoute: '/distribution',
    routes: ['/distribution'],
    agentCode: 'publisher',
    devices: [
      { id: 'dev-dist', label: 'Lịch Xuất Bản & TikTok', route: '/distribution', icon: '🚀', description: 'Phân phối Facebook, Web, TikTok' },
    ],
  },
  {
    id: 'gmaps_lab',
    name: 'Phòng Local SEO & Google Maps',
    nameEn: 'Local Growth & Google Maps Lab',
    subtitle: 'Google Business Profile · Local Posts · Auto-Reply Reviews',
    icon: '📍',
    accentColor: '#F97316',
    zoneColor: '#7C2D12',
    bounds: { x: 12, z: 17, width: 11, depth: 9 },
    cameraPos: [18, 11, 26],
    cameraTarget: [12, 1.2, 17],
    defaultRoute: '/gmaps',
    routes: ['/gmaps'],
    agentCode: 'gmaps_specialist',
    devices: [
      { id: 'dev-gmaps', label: 'Google Maps Hub', route: '/gmaps', icon: '📍', description: 'Quản lý địa điểm & đánh giá' },
    ],
  },
  {
    id: 'social_center',
    name: 'Trung Tâm Tương Tác Mạng Xã Hội',
    nameEn: 'Social Engagement Center',
    subtitle: 'Comment Reply 24/7 · SLA < 3m · RAG Community Guard',
    icon: '💬',
    accentColor: '#14B8A6',
    zoneColor: '#115E59',
    bounds: { x: 22, z: 10, width: 12, depth: 10 },
    cameraPos: [13, 11, 18],
    cameraTarget: [22, 1.2, 10],
    defaultRoute: '/agents/community',
    routes: [],
    agentCode: 'comment_reply',
    devices: [
      { id: 'dev-comments', label: 'Comment Reply 24/7', route: '/agents/community#comments', icon: '💬', description: 'Phản hồi bình luận tự hành' },
    ],
  },
  {
    id: 'concierge_lounge',
    name: 'Phòng Tư Vấn 1-1 & Chốt Lead',
    nameEn: 'Omnichannel Concierge',
    subtitle: 'Inbox 1-1 · Booking Leads · CRM Pipeline',
    icon: '🛎️',
    accentColor: '#8B5CF6',
    zoneColor: '#4C1D95',
    bounds: { x: 24, z: -2, width: 10, depth: 10 },
    cameraPos: [14, 11, 5],
    cameraTarget: [24, 1.2, -2],
    defaultRoute: '/booking-leads',
    routes: ['/booking-leads'],
    agentCode: 'inbox_concierge',
    devices: [
      { id: 'dev-leads', label: 'Hộp Thư & Booking Leads', route: '/booking-leads', icon: '🛎️', description: 'Quản lý đặt chỗ & hội thoại 1-1' },
    ],
  },
  {
    id: 'community_hub',
    name: 'Không Gian Cộng Đồng & Hiệu Suất',
    nameEn: 'Community & Performance Hub',
    subtitle: 'Group Growth 0→1.000 · Experiments · Evidence',
    icon: '👥',
    accentColor: '#10B981',
    zoneColor: '#064E3B',
    bounds: { x: 12, z: 6, width: 10, depth: 9 },
    cameraPos: [4, 11, 13],
    cameraTarget: [12, 1.2, 6],
    defaultRoute: '/agents/community',
    routes: ['/agents/community', '/agents/performance'],
    agentCode: 'community_growth',
    devices: [
      { id: 'dev-comm', label: 'Community Growth Hub', route: '/agents/community', icon: '👥', description: 'Lộ trình Group & auto-invite' },
      { id: 'dev-perf', label: 'Performance & Experiments', route: '/agents/performance', icon: '🧪', description: 'Đo lường thí nghiệm & đồng bộ social' },
    ],
  },
  {
    id: 'server_room',
    name: 'Phòng Máy Chủ AI & GPU',
    nameEn: 'AI Engine & Infrastructure Room',
    subtitle: 'GPU Worker Cluster · Multi-LLM Auto-Switch Router',
    icon: '🖥️',
    accentColor: '#A855F7',
    zoneColor: '#3B0764',
    bounds: { x: 18, z: -15, width: 12, depth: 10 },
    cameraPos: [10, 11, -5],
    cameraTarget: [18, 1.2, -15],
    defaultRoute: '/admin/llm',
    routes: ['/admin/gpu-workers', '/admin/llm'],
    requiresAdmin: true,
    devices: [
      { id: 'dev-llm', label: 'Multi-LLM Auto-Switch', route: '/admin/llm', icon: '🎛️', description: 'Cấu hình Gemini / DeepSeek / OpenAI / Claude' },
      { id: 'dev-gpu', label: 'GPU Worker Cluster', route: '/admin/gpu-workers', icon: '⚡', description: 'Giám sát node GPU & image jobs' },
    ],
  },
  {
    id: 'help_finance_desk',
    name: 'Quầy Tài Chính, Báo Cáo & Trợ Giúp',
    nameEn: 'Help & Account / Finance Desk',
    subtitle: 'Ví Marketing VietQR · Báo Cáo Ngày · Tài Liệu Hướng Dẫn',
    icon: '💳',
    accentColor: '#059669',
    zoneColor: '#065F46',
    bounds: { x: 12, z: -6, width: 8, depth: 8 },
    cameraPos: [5, 10, 2],
    cameraTarget: [12, 1.0, -6],
    defaultRoute: '/workspace',
    routes: [],
    devices: [
      { id: 'dev-wallet', label: 'Nạp Ví VietQR', route: '/office', icon: '💳', modalAction: 'wallet', description: 'Quản lý tín dụng & nạp VietQR' },
      { id: 'dev-report', label: 'Báo Cáo Điều Hành Ngày', route: '/office', icon: '📋', modalAction: 'daily_report', description: 'Tổng hợp kết quả 8 Agent hôm nay' },
      { id: 'dev-help', label: 'Trợ Giúp & Phím Tắt', route: '/office', icon: '❓', modalAction: 'help', description: 'Hướng dẫn sử dụng văn phòng 3D' },
    ],
  },
];

export function getRoomById(id: RoomId): DepartmentRoomConfig | undefined {
  return OFFICE_ROOMS.find((r) => r.id === id);
}

/**
 * Ánh xạ mọi URL hiện hữu của ứng dụng sang phòng ban tương ứng trong văn phòng 3D.
 */
export function resolveRoomForPath(pathname: string, search?: string): DepartmentRoomConfig {
  const clean = pathname.replace(/\/+$/, '') || '/office';

  // Special query param mapping: /gmaps?tab=drive_assets -> Knowledge Library
  if (clean === '/gmaps' && search?.includes('tab=drive_assets')) {
    return getRoomById('knowledge_library') ?? OFFICE_ROOMS[0];
  }

  // Exact match
  const exact = OFFICE_ROOMS.find((room) => room.routes.includes(clean));
  if (exact) return exact;

  // Prefix match fallback
  const prefix = OFFICE_ROOMS.find((room) =>
    room.routes.some((r) => r !== '/office' && clean.startsWith(r + '/'))
  );
  if (prefix) return prefix;

  return OFFICE_ROOMS[0]; // command_center
}
