import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export const accountRepository = {
  // The database updates ONLY the caller's own account (migration 012)
  setOwnPassword(ctx: RequestContext, newHash: string) {
    return withRequestContext(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ ok: boolean }[]>`
        SELECT sp_change_own_password(${newHash}) AS ok`;
      return rows[0].ok;
    });
  },
};
