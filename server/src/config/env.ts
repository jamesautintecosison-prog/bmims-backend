import dotenv from "dotenv";

// Load the project-root .env (the server is started from /server)
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
};
