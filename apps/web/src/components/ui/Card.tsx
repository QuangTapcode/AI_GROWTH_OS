"use client";

import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
}

export function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
  ...props
}: CardProps) {
  const paddingMap = {
    none: "",
    sm: "p-4 md:p-5",
    md: "p-5 md:p-6",
    lg: "p-6 md:p-8",
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs transition-all duration-200 ${
        paddingMap[padding]
      } ${
        hover
          ? "hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5"
          : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function CardHeader({
  title,
  description,
  action,
  badge,
  className = "",
}: CardHeaderProps) {
  return (
    <div
      className={`flex items-start justify-between gap-4 pb-4 border-b border-slate-100 mb-5 ${className}`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <h3 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">
            {title}
          </h3>
          {badge}
        </div>
        {description && (
          <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default Card;
