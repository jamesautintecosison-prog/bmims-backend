import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ShieldAlert, Users, Wallet } from "lucide-react";
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
  type Committee,
} from "../api/types";
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
  committees: Committee[];
}

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const actionLabel = (action: string) => {
  switch (action.toUpperCase()) {
    case "INSERT": return "Create";
    case "UPDATE": return "Update";
    case "DELETE": return "Delete";
    default: return action;
  }
};

// Whole-barangay overview for the Punong Barangay or Secretary.
export function AdminDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [residents, requests, incidents, budgets, users, audit, docs, committees] = await Promise.all([
        api<Person[]>("/residents?limit=200"),
        api<ServiceRequest[]>("/service-requests?limit=200"),
        api<Incident[]>("/incidents?limit=200"),
        api<Budget[]>("/budgets?limit=200"),
        api<UserAccount[]>("/users"),
        api<AuditEntry[]>("/audit-logs?limit=6"),
        api<DocType[]>("/document-types?limit=200"),
        api<Committee[]>("/committees?limit=200"),
      ]);
      setData({ residents, requests, incidents, budgets, users, audit, docs, committees });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, retryKey]);

  const names = useMemo(
    () => new Map((data?.residents ?? []).map((resident) => [resident.resident_id, `${resident.first_name} ${resident.last_name}`])),
    [data?.residents],
  );
  const docNames = useMemo(() => new Map((data?.docs ?? []).map((doc) => [doc.doc_type_id, doc.name])), [data?.docs]);
  const userNames = useMemo(() => new Map((data?.users ?? []).map((user) => [user.user_id, user.username])), [data?.users]);
  const committeeNames = useMemo(
    () => new Map((data?.committees ?? []).map((committee) => [committee.committee_id, committee.committee_name])),
    [data?.committees],
  );

  const openRequests = data?.requests.filter((request) => OPEN_REQUEST.includes(request.status)) ?? [];
  const openIncidents = data?.incidents.filter((incident) => !CLOSED_INCIDENT.includes(incident.status)) ?? [];
  const remaining = data?.budgets.reduce((sum, budget) => sum + Number(budget.remaining_amount), 0) ?? 0;
  const oldestOpen = [...openRequests]
    .sort((first, second) => first.date_requested.localeCompare(second.date_requested))
    .slice(0, 5);
  const activeResidents = data?.residents.filter((resident) => resident.resident_status === "Active").length ?? 0;

  return (
    <section className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div>
          <span className="admin-dashboard-kicker">Barangay Mahayag · Administration</span>
          <h1>Barangay Overview</h1>
          <p>Everything across all committees, for the Punong Barangay and Secretary.</p>
        </div>
      </header>

      {error && (
        <div className="error admin-dashboard-error" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
        </div>
      )}

      <div className="admin-dashboard-stats" aria-busy={loading} aria-label="Barangay summary">
        <Link className="admin-dashboard-stat residents-stat" to="/residents">
          <span className="admin-stat-icon"><Users size={20} aria-hidden="true" /></span>
          <span className="admin-stat-copy">
            <span className="admin-stat-label">Total Residents</span>
            <strong>{loading || !data ? "—" : data.residents.length}</strong>
            <small>{loading || !data ? "Loading resident count…" : `${activeResidents} active residents`}</small>
          </span>
        </Link>
        <Link className="admin-dashboard-stat requests-stat" to="/requests">
          <span className="admin-stat-icon"><FileText size={20} aria-hidden="true" /></span>
          <span className="admin-stat-copy">
            <span className="admin-stat-label">Open Service Requests</span>
            <strong>{loading || !data ? "—" : openRequests.length}</strong>
            <small>{loading || !data ? "Loading request count…" : "Waiting to be processed"}</small>
          </span>
        </Link>
        <Link className="admin-dashboard-stat incidents-stat" to="/incidents">
          <span className="admin-stat-icon"><ShieldAlert size={20} aria-hidden="true" /></span>
          <span className="admin-stat-copy">
            <span className="admin-stat-label">Open Incidents</span>
            <strong>{loading || !data ? "—" : openIncidents.length}</strong>
            <small>{loading || !data ? "Loading incident count…" : "Not yet settled or closed"}</small>
          </span>
        </Link>
        <Link className="admin-dashboard-stat budget-stat" to="/budgets">
          <span className="admin-stat-icon"><Wallet size={20} aria-hidden="true" /></span>
          <span className="admin-stat-copy">
            <span className="admin-stat-label">Budget Remaining</span>
            <strong className="admin-budget-value">{loading || !data ? "—" : peso(remaining)}</strong>
            <small>{loading || !data ? "Loading budget…" : "Across all committees"}</small>
          </span>
        </Link>
      </div>

      <nav className="admin-dashboard-actions" aria-label="Quick actions">
        <Link to="/requests">Process Requests</Link>
        <Link to="/staff" className="admin-action-secondary">Manage Staff</Link>
        <Link to="/audit" className="admin-action-secondary">View Audit Log</Link>
      </nav>

      <div className="admin-dashboard-content">
        <section className="admin-dashboard-panel" aria-labelledby="oldest-requests-heading">
          <header>
            <div><h2 id="oldest-requests-heading">Oldest Open Requests</h2><p>Requests waiting the longest</p></div>
            <Link to="/requests" aria-label="View all service requests">View all</Link>
          </header>
          {loading && !data ? (
            <p className="admin-panel-state" role="status" aria-live="polite">Loading service requests…</p>
          ) : error && !data ? (
            <p className="admin-panel-state">Request list is unavailable. Try loading the dashboard again.</p>
          ) : oldestOpen.length === 0 ? (
            <p className="admin-panel-state">No open service requests.</p>
          ) : (
            <div className="admin-dashboard-table-region" role="region" aria-label="Oldest open service requests" tabIndex={0}>
              <table className="admin-dashboard-table">
                <thead><tr>
                  <th scope="col">Request</th><th scope="col">Resident</th><th scope="col">Service type</th>
                  <th scope="col">Committee</th><th scope="col">Status</th><th scope="col">Submitted</th>
                </tr></thead>
                <tbody>{oldestOpen.map((request) => (
                  <tr key={request.request_id}>
                    <td data-label="Request"><Link className="admin-request-link" to="/requests">#{request.request_id}</Link></td>
                    <td data-label="Resident">{names.get(request.resident_id) ?? `#${request.resident_id}`}</td>
                    <td data-label="Service type">{docNames.get(request.doc_type_id) ?? `#${request.doc_type_id}`}</td>
                    <td data-label="Committee">{committeeNames.get(request.committee_id) ?? `#${request.committee_id}`}</td>
                    <td data-label="Status"><span className={statusClass(request.status)}>{request.status}</span></td>
                    <td data-label="Submitted">{new Date(request.date_requested).toLocaleDateString()}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-dashboard-panel" aria-labelledby="recent-changes-heading">
          <header>
            <div><h2 id="recent-changes-heading">Recent Changes</h2><p>Latest database-recorded activity</p></div>
            <Link to="/audit" aria-label="View full audit log">View all</Link>
          </header>
          {loading && !data ? (
            <p className="admin-panel-state" role="status" aria-live="polite">Loading recent activity…</p>
          ) : error && !data ? (
            <p className="admin-panel-state">Recent activity is unavailable. Try loading the dashboard again.</p>
          ) : !data?.audit.length ? (
            <p className="admin-panel-state">No changes recorded yet.</p>
          ) : (
            <div className="admin-dashboard-table-region" role="region" aria-label="Recent audit activity" tabIndex={0}>
              <table className="admin-dashboard-table admin-audit-table">
                <thead><tr>
                  <th scope="col">Date and time</th><th scope="col">User</th><th scope="col">Action</th>
                  <th scope="col">Affected table</th><th scope="col">Record ID</th>
                </tr></thead>
                <tbody>{data.audit.map((entry) => (
                  <tr key={entry.audit_id}>
                    <td data-label="Date and time">{formatTimestamp(entry.logged_at)}</td>
                    <td data-label="User">
                      {entry.changed_by_user_id !== null
                        ? userNames.get(entry.changed_by_user_id) ?? `User #${entry.changed_by_user_id}`
                        : "Direct database edit"}
                    </td>
                    <td data-label="Action">
                      <span className={`admin-audit-action admin-audit-${entry.action_type.toLowerCase()}`}>
                        {actionLabel(entry.action_type)}
                      </span>
                    </td>
                    <td data-label="Affected table">{entry.table_name}</td>
                    <td data-label="Record ID">#{entry.record_id}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
