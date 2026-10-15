export function getEnvironment() {
  const environment = process.env.APP_ENV || "staging";
  if (!["local", "staging", "test"].includes(environment)) {
    throw new Error("APP_ENV must be local, staging or test.");
  }
  const integrationMode = process.env.INTEGRATION_MODE || "fake";
  if (integrationMode !== "fake") {
    throw new Error("This bootstrap only supports INTEGRATION_MODE=fake.");
  }
  const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ||
    "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  for (const origin of allowedOrigins) {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error("CORS_ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
    }
  }
  return { environment, integrationMode, allowedOrigins };
}

