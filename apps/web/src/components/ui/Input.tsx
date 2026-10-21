"use client";

import React from "react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      rightElement,
      fullWidth = true,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className={`space-y-1.5 ${fullWidth ? "w-full" : ""}`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs md:text-sm font-semibold text-slate-700"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full h-11 md:h-12 bg-white rounded-xl border text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-hidden focus:border-blue-500 focus:ring-3 focus:ring-blue-500/15 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${
              icon ? "pl-11 pr-4" : "px-4"
            } ${rightElement ? "pr-11" : ""} ${
              error
                ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/15"
                : "border-slate-300 hover:border-slate-400"
            } ${className}`}
            {...props}
          />
          {rightElement && (
            <div className="absolute right-3.5 flex items-center text-slate-400">
              {rightElement}
            </div>
          )}
        </div>
        {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-slate-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
