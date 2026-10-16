import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import "./incidents.css";
import "./budgets.css";

type Json = Record<string, unknown> | null;

interface AuditRow {
  audit_id: string;
  changed_by_user_id: number | null;
  table_name: string;
  record_id: number;
  action_type: string;
  old_value: Json;
  new_value: Json;
  logged_at: string;
}
interface UserRow {
  user_id: number;
  username: string;
}

const PAGE = 100;
const TABLES = ["residents", "service_requests", "incident_reports"];

const show = (value: unknown) => (value === null || value === undefined ? "empty" : String(value));

// Lists only the fields that changed, or a short summary of a deleted row
function describe(row: AuditRow): string[] {
  if (row.action_type === "UPDATE" && row.old_value && row.new_value) {
    const before = row.old_value;
    const after = row.new_value;
    return Object.keys(after)
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => `${key}: ${show(before[key])} → ${show(after[key])}`);
  }
  if (row.action_type === "DELETE" && row.old_value) {
    return [
      "Row deleted",
      ...Object.entries(row.old_value)
        .slice(0, 4)
        .map(([key, value]) => `${key}: ${show(value)}`),
    ];
  }
  return [];
}

// Read-only trail written by database triggers: every update or delete of a
// resident, service request or incident, with the old and new values.
export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tableName, setTableName] = useState("");
  const [recordId, setRecordId] = useState("");
  const [applied, setApplied] = useState({ tableName: "", recordId: "" });
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (filter: { tableName: string; recordId: string }, offset: number) => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filter.tableName) params.set("table_name", filter.tableName);
    if (filter.recordId) params.set("record_id", filter.recordId);
    return api<AuditRow[]>(`/audit-logs?${params.toString()}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [first, accounts] = await Promise.all([fetchPage(applied, 0), api<UserRow[]>("/users")]);
        if (cancelled) return;
        setRows(first);
        setUsers(accounts);
        setHasMore(first.length === PAGE);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applied, fetchPage]);

  const userName = useMemo(() => new Map(users.map((u) => [u.user_id, u.username])), [users]);

  async function loadMore() {
    try {
      const next = await fetchPage(applied, rows.length);
      setRows([...rows, ...next]);
      setHasMore(next.length === PAGE);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setApplied({ tableName, recordId: recordId.trim() });
  };

  return (
    <section>
      <h2>Audit log</h2>
      {error && <p className="error">{error}</p>}

      <form className="card inline" onSubmit={apply}>
        <select value={tableName} onChange={(e) => setTableName(e.target.value)}>
          <option value="">All tables</option>
          {TABLES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          placeholder="Record id (optional)"
          value={recordId}
          onChange={(e) => setRecordId(e.target.value)}
        />
        <button type="submit">Filter</button>
        <span className="muted">Newest first. Written by database triggers, so it cannot be skipped or edited here.</span>
      </form>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Table</th>
                <th>Record</th>
                <th>Action</th>
                <th>What changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.audit_id}>
                  <td>{new Date(r.logged_at).toLocaleString()}</td>
                  <td>
                    {r.changed_by_user_id !== null
                      ? (userName.get(r.changed_by_user_id) ?? `user #${r.changed_by_user_id}`)
                      : <span className="muted">direct database edit</span>}
                  </td>
                  <td>{r.table_name}</td>
                  <td>#{r.record_id}</td>
                  <td>
                    <span className={`act act-${r.action_type.toLowerCase()}`}>{r.action_type}</span>
                  </td>
                  <td>
                    <ul className="changes">
                      {describe(r).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {hasMore && !loading && (
        <button type="button" className="secondary" onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </section>
  );
}
