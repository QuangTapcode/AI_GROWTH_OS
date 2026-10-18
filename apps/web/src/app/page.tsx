import ApiStatus from "@/features/staging/api-status";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <header>
        <a className="brand" href="/">AI Growth OS</a>
        <span className="badge">Local staging</span>
      </header>
      <section className="hero">
        <p className="eyebrow">AI Growth OS · Management</p>
        <h1>A workspace for your growth plans.</h1>
        <p className="lead">
          The management application is ready for development. Sign-in, workspaces, content approval and reporting are integrated into our workflows.
        </p>
        <div style={{ marginTop: "24px", display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href="/workflows"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Workflows & Tasks →
          </Link>
          <Link
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#1e293b",
              color: "#ffffff",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Overview Dashboard
          </Link>
          <Link
            href="/review-queue"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#e11d48",
              color: "#ffffff",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Review Queue (4) →
          </Link>
          <Link
            href="/artifacts"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#0284c7",
              color: "#ffffff",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Artifacts →
          </Link>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 20px",
              backgroundColor: "#f1f5f9",
              color: "#334155",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Đăng nhập (Login)
          </Link>
        </div>
      </section>
      <ApiStatus />
      <footer className="muted">
        <span>Initial application bootstrap</span>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <Link href="/artifacts">Artifacts</Link>
          <Link href="/review-queue">Review Queue</Link>
          <Link href="/workflows">Workflows & Tasks</Link>
          <Link href="/dashboard">Overview Dashboard</Link>
          <Link href="/login">Trang Login</Link>
          <a href="http://localhost:3001">Open TripC pilot</a>
        </div>
      </footer>
    </main>
  );
}
