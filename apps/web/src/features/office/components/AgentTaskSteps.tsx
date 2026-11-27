'use client';

import React from 'react';
import { TaskStep } from '../types';

interface AgentTaskStepsProps {
  steps?: TaskStep[];
  currentOperation?: string;
  isCompleted?: boolean;
}

export function AgentTaskSteps({
  steps,
  currentOperation,
  isCompleted,
}: AgentTaskStepsProps) {
  // Default fallback steps if task steps are not granularly sent from backend
  const displaySteps: TaskStep[] = steps && steps.length > 0
    ? steps
    : [
        {
          id: 'step-1',
          title: 'Thu thập tín hiệu & Bối cảnh',
          status: isCompleted ? 'completed' : 'completed',
          description: 'Quét kho tri thức RAG & lịch sử tương tác trước đó',
        },
        {
          id: 'step-2',
          title: 'Phân tích & Xử lý với Gemini AI',
          status: isCompleted ? 'completed' : 'in_progress',
          description: currentOperation || 'Đang thực thi mô hình ngôn ngữ lớn',
        },
        {
          id: 'step-3',
          title: 'Kiểm tra Hallucination & Chuẩn hóa',
          status: isCompleted ? 'completed' : 'pending',
          description: 'Đối soát Grounding facts và quy tắc an toàn nội dung',
        },
        {
          id: 'step-4',
          title: 'Phê duyệt & Xuất bản đa kênh',
          status: isCompleted ? 'completed' : 'pending',
          description: 'Handoff sang hàng đợi Review Queue hoặc auto-publish',
        },
      ];

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Tiến trình tác vụ tự hành
        </span>
        <span className="text-[10px] text-blue-400 font-mono">
          {displaySteps.filter((s) => s.status === 'completed').length}/{displaySteps.length} Hoàn tất
        </span>
      </div>

      <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
        {displaySteps.map((step, idx) => {
          let badgeColor = 'bg-slate-700 text-slate-400 border-slate-600';
          let statusIcon = <span>{idx + 1}</span>;

          if (step.status === 'completed') {
            badgeColor = 'bg-emerald-600 text-white border-emerald-500';
            statusIcon = (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            );
          } else if (step.status === 'in_progress') {
            badgeColor = 'bg-blue-600 text-white border-blue-400 ring-2 ring-blue-500/40 animate-pulse';
            statusIcon = (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            );
          } else if (step.status === 'failed') {
            badgeColor = 'bg-rose-600 text-white border-rose-500';
            statusIcon = <span>!</span>;
          }

          return (
            <div key={step.id} className="relative group">
              {/* Step Circle Badge */}
              <div
                className={`absolute -left-6 top-0 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold ${badgeColor}`}
              >
                {statusIcon}
              </div>

              <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-2.5 transition-colors group-hover:bg-slate-800/70">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-slate-200 text-xs">{step.title}</h5>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                      step.status === 'completed'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                        : step.status === 'in_progress'
                        ? 'bg-blue-950/60 text-blue-400 border border-blue-800/50'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {step.status === 'completed'
                      ? 'Done'
                      : step.status === 'in_progress'
                      ? 'Running'
                      : 'Pending'}
                  </span>
                </div>
                {step.description && (
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
