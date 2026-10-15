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
      </section>
      <ApiStatus />
      <footer className="muted">
        <span>Initial application bootstrap</span>
        <a href="http://localhost:3001">Open TripC pilot</a>
      </footer>
    </main>
  );
}

