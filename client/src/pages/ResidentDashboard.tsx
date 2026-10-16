import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import {
  CLOSED_INCIDENT,
  OPEN_REQUEST,
  statusClass,
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
  me: Person[];
  requests: ServiceRequest[];
  incidents: Incident[];
  committees: Committee[];
  docs: DocType[];
}

// A resident's own page: their requests, certificates ready for them, and
// incidents they are part of. The database returns only their own rows.
export function ResidentDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [me, requests, incidents, committees, docs] = await Promise.all([
          api<Person[]>("/residents?limit=5"),
          api<ServiceRequest[]>("/service-requests?limit=200"),
          api<Incident[]>("/incidents?limit=200"),
          api<Committee[]>("/committees?limit=200"),
          api<DocType[]>("/document-types?limit=200"),
        ]);
        if (!cancelled) setData({ me, requests, incidents, committees, docs });
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading...</p>;

  const docNames = new Map(data.docs.map((d) => [d.doc_type_id, d.name]));
  const committeeNames = new Map(data.committees.map((c) => [c.committee_id, c.committee_name]));
  const ready = data.requests.filter((r) => r.status === "Released");
  const waiting = data.requests.filter((r) => OPEN_REQUEST.includes(r.status));
  const openIncidents = data.incidents.filter((i) => !CLOSED_INCIDENT.includes(i.status));
  const latest = [...data.requests].sort((a, b) => b.date_requested.localeCompare(a.date_requested)).slice(0, 6);
  const firstName = data.me[0]?.first_name;

  return (
    <section>
      <div className="hero hero-resident">
        <h2>{firstName ? `Hello, ${firstName}` : "Welcome"}</h2>
        <p>Request certificates and permits, and follow their progress here.</p>
      </div>

      <div className="quick">
        <Link to="/requests">New service request</Link>
        <Link to="/incidents" className="alt">
          File an incident
        </Link>
        <Link to="/account" className="alt">
          Change my password
        </Link>
      </div>

      <div className="stats">
        <StatCard label="My requests" value={data.requests.length} to="/requests" />
        <StatCard label="Ready for pick-up" value={ready.length} hint="released certificates" to="/requests" />
        <StatCard label="Being processed" value={waiting.length} to="/requests" />
        <StatCard label="My incidents" value={openIncidents.length} hint="still open" to="/incidents" />
      </div>

      <div className="panel">
        <h3>My latest requests</h3>
        {latest.length === 0 ? (
          <div className="empty">You have not requested anything yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Handled by</th>
                <th>Status</th>
                <th>Reference number</th>
                <th>Requested</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((r) => (
                <tr key={r.request_id}>
                  <td>{docNames.get(r.doc_type_id) ?? `#${r.doc_type_id}`}</td>
                  <td>{committeeNames.get(r.committee_id) ?? `#${r.committee_id}`}</td>
                  <td>
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </td>
                  <td className="mono">{r.reference_number ?? "-"}</td>
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
