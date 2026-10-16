import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import {
  CLOSED_INCIDENT,
  OPEN_REQUEST,
  peso,
  statusClass,
  type AuditEntry,
  type Budget,
  type DocType,
  type Incident,
  type Person,
  type ServiceRequest,
  type UserAccount,
} from "../api/types";
import { StatCard } from "../components/StatCard";
import "./serviceRequests.css";
import "./dashboard.css";

interface Data {
  residents: Person[];
  requests: ServiceRequest[];
  incidents: Incident[];
  budgets: Budget[];
  users: UserAccount[];
  audit: AuditEntry[];
  docs: DocType[];
}

// Whole-barangay overview for the Punong Barangay or Secretary
export function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [residents, requests, incidents, budgets, users, audit, docs] = await Promise.all([
          api<Person[]>("/residents?limit=200"),
          api<ServiceRequest[]>("/service-requests?limit=200"),
          api<Incident[]>("/incidents?limit=200"),
          api<Budget[]>("/budgets?limit=200"),
          api<UserAccount[]>("/users"),
          api<AuditEntry[]>("/audit-logs?limit=6"),
          api<DocType[]>("/document-types?limit=200"),
        ]);
        if (!cancelled) setData({ residents, requests, incidents, budgets, users, audit, docs });
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(
    () => new Map((data?.residents ?? []).map((r) => [r.resident_id, `${r.first_name} ${r.last_name}`])),
    [data],
  );
  const docNames = useMemo(() => new Map((data?.docs ?? []).map((d) => [d.doc_type_id, d.name])), [data]);
  const userNames = useMemo(() => new Map((data?.users ?? []).map((u) => [u.user_id, u.username])), [data]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;

  const openRequests = data.requests.filter((r) => OPEN_REQUEST.includes(r.status));
  const openIncidents = data.incidents.filter((i) => !CLOSED_INCIDENT.includes(i.status));
  const remaining = data.budgets.reduce((sum, b) => sum + Number(b.remaining_amount), 0);
  const allocated = data.budgets.reduce((sum, b) => sum + Number(b.allocated_amount), 0);
  const withLogin = new Set(data.users.filter((u) => u.resident_id !== null).map((u) => u.resident_id));
  const activeResidents = data.residents.filter((r) => r.resident_status === "Active");
  const missingLogins = activeResidents.filter((r) => !withLogin.has(r.resident_id)).length;
  const oldestOpen = [...openRequests]
    .sort((a, b) => a.date_requested.localeCompare(b.date_requested))
    .slice(0, 5);

  return (
    <section>
      <div className="hero hero-admin">
        <h2>Barangay overview</h2>
        <p>Everything across all committees, for the Punong Barangay and Secretary.</p>
      </div>

      <div className="stats">
        <StatCard label="Residents" value={data.residents.length} hint={`${activeResidents.length} active`} to="/residents" />
        <StatCard label="Open requests" value={openRequests.length} hint="waiting to be issued" to="/requests" />
        <StatCard label="Open incidents" value={openIncidents.length} hint="not yet settled" to="/incidents" />
        <StatCard
          label="Budget left"
          value={peso(remaining)}
          hint={allocated > 0 ? `of ${peso(allocated)} allocated` : undefined}
          to="/budgets"
        />
        <StatCard
          label="Residents without a login"
          value={missingLogins}
          hint={missingLogins > 0 ? "create them on the Residents page" : "everyone has one"}
          to="/residents"
        />
      </div>

      <div className="quick">
        <Link to="/requests">Process requests</Link>
        <Link to="/staff" className="alt">
          Manage staff
        </Link>
        <Link to="/audit" className="alt">
          View audit log
        </Link>
      </div>

      <div className="two-col">
        <div className="panel">
          <h3>Oldest open requests</h3>
          {oldestOpen.length === 0 ? (
            <div className="empty">Nothing waiting.</div>
          ) : (
            <table>
              <tbody>
                {oldestOpen.map((r) => (
                  <tr key={r.request_id}>
                    <td>#{r.request_id}</td>
                    <td>{names.get(r.resident_id) ?? `#${r.resident_id}`}</td>
                    <td>{docNames.get(r.doc_type_id) ?? `#${r.doc_type_id}`}</td>
                    <td>
                      <span className={statusClass(r.status)}>{r.status}</span>
                    </td>
                    <td>{new Date(r.date_requested).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="panel">
          <h3>Recent changes (audit log)</h3>
          {data.audit.length === 0 ? (
            <div className="empty">No changes recorded yet.</div>
          ) : (
            <table>
              <tbody>
                {data.audit.map((a) => (
                  <tr key={a.audit_id}>
                    <td>{new Date(a.logged_at).toLocaleString()}</td>
                    <td>
                      {a.changed_by_user_id !== null
                        ? (userNames.get(a.changed_by_user_id) ?? `user #${a.changed_by_user_id}`)
                        : "database edit"}
                    </td>
                    <td>
                      {a.action_type} {a.table_name} #{a.record_id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
