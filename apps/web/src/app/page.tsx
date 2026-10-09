import ApiStatus from "@/features/staging/api-status";

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
        <p className="lead">The management application is ready for development. Sign-in, workspaces, content approval and reporting will be added in the next implementation steps.</p>
        <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
          <a
            href="/login"
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
            Đăng nhập (Login) →
          </a>
          <a
            href="/dashboard"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "12px 24px",
              backgroundColor: "#ffffff",
              color: "#1e293b",
              border: "1px solid #cbd5e1",
              borderRadius: "10px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Vào thẳng Dashboard
          </a>
        </div>
      </section>
      <ApiStatus />
      <footer className="muted">
        <span>Initial application bootstrap</span>
        <div style={{ display: "flex", gap: "16px" }}>
          <a href="/login">Trang Login</a>
          <a href="/dashboard">Trang Dashboard</a>
          <a href="http://localhost:3001">Open TripC pilot</a>
        </div>
      </footer>
    </main>
  );
}

