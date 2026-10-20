import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export interface AuditFilter {
  table_name?: string;
  record_id?: number;
  search?: string;
  action_type?: "INSERT" | "UPDATE" | "DELETE";
  date_from?: string;
  date_to?: string;
  limit: number;
  offset: number;
}

export interface AuditSummaryRange {
  day_start: string;
  day_end: string;
}

// Read-only. Rows are written by database triggers; only admin_role can SELECT.
export const auditLogsRepository = {
  summary(ctx: RequestContext, range: AuditSummaryRange) {
    return withRequestContext(ctx, async (tx) => {
      const [totalRecords, todayActivity, tables] = await Promise.all([
        tx.audit_logs.count(),
        tx.audit_logs.count({
          where: {
            logged_at: {
              gte: new Date(range.day_start),
              lt: new Date(range.day_end),
            },
          },
        }),
        tx.audit_logs.groupBy({ by: ["table_name"] }),
      ]);
      return {
        totalRecords,
        todayActivity,
        tablesTracked: tables.length,
      };
    });
  },
  list(ctx: RequestContext, f: AuditFilter) {
    const nextDay = f.date_to ? new Date(`${f.date_to}T00:00:00.000Z`) : undefined;
    if (nextDay) nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return withRequestContext(ctx, (tx) =>
      tx.audit_logs.findMany({
        where: {
          ...(f.table_name ? { table_name: f.table_name } : {}),
          ...(f.record_id ? { record_id: f.record_id } : {}),
          ...(f.action_type ? { action_type: f.action_type } : {}),
          ...(f.date_from || nextDay
            ? {
                logged_at: {
                  ...(f.date_from ? { gte: new Date(`${f.date_from}T00:00:00.000Z`) } : {}),
                  ...(nextDay ? { lt: nextDay } : {}),
                },
              }
            : {}),
          ...(f.search
            ? {
                OR: [
                  ...(Number.isInteger(Number(f.search)) && Number(f.search) > 0
                    ? [{ record_id: Number(f.search) }, { changed_by_user_id: Number(f.search) }]
                    : []),
                  { users: { username: { contains: f.search, mode: "insensitive" as const } } },
                ],
              }
            : {}),
        },
        orderBy: { audit_id: "desc" },
        take: f.limit,
        skip: f.offset,
      }),
    );
  },
};
