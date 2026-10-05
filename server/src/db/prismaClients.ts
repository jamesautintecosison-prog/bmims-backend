import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../config/env.js";

// One Prisma client per database role. Which one a request uses is decided
// by the caller's tier, so PostgreSQL itself enforces that tier's privileges.
function makeClient(connectionString: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const clients = {
  admin: makeClient(env.adminUrl),
  staff: makeClient(env.staffUrl),
  resident: makeClient(env.residentUrl),
} as const;

export type Tier = keyof typeof clients;

// auth_role can only SELECT from users. It is used for login lookups and
// is never used for anything a signed-in user does.
export const authClient = makeClient(env.authUrl);
