export type AgentStatusCode =
  | 'idle'
  | 'queued'
  | 'running'
  | 'needs_review'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface TaskStep {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  description?: string;
}

export interface OfficeAgentTask {
  id: string;
  title: string;
  status: string;
  progressPercent: number | null;
  startedAt?: string | null;
  duration?: string | null;
  steps?: TaskStep[];
  logs?: string[];
  errorDetails?: string | null;
}

export interface OfficeAgentConfig {
  num: string;
  code: string;
  name: string;
  title: string;
  department: string;
  roomId: RoomId;
  role: string;
  position: [number, number, number];
  rotationY: number;
  color: string;
  icon: string;
  actionRoute: string;
  kpi: string;
  desc: string;
}

export interface OfficeAgentViewModel extends OfficeAgentConfig {
  status: AgentStatusCode;
  currentTask: OfficeAgentTask | null;
  isOnline: boolean;
  activeTaskId?: string | null;
  lastUpdated?: string;
}

export type ViewMode = '3d' | '2d';

export type CameraPreset = 'overview' | 'floorplan' | 'room' | 'agent' | 'entrance' | 'walkthrough';

export type QualityPreset = 'high' | 'balanced' | 'performance';

export type TimeOfDayPreset = 'morning' | 'daytime' | 'evening' | 'night';

export type CeilingMode = 'cutaway' | 'interior';

export type RoomId =
  | 'command_center'
  | 'reception_lobby'
  | 'research_room'
  | 'knowledge_library'
  | 'workflow_center'
  | 'content_studio'
  | 'review_room'
  | 'publishing_studio'
  | 'gmaps_lab'
  | 'social_center'
  | 'concierge_lounge'
  | 'community_hub'
  | 'server_room'
  | 'help_finance_desk';

export interface RoomDeviceAction {
  id: string;
  label: string;
  route: string;
  icon: string;
  description?: string;
  modalAction?: 'wallet' | 'daily_report' | 'help' | 'autopilot';
}

export interface DepartmentRoomConfig {
  id: RoomId;
  name: string;
  nameEn: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  zoneColor: string;
  bounds: { x: number; z: number; width: number; depth: number };
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  defaultRoute: string;
  routes: string[];
  agentCode?: string;
  requiresAdmin?: boolean;
  devices: RoomDeviceAction[];
}

export interface OfficeEvent {
  id: string;
  timestamp: string;
  agentCode: string;
  type: 'started' | 'completed' | 'approval_required' | 'failed' | 'retry' | 'autopilot';
  message: string;
  taskId?: string;
}

export interface WorkflowHandoff {
  id: string;
  sourceCode: string;
  targetCode: string;
  title: string;
  active: boolean;
  progress?: number;
}
