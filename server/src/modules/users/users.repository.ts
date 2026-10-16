import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

// Never returns password hashes
const SAFE_FIELDS = {
  user_id: true,
  username: true,
  role: true,
  staff_id: true,
  resident_id: true,
  created_at: true,
} as const;

export interface ResidentLoginRow {
  resident_id: number;
  username: string;
  password_hash: string;
  role: "resident";
}

export const usersRepository = {
  list(ctx: RequestContext) {
    return withRequestContext(ctx, (tx) =>
      tx.users.findMany({ select: SAFE_FIELDS, orderBy: { user_id: "asc" }, take: 1000 }),
    );
  },

  createStaffLogin(
    ctx: RequestContext,
    input: { staff_id: number; username: string; role: "admin" | "staff"; hash: string },
  ) {
    return withRequestContext(ctx, (tx) =>
      tx.users.create({
        data: {
          staff_id: input.staff_id,
          username: input.username,
          role: input.role,
          password_hash: input.hash,
        },
        select: SAFE_FIELDS,
      }),
    );
  },

  resetPassword(ctx: RequestContext, userId: number, hash: string) {
    return withRequestContext(ctx, (tx) =>
      tx.users.update({
        where: { user_id: userId },
        data: { password_hash: hash },
        select: { user_id: true, username: true },
      }),
    );
  },

  // Active residents that have no login yet, plus every username already taken
  findResidentsWithoutAccount(ctx: RequestContext, residentIds?: number[]) {
    return withRequestContext(ctx, async (tx) => {
      const residents = await tx.residents.findMany({
        where: {
          resident_status: "Active",
          ...(residentIds && residentIds.length > 0 ? { resident_id: { in: residentIds } } : {}),
        },
        select: { resident_id: true, first_name: true, last_name: true },
        orderBy: { resident_id: "asc" },
      });
      const accounts = await tx.users.findMany({ select: { username: true, resident_id: true } });

      const hasAccount = new Set(
        accounts.filter((a) => a.resident_id !== null).map((a) => a.resident_id as number),
      );
      return {
        residents: residents.filter((r) => !hasAccount.has(r.resident_id)),
        usernames: accounts.map((a) => a.username),
      };
    });
  },

  // One statement: either every login is created or none is
  createResidentLogins(ctx: RequestContext, rows: ResidentLoginRow[]) {
    return withRequestContext(ctx, (tx) => tx.users.createMany({ data: rows }));
  },
};
