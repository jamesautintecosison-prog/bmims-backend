import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./serviceRequests.css";
import "./incidents.css";

type PartRole = "complainant" | "respondent" | "witness";
const PART_ROLES: PartRole[] = ["complainant", "respondent", "witness"];
const STATUSES = ["Open", "Under Investigation", "Settled", "Escalated", "Closed"];

interface Incident {
  incident_id: number;
  committee_id: number;
  handled_by_staff_id: number | null;
  date_filed: string;
  location: string;
  description: string;
  status: string;
}
interface Participant {
  participant_id: number;
  resident_id: number;
  participant_role: string;
  statement: string | null;
}
interface IncidentDetail extends Incident {
  participants: Participant[];
}
interface Committee {
  committee_id: number;
  committee_name: string;
}
interface Resident {
  resident_id: number;
  first_name: string;
  last_name: string;
}
interface Row {
  residentId: string;
  role: PartRole;
  statement: string;
}

const EMPTY_ROW: Row = { residentId: "", role: "complainant", statement: "" };

// A lookup list the caller may not be allowed to read must not break the page
function safe<T>(promise: Promise<T[]>): Promise<T[]> {
  return promise.catch(() => []);
}

const statusClass = (s: string) => `status status-${s.toLowerCase().replace(/\s+/g, "-")}`;

export function IncidentsPage() {
  const { user } = useAuth();
  const isResident = user?.role === "resident";
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // new-incident form
  const [committeeId, setCommitteeId] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [ownStatement, setOwnStatement] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...EMPTY_ROW }]);

  // selected incident
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [newPart, setNewPart] = useState<Row>({ ...EMPTY_ROW, role: "respondent" });

  const load = useCallback(async () => {
    try {
      const [list, comms, res] = await Promise.all([
        api<Incident[]>("/incidents"),
        safe(api<Committee[]>("/committees")),
        safe(api<Resident[]>("/residents")),
      ]);
      setIncidents(list);
      setCommittees(comms);
      setResidents(res);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: number) => {
    try {
      setDetail(await api<IncidentDetail>(`/incidents/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedId === null) return;
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const committeeName = useMemo(
    () => new Map(committees.map((c) => [c.committee_id, c.committee_name])),
    [committees],
  );
  const residentName = useMemo(
    () => new Map(residents.map((r) => [r.resident_id, `${r.first_name} ${r.last_name}`])),
    [residents],
  );
  const who = (id: number) => residentName.get(id) ?? `#${id}`;

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function file(event: FormEvent) {
    event.preventDefault();
    try {
      const participants = isResident
        ? [
            {
              resident_id: user?.resident_id,
              participant_role: "complainant",
              statement: ownStatement.trim() || null,
            },
          ]
        : rows.map((r) => ({
            resident_id: Number(r.residentId),
            participant_role: r.role,
            statement: r.statement.trim() || null,
          }));

      // The whole incident (and every participant) is saved atomically by
      // sp_file_incident_report: either all of it is stored or none of it.
      const created = await api<{ incident_id: number }>("/incidents", {
        method: "POST",
        body: {
          committee_id: Number(committeeId),
          location,
          description,
          participants,
        },
      });
      setCommitteeId("");
      setLocation("");
      setDescription("");
      setOwnStatement("");
      setRows([{ ...EMPTY_ROW }]);
      await load();
      setSelectedId(created.incident_id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function changeStatus(status: string) {
    if (!detail) return;
    try {
      await api(`/incidents/${detail.incident_id}/status`, { method: "PATCH", body: { status } });
      await Promise.all([load(), loadDetail(detail.incident_id)]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addParticipant(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    try {
      await api(`/incidents/${detail.incident_id}/participants`, {
        method: "POST",
        body: {
          resident_id: Number(newPart.residentId),
          participant_role: newPart.role,
          statement: newPart.statement.trim() || null,
        },
      });
      setNewPart({ ...EMPTY_ROW, role: "respondent" });
      setError(null);
      await loadDetail(detail.incident_id);
    } catch (e) {
      // e.g. "Staff 3 is not assigned to the committee of incident 2" (HTTP 422)
      setError(errorMessage(e));
    }
  }

  const residentSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">Resident...</option>
      {residents.map((r) => (
        <option key={r.resident_id} value={r.resident_id}>
          {r.first_name} {r.last_name}
        </option>
      ))}
    </select>
  );

  return (
    <section>
      <h2>Incidents</h2>
      {error && <p className="error">{error}</p>}

      <form className="card stack" onSubmit={file}>
        <strong>File a new incident</strong>
        <div className="row">
          <select value={committeeId} onChange={(e) => setCommitteeId(e.target.value)} required>
            <option value="">Committee...</option>
            {committees.map((c) => (
              <option key={c.committee_id} value={c.committee_id}>
                {c.committee_name}
              </option>
            ))}
          </select>
          <input
            className="grow"
            placeholder="Location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />
        </div>
        <textarea
          placeholder="What happened?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />

        {isResident ? (
          <input
            placeholder="Your statement (optional). You are filed as the complainant."
            value={ownStatement}
            onChange={(e) => setOwnStatement(e.target.value)}
          />
        ) : (
          <>
            {rows.map((row, i) => (
              <div className="row" key={i}>
                {residentSelect(row.residentId, (v) => updateRow(i, { residentId: v }))}
                <select
                  value={row.role}
                  onChange={(e) => updateRow(i, { role: e.target.value as PartRole })}
                >
                  {PART_ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <input
                  className="grow"
                  placeholder="Statement (optional)"
                  value={row.statement}
                  onChange={(e) => updateRow(i, { statement: e.target.value })}
                />
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div>
              <button
                type="button"
                className="secondary"
                onClick={() => setRows([...rows, { ...EMPTY_ROW, role: "respondent" }])}
              >
                + Add person
              </button>
            </div>
          </>
        )}
        <div>
          <button type="submit">File incident</button>
        </div>
      </form>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Committee</th>
                <th>Location</th>
                <th>Description</th>
                <th>Status</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr
                  key={i.incident_id}
                  className={`clickable${i.incident_id === selectedId ? " selected" : ""}`}
                  onClick={() => setSelectedId(i.incident_id)}
                >
                  <td>{i.incident_id}</td>
                  <td>{committeeName.get(i.committee_id) ?? `#${i.committee_id}`}</td>
                  <td>{i.location}</td>
                  <td className="clip">{i.description}</td>
                  <td>
                    <span className={statusClass(i.status)}>{i.status}</span>
                  </td>
                  <td>{new Date(i.date_filed).toLocaleDateString()}</td>
                </tr>
              ))}
              {incidents.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No incidents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && selectedId === detail.incident_id && (
        <div className="card detail">
          <h3>Incident #{detail.incident_id}</h3>
          <dl>
            <dt>Committee</dt>
            <dd>{committeeName.get(detail.committee_id) ?? `#${detail.committee_id}`}</dd>
            <dt>Location</dt>
            <dd>{detail.location}</dd>
            <dt>Description</dt>
            <dd>{detail.description}</dd>
            <dt>Status</dt>
            <dd>
              {isResident ? (
                <span className={statusClass(detail.status)}>{detail.status}</span>
              ) : (
                <select value={detail.status} onChange={(e) => void changeStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              )}
            </dd>
          </dl>

          <strong>People involved{isResident ? " (you)" : ""}</strong>
          <div className="card table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Role</th>
                  <th>Statement</th>
                </tr>
              </thead>
              <tbody>
                {detail.participants.map((p) => (
                  <tr key={p.participant_id}>
                    <td>{who(p.resident_id)}</td>
                    <td>{p.participant_role}</td>
                    <td>{p.statement ?? "-"}</td>
                  </tr>
                ))}
                {detail.participants.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No participants visible to you.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isResident && (
            <form className="row" onSubmit={addParticipant}>
              {residentSelect(newPart.residentId, (v) => setNewPart({ ...newPart, residentId: v }))}
              <select
                value={newPart.role}
                onChange={(e) => setNewPart({ ...newPart, role: e.target.value as PartRole })}
              >
                {PART_ROLES.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input
                className="grow"
                placeholder="Statement (optional)"
                value={newPart.statement}
                onChange={(e) => setNewPart({ ...newPart, statement: e.target.value })}
              />
              <button type="submit">Add person</button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
