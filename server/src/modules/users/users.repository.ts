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

export const usersRepository = {
  list(ctx: RequestContext) {
    return withRequestContext(ctx, (tx) =>
      tx.users.findMany({ select: SAFE_FIELDS, orderBy: { user_id: "asc" }, take: 500 }),
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
};
