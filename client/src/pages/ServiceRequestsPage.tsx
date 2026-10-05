import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./serviceRequests.css";

interface ServiceRequest {
  request_id: number;
  resident_id: number;
  doc_type_id: number;
  committee_id: number;
  status: string;
  reference_number: string | null;
  date_requested: string;
}
interface DocType {
  doc_type_id: number;
  name: string;
  fee_amount: string | number;
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

// A lookup list the caller may not be allowed to read must not break the page
function safe<T>(promise: Promise<T[]>): Promise<T[]> {
  return promise.catch(() => []);
}

const OPEN = ["Pending", "Processing", "Approved"];

export function ServiceRequestsPage() {
  const { user } = useAuth();
  const isResident = user?.role === "resident";
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState({ docTypeId: "", committeeId: "", residentId: "" });

  const load = useCallback(async () => {
    try {
      const [reqs, docs, comms, res] = await Promise.all([
        api<ServiceRequest[]>("/service-requests"),
        safe(api<DocType[]>("/document-types")),
        safe(api<Committee[]>("/committees")),
        safe(api<Resident[]>("/residents")),
      ]);
      setRequests(reqs);
      setDocTypes(docs);
      setCommittees(comms);
      setResidents(res);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const docName = useMemo(
    () => new Map(docTypes.map((d) => [d.doc_type_id, d.name])),
    [docTypes],
  );
  const committeeName = useMemo(
    () => new Map(committees.map((c) => [c.committee_id, c.committee_name])),
    [committees],
  );
  const residentName = useMemo(
    () => new Map(residents.map((r) => [r.resident_id, `${r.first_name} ${r.last_name}`])),
    [residents],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/service-requests", {
        method: "POST",
        body: {
          doc_type_id: Number(form.docTypeId),
          committee_id: Number(form.committeeId),
          // residents always file for themselves; the server uses their token
          resident_id: isResident ? undefined : Number(form.residentId),
        },
      });
      setForm({ docTypeId: "", committeeId: "", residentId: "" });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function run(id: number, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (e) {
      // e.g. "Request 3 cannot be issued: its status is Released" (HTTP 422)
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  const setStatus = (id: number, status: string) =>
    run(id, () => api(`/service-requests/${id}/status`, { method: "PATCH", body: { status } }));

  // The whole issuing workflow runs inside the database (sp_issue_certificate)
  const issue = (id: number) =>
    run(id, () => api(`/service-requests/${id}/issue`, { method: "POST" }));

  return (
    <section>
      <h2>Service requests</h2>
      {error && <p className="error">{error}</p>}

      <form className="card inline" onSubmit={submit}>
        {!isResident && (
          <select
            value={form.residentId}
            onChange={(e) => setForm({ ...form, residentId: e.target.value })}
            required
          >
            <option value="">Resident...</option>
            {residents.map((r) => (
              <option key={r.resident_id} value={r.resident_id}>
                {r.first_name} {r.last_name}
              </option>
            ))}
          </select>
        )}
        <select
          value={form.docTypeId}
          onChange={(e) => setForm({ ...form, docTypeId: e.target.value })}
          required
        >
          <option value="">Document...</option>
          {docTypes.map((d) => (
            <option key={d.doc_type_id} value={d.doc_type_id}>
              {d.name} (fee {d.fee_amount})
            </option>
          ))}
        </select>
        <select
          value={form.committeeId}
          onChange={(e) => setForm({ ...form, committeeId: e.target.value })}
          required
        >
          <option value="">Committee...</option>
          {committees.map((c) => (
            <option key={c.committee_id} value={c.committee_id}>
              {c.committee_name}
            </option>
          ))}
        </select>
        <button type="submit">{isResident ? "Submit request" : "Create request"}</button>
      </form>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Resident</th>
                <th>Document</th>
                <th>Committee</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Requested</th>
                {!isResident && <th />}
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const open = OPEN.includes(r.status);
                return (
                  <tr key={r.request_id}>
                    <td>{r.request_id}</td>
                    <td>{residentName.get(r.resident_id) ?? `#${r.resident_id}`}</td>
                    <td>{docName.get(r.doc_type_id) ?? `#${r.doc_type_id}`}</td>
                    <td>{committeeName.get(r.committee_id) ?? `#${r.committee_id}`}</td>
                    <td>
                      <span className={`status status-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td className="mono">{r.reference_number ?? "-"}</td>
                    <td>{new Date(r.date_requested).toLocaleDateString()}</td>
                    {!isResident && (
                      <td>
                        <div className="actions">
                          {r.status === "Pending" && (
                            <button
                              className="secondary"
                              disabled={busyId === r.request_id}
                              onClick={() => void setStatus(r.request_id, "Processing")}
                            >
                              Process
                            </button>
                          )}
                          {(r.status === "Pending" || r.status === "Processing") && (
                            <button
                              className="secondary"
                              disabled={busyId === r.request_id}
                              onClick={() => void setStatus(r.request_id, "Approved")}
                            >
                              Approve
                            </button>
                          )}
                          {open && (
                            <button
                              disabled={busyId === r.request_id}
                              onClick={() => void issue(r.request_id)}
                            >
                              Issue
                            </button>
                          )}
                          {open && (
                            <button
                              className="warn"
                              disabled={busyId === r.request_id}
                              onClick={() => void setStatus(r.request_id, "Rejected")}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
                    No requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
