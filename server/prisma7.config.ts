import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load the project-root .env (one level above /server)
dotenv.config({ path: "../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Owner connection: used ONLY by the Prisma CLI to read the schema.
    // The running app uses the restricted role connections instead.
    url: process.env["MIGRATION_DATABASE_URL"],
  },
});