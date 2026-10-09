"use client";

import React from "react";
import { LoginForm } from "@/features/auth/components/LoginForm";
import LoginHeroPanel from "@/components/login/LoginHeroPanel";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <div className={`${styles.loginWrapper} d-flex`}>
      {/* ── Left Panel: Login Form ── */}
      <LoginForm />

      {/* ── Right Panel: Hero / Visual ── */}
      <LoginHeroPanel />
    </div>
  );
}
