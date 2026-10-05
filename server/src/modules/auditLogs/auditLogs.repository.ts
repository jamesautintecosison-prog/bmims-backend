import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export interface AuditFilter {
  table_name?: string;
  record_id?: number;
  limit: number;
  offset: number;
}

// Read-only. Rows are written by database triggers; only admin_role can SELECT.
export const auditLogsRepository = {
  list(ctx: RequestContext, f: AuditFilter) {
    return withRequestContext(ctx, (tx) =>
      tx.audit_logs.findMany({
        where: {
          ...(f.table_name ? { table_name: f.table_name } : {}),
          ...(f.record_id ? { record_id: f.record_id } : {}),
        },
        orderBy: { audit_id: "desc" },
        take: f.limit,
        skip: f.offset,
      }),
    );
  },
};
