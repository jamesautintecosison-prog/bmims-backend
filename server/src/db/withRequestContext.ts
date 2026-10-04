import type { Prisma } from "../../generated/prisma/client.js";
import { clients, type Tier } from "./prismaClients.js";

export interface RequestContext {
  tier: Tier;
  staffId?: number;
  residentId?: number;
}

// Runs fn inside ONE transaction and tells PostgreSQL who is calling.
// The row-level-security policies read app.staff_id / app.resident_id.
// set_config(..., true) is transaction-local, so it cannot leak between
// requests that share a pooled connection. Values are bound parameters.
export async function withRequestContext<T>(
  ctx: RequestContext,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return clients[ctx.tier].$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.staff_id', ${ctx.staffId?.toString() ?? ""}, true)`;
    await tx.$queryRaw`SELECT set_config('app.resident_id', ${ctx.residentId?.toString() ?? ""}, true)`;
    return fn(tx);
  });
}
