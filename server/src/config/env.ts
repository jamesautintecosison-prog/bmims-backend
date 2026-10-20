import dotenv from "dotenv";

// Load the project-root .env when it exists (local development).
// On a host, the same names come from the host's environment settings.
dotenv.config({ path: "../.env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

// The API only ever receives restricted-role connection strings.
// MIGRATION_DATABASE_URL (the owner) is deliberately NOT read here.
export const env = {
  port: Number(process.env.PORT ?? 3000),
  adminUrl: required("ADMIN_DATABASE_URL"),
  staffUrl: required("STAFF_DATABASE_URL"),
  residentUrl: required("RESIDENT_DATABASE_URL"),
  authUrl: required("AUTH_DATABASE_URL"),
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1h",
  // Web addresses of the front-end allowed to call this API (comma-separated)
  clientOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // How many reverse proxies sit in front of the API: 0 locally, 1 on most hosts.
  // Needed so rate limiting sees each visitor's real address.
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  paymongoSecretKey: process.env.PAYMONGO_SECRET_KEY,
  paymongoWebhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET,
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
};
