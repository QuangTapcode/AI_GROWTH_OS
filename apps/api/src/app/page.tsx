export default function ApiHomePage() {
  return (
    <main>
      <h1>AI Growth OS API</h1>
      <p>Initial local staging API. Health endpoints check this process only.</p>
      <ul>
        <li><a href="/health">GET /health</a> — process health</li>
        <li><a href="/v1/health">GET /v1/health</a> — health endpoint used by both frontends</li>
      </ul>
      <p>Authentication, database persistence, queues and product endpoints are not implemented yet.</p>
    </main>
  );
}

