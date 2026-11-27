'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Office2DFallback } from './Office2DFallback';
import { OfficeAgentViewModel, DepartmentRoomConfig, RoomId } from '../types';

interface Props {
  children: ReactNode;
  agents: OfficeAgentViewModel[];
  onSelectAgent: (code: string) => void;
  selectedAgentId: string | null;
  onSelectRoom?: (roomId: RoomId, targetRoute?: string) => void;
  activeRoom?: DepartmentRoomConfig | null;
  canAdmin?: boolean;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
  isWebGLSupported: boolean;
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export class OfficeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: null,
      isWebGLSupported: checkWebGLSupport(),
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Office3D ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (!this.state.isWebGLSupported || this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col">
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs font-medium text-amber-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-amber-600 font-bold">⚠️ Chú ý:</span>
              <span>
                {!this.state.isWebGLSupported
                  ? 'Trình duyệt không hỗ trợ WebGL tăng tốc phần cứng. Tự động chuyển sang chế độ 2D.'
                  : 'Xảy ra sự cố khi tải không gian 3D. Đang hiển thị bản đồ 2D an toàn.'}
              </span>
            </div>
            {this.state.hasError && (
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, errorMessage: null })}
                className="text-xs font-bold text-amber-900 underline hover:no-underline cursor-pointer"
              >
                Thử lại 3D
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto">
            <Office2DFallback
              agents={this.props.agents}
              onSelectAgent={this.props.onSelectAgent}
              selectedAgentId={this.props.selectedAgentId}
              onSelectRoom={this.props.onSelectRoom}
              activeRoom={this.props.activeRoom}
              canAdmin={this.props.canAdmin}
            />
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
