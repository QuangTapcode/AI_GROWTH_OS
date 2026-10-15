import ApiStatus from "@/features/staging/api-status";

export default function HomePage() {
  return (
    <main className="shell">
      <header>
        <a className="brand" href="/">TripC</a>
        <span className="badge">Local staging</span>
      </header>
      <section className="hero">
        <p className="eyebrow">Da Nang · English website pilot</p>
        <h1>Your next chapter in Da Nang.</h1>
        <p className="lead">We’re preparing English guides about housing, coworking and everyday life. This is the initial staging site; articles and the information request form will follow.</p>
      </section>
      <ApiStatus />
      <footer className="muted">
        <span>Initial application bootstrap</span>
        <a href="http://localhost:3000">Open management staging</a>
      </footer>
    </main>
  );
}

