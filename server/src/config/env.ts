import dotenv from "dotenv";

// Load the project-root .env (the server is started from /server)
dotenv.config({ path: "../.env" });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// The API only ever receives the three restricted-role connection strings.
// MIGRATION_DATABASE_URL (the owner) is deliberately NOT read here.
export const env = {
  port: Number(process.env.PORT ?? 3000),
  adminUrl: required("ADMIN_DATABASE_URL"),
  staffUrl: required("STAFF_DATABASE_URL"),
  residentUrl: required("RESIDENT_DATABASE_URL"),
};
