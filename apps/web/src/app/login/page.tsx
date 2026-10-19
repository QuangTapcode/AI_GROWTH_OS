import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/LoginForm";
import LoginHeroPanel from "@/features/auth/components/LoginHeroPanel";

export const metadata: Metadata = {
  title: "Login · AI Growth OS",
  description:
    "Sign in to AI Growth OS to manage growth workflows, SEO, and content generation.",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen flex w-full bg-white">
      {/* Left Form Panel */}
      <LoginForm />

      {/* Right Hero / Dashboard Showcase Panel */}
      <LoginHeroPanel />
    </main>
  );
}
