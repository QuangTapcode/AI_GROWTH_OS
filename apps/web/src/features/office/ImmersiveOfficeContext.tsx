'use client';

import { createContext, useContext } from 'react';
import { DepartmentRoomConfig, OfficeAgentViewModel, RoomId } from './types';

export interface ImmersiveOfficeContextValue {
  isInsideImmersiveShell: boolean;
  activeRoom: DepartmentRoomConfig | null;
  activeRoute: string;
  selectedAgentCode: string | null;
  hoveredRoomId: RoomId | null;
  isPanelMinimized: boolean;
  isPanelExpanded: boolean;
  agents: OfficeAgentViewModel[];
  isAutopilotOn: boolean;
  navigateToRoom: (roomId: RoomId, targetRoute?: string) => void;
  selectAgent: (code: string | null) => void;
  setHoveredRoomId: (roomId: RoomId | null) => void;
  closePanel: () => void;
  togglePanelMinimized: () => void;
  togglePanelExpanded: () => void;
  openGlobalModal: (modal: 'wallet' | 'daily_report' | 'help') => void;
  toggleAutopilot: () => Promise<void>;
}

const DEFAULT_CONTEXT: ImmersiveOfficeContextValue = {
  isInsideImmersiveShell: false,
  activeRoom: null,
  activeRoute: '/office',
  selectedAgentCode: null,
  hoveredRoomId: null,
  isPanelMinimized: false,
  isPanelExpanded: false,
  agents: [],
  isAutopilotOn: false,
  navigateToRoom: () => undefined,
  selectAgent: () => undefined,
  setHoveredRoomId: () => undefined,
  closePanel: () => undefined,
  togglePanelMinimized: () => undefined,
  togglePanelExpanded: () => undefined,
  openGlobalModal: () => undefined,
  toggleAutopilot: async () => undefined,
};

export const ImmersiveOfficeContext = createContext<ImmersiveOfficeContextValue>(DEFAULT_CONTEXT);

export function useImmersiveOffice(): ImmersiveOfficeContextValue {
  return useContext(ImmersiveOfficeContext);
}
