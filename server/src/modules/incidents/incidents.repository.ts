import { withRequestContext, type RequestContext } from "../../db/withRequestContext.js";

export interface ParticipantInput {
  resident_id: number;
  participant_role: "complainant" | "respondent" | "witness";
  statement?: string | null;
}

export const incidentsRepository = {
  list(ctx: RequestContext, limit: number, offset: number) {
    return withRequestContext(ctx, (tx) =>
      tx.incident_reports.findMany({ orderBy: { incident_id: "desc" }, take: limit, skip: offset }),
    );
  },

  // Incident plus the participants this caller is allowed to see
  getById(ctx: RequestContext, id: number) {
    return withRequestContext(ctx, async (tx) => {
      const incident = await tx.incident_reports.findUnique({ where: { incident_id: id } });
      if (!incident) return null;
      const participants = await tx.incident_participants.findMany({
        where: { incident_id: id },
        orderBy: { participant_id: "asc" },
      });
      return { ...incident, participants };
    });
  },

  // Incident + all participants are created atomically by the database (migration 008)
  file(
    ctx: RequestContext,
    input: { committee_id: number; location: string; description: string; participants: ParticipantInput[] },
  ) {
    return withRequestContext(ctx, async (tx) => {
      const rows = await tx.$queryRaw<{ incident_id: number }[]>`
        SELECT sp_file_incident_report(
          ${input.committee_id}::int,
          ${input.location},
          ${input.description},
          ${JSON.stringify(input.participants)}::jsonb
        ) AS incident_id`;
      return rows[0].incident_id;
    });
  },

  updateStatus(ctx: RequestContext, id: number, status: string) {
    return withRequestContext(ctx, (tx) =>
      tx.incident_reports.update({ where: { incident_id: id }, data: { status } }),
    );
  },
};
