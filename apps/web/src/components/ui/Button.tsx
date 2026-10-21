"use client";

import React from "react";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: React.ReactNode;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

export default function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  fullWidth = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const variantClasses = {
    primary:
      "bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs hover:shadow-md border border-blue-600/20 active:translate-y-px",
    secondary:
      "bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold border border-slate-200 active:translate-y-px",
    outline:
      "bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 shadow-xs hover:border-slate-300 active:translate-y-px",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-700 font-medium active:translate-y-px",
    danger:
      "bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold border border-rose-200 active:translate-y-px",
  };

  const sizeClasses = {
    sm: "h-9 px-3.5 text-xs rounded-lg gap-1.5",
    md: "h-10 px-4 text-sm rounded-xl gap-2",
    lg: "h-12 px-5 text-base rounded-xl gap-2.5",
  };

  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center transition-all duration-150 cursor-pointer select-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {icon && iconPosition === "left" && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
      {icon && iconPosition === "right" && <span className="shrink-0">{icon}</span>}
    </button>
  );
}
