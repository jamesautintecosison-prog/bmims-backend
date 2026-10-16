import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import {
  CLOSED_INCIDENT,
  OPEN_REQUEST,
  peso,
  statusClass,
  type Assignment,
  type Budget,
  type Committee,
  type DocType,
  type Incident,
  type Person,
  type ServiceRequest,
} from "../api/types";
import { StatCard } from "../components/StatCard";
import "./serviceRequests.css";
import "./dashboard.css";

interface Data {
  requests: ServiceRequest[];
  incidents: Incident[];
  budgets: Budget[];
  assignments: Assignment[];
  committees: Committee[];
  residents: Person[];
  docs: DocType[];
}

// Work queue for a kagawad. The database only returns this person's
// committees, so every number here already covers just their own work.
export function StaffDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [requests, incidents, budgets, assignments, committees, residents, docs] = await Promise.all([
          api<ServiceRequest[]>("/service-requests?limit=200"),
          api<Incident[]>("/incidents?limit=200"),
          api<Budget[]>("/budgets?limit=200"),
          api<Assignment[]>("/staff-assignments?limit=200"),
          api<Committee[]>("/committees?limit=200"),
          api<Person[]>("/residents?limit=200"),
          api<DocType[]>("/document-types?limit=200"),
        ]);
        if (!cancelled) setData({ requests, incidents, budgets, assignments, committees, residents, docs });
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

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;

  const committeeName = new Map(data.committees.map((c) => [c.committee_id, c.committee_name]));
  const mine = data.assignments.filter((a) => a.staff_id === user?.staff_id);
  const openRequests = data.requests.filter((r) => OPEN_REQUEST.includes(r.status));
  const openIncidents = data.incidents.filter((i) => !CLOSED_INCIDENT.includes(i.status));
  const remaining = data.budgets.reduce((sum, b) => sum + Number(b.remaining_amount), 0);
  const queue = [...openRequests]
    .sort((a, b) => a.date_requested.localeCompare(b.date_requested))
    .slice(0, 6);

  return (
    <section>
      <div className="hero hero-staff">
        <h2>My committee work</h2>
        <p>
          {mine.length > 0
            ? mine.map((a) => `${committeeName.get(a.committee_id) ?? `#${a.committee_id}`} (${a.role})`).join(", ")
            : "You are not assigned to a committee yet. Ask the Punong Barangay."}
        </p>
      </div>

      <div className="stats">
        <StatCard label="Requests to handle" value={openRequests.length} hint="oldest first below" to="/requests" />
        <StatCard label="Open incidents" value={openIncidents.length} to="/incidents" />
        <StatCard label="Committee budget left" value={peso(remaining)} to="/budgets" />
        <StatCard label="Residents" value={data.residents.length} to="/residents" />
      </div>

      <div className="quick">
        <Link to="/requests">Open the request queue</Link>
        <Link to="/incidents" className="alt">
          Incidents
        </Link>
        <Link to="/budgets" className="alt">
          Log an expense
        </Link>
      </div>

      <div className="panel">
        <h3>Oldest requests waiting for you</h3>
        {queue.length === 0 ? (
          <div className="empty">Nothing waiting. Nice work.</div>
        ) : (
          <table>
            <tbody>
              {queue.map((r) => (
                <tr key={r.request_id}>
                  <td>#{r.request_id}</td>
                  <td>{names.get(r.resident_id) ?? `#${r.resident_id}`}</td>
                  <td>{docNames.get(r.doc_type_id) ?? `#${r.doc_type_id}`}</td>
                  <td>{committeeName.get(r.committee_id) ?? `#${r.committee_id}`}</td>
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
    </section>
  );
}
