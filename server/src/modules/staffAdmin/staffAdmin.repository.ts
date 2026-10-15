import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export const staffAdminRepository = {
  // Returns 'deleted' or 'access_removed' (record kept because history refers to it)
  remove(ctx: RequestContext, staffId: number) {
    return withRequestContext(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ result: string }[]>`
        SELECT sp_remove_staff(${staffId}::int) AS result`;
      return rows[0].result;
    });
  },
};
