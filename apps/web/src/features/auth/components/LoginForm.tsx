"use client";

import React, { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/login/login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    // Smooth transition to dashboard
    setTimeout(() => {
      router.push("/dashboard");
    }, 400);
  };

  const handleGoogleSignIn = () => {
    setIsLoading(true);
    // Smooth transition to dashboard
    setTimeout(() => {
      router.push("/dashboard");
    }, 400);
  };

  return (
    <div className={`${styles.formPanel} d-flex flex-column justify-content-between`}>
      <div className={styles.formContent}>
        {/* Logo */}
        <div className={`${styles.logo} d-flex align-items-center gap-2 mb-5`}>
          <div className={styles.logoIcon}>
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width="36" height="36" rx="10" fill="#4A7BF7" />
              <path
                d="M10 18L14 14L18 18L22 14L26 18"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M10 24L14 20L18 24L22 20L26 24"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
              />
            </svg>
          </div>
          <span className={styles.logoText}>AI Growth OS</span>
        </div>

        {/* Welcome heading */}
        <div className="mb-4">
          <h1 className={styles.heading}>Welcome back</h1>
          <p className={styles.subtext}>
            New to AI Growth OS?{" "}
            <Link href="/register" className={styles.createLink}>
              Create an account
            </Link>
          </p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className="mb-3">
            <label
              htmlFor="login-email"
              className={`form-label ${styles.inputLabel}`}
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              className={`form-control ${styles.inputField}`}
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <button
            type="submit"
            className={`btn w-100 ${styles.signInBtn}`}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="d-flex align-items-center justify-content-center gap-2">
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                ></span>
                Signing in...
              </span>
            ) : (
              <span className="d-flex align-items-center justify-content-center gap-2">
                Sign In
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8H13M13 8L9 4M13 8L9 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className={`${styles.divider} d-flex align-items-center my-4`}>
          <hr className="flex-grow-1" />
          <span className={styles.dividerText}>or</span>
          <hr className="flex-grow-1" />
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          className={`btn w-100 ${styles.googleBtn}`}
          onClick={handleGoogleSignIn}
        >
          <span className="d-flex align-items-center justify-content-center gap-2">
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path
                fill="#EA4335"
                d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
              />
              <path
                fill="#4285F4"
                d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
              />
              <path
                fill="#FBBC05"
                d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
              />
              <path
                fill="#34A853"
                d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
              />
            </svg>
            Sign in with Google
          </span>
        </button>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        <span>&copy; {new Date().getFullYear()} AI Growth OS Inc.</span>
        <div className={styles.footerLinks}>
          <Link href="/terms">Terms of Service</Link>
          <span className={styles.footerDot}>&middot;</span>
          <Link href="/privacy">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}
