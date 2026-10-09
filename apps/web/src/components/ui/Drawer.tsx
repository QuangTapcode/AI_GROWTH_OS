"use client";

import React, { useEffect } from "react";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: number | string;
  className?: string;
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth,
  className,
}: DrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`${styles.panel} ${className || ""}`}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <div className={styles.titleBlock}>
            <h3 className={styles.title}>{title}</h3>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close drawer"
          >
            ✕
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
