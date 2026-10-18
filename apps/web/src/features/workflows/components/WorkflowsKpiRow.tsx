import React from "react";

export default function WorkflowsKpiRow() {
  const cards = [
    {
      id: "running",
      label: "RUNNING",
      value: "3",
      subtext: "AI runs in progress",
      iconBg: "bg-blue-50 border-blue-200 text-blue-600",
      icon: (
        <svg
          className="w-4 h-4 fill-current ml-0.5"
          viewBox="0 0 24 24"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      ),
    },
    {
      id: "completed",
      label: "COMPLETED TODAY",
      value: "35",
      subtext: "Successfully finished",
      iconBg: "bg-emerald-50 border-emerald-200 text-emerald-600",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    {
      id: "needs-review",
      label: "NEEDS REVIEW",
      value: "4",
      subtext: "Awaiting human approval",
      iconBg: "bg-amber-50 border-amber-200 text-amber-600",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      ),
    },
    {
      id: "blocked",
      label: "BLOCKED",
      value: "1",
      subtext: "Requires attention",
      iconBg: "bg-rose-50 border-rose-200 text-rose-600",
      icon: (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.id}
          className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-shadow flex items-center justify-between"
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            <p className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              {card.value}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{card.subtext}</p>
          </div>
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${card.iconBg}`}
          >
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
