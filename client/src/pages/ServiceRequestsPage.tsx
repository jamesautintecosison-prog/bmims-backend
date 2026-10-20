import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
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
  cancelled_at: string | null;
  service_request_payments: PaymentRecord[];
}
interface PaymentRecord {
  payment_record_id: number;
  payment_method: "online" | "face_to_face";
  amount: string | number;
  currency: string;
  payment_status: string;
  refund_status: string;
  checkout_session_id: string | null;
  payment_reference: string | null;
  refund_reference: string | null;
  refund_external_reference: string | null;
  service_request_payment_events: PaymentEvent[];
}
interface PaymentEvent {
  payment_event_id: string;
  event_type: string;
  payment_status: string;
  reference: string | null;
  notes: string | null;
  created_at: string;
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
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isResident = user?.role === "resident";
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [docTypes, setDocTypes] = useState<DocType[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requestToCancel, setRequestToCancel] = useState<ServiceRequest | null>(null);
  const [refundReferences, setRefundReferences] = useState<Record<number, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const [form, setForm] = useState({
    docTypeId: "",
    committeeId: "",
    residentId: "",
    paymentMethod: "face_to_face" as "online" | "face_to_face",
  });

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
  const openRequests = requests.filter((request) => ["Pending", "Processing", "Approved"].includes(request.status));
  const pendingPayments = requests.filter((request) =>
    request.service_request_payments?.some((payment) => payment.payment_status === "Pending Payment"),
  ).length;
  const completedRequests = requests.filter((request) => request.status === "Released").length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const request = await api<ServiceRequest>("/service-requests", {
        method: "POST",
        body: {
          doc_type_id: Number(form.docTypeId),
          committee_id: Number(form.committeeId),
          payment_method: form.paymentMethod,
          // residents always file for themselves; the server uses their token
          resident_id: isResident ? undefined : Number(form.residentId),
        },
      });
      setForm({ docTypeId: "", committeeId: "", residentId: "", paymentMethod: "face_to_face" });
      setSuccess("Service request submitted.");
      const payment = request.service_request_payments?.[0];
      if (
        isResident &&
        form.paymentMethod === "online" &&
        payment?.payment_status === "Pending Payment"
      ) {
        try {
          const checkout = await api<{ checkout_url: string }>(
            `/service-requests/${request.request_id}/payment-checkout`,
            { method: "POST" },
          );
          window.location.assign(checkout.checkout_url);
          return;
        } catch (checkoutError) {
          await load();
          setError(
            `Your request was submitted, but secure checkout could not start: ${errorMessage(checkoutError)}. You can retry payment from the request list.`,
          );
          return;
        }
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function run(id: number, action: () => Promise<unknown>) {
    setBusyId(id);
    try {
      await action();
      await load();
    } catch (e) {
      const message = errorMessage(e);
      await load();
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  const setStatus = (id: number, status: string) =>
    run(id, () => api(`/service-requests/${id}/status`, { method: "PATCH", body: { status } }));

  // The whole issuing workflow runs inside the database (sp_issue_certificate)
  const issue = (id: number) =>
    run(id, () => api(`/service-requests/${id}/issue`, { method: "POST" }));

  const payOnline = async (id: number) => {
    setBusyId(id);
    try {
      const result = await api<{ checkout_url: string }>(`/service-requests/${id}/payment-checkout`, {
        method: "POST",
      });
      window.location.assign(result.checkout_url);
    } catch (e) {
      const message = errorMessage(e);
      await load();
      setError(message);
      setBusyId(null);
    }
  };

  const confirmPayment = (id: number) =>
    run(id, () => api(`/service-requests/${id}/payment-confirm`, { method: "POST" }));

  const confirmRefund = (id: number) =>
    run(id, () =>
      api(`/service-requests/${id}/refund/confirm`, {
        method: "POST",
        body: { external_reference: refundReferences[id] || undefined },
      }).then(() =>
        setRefundReferences((references) => {
          const next = { ...references };
          delete next[id];
          return next;
        }),
      ),
    );

  const retryRefund = (id: number) =>
    run(id, () => api(`/service-requests/${id}/refund/retry`, { method: "POST" }));

  async function cancelRequest() {
    if (!requestToCancel) return;
    const requestId = requestToCancel.request_id;
    setBusyId(requestId);
    setError(null);
    try {
      await api(`/service-requests/${requestId}/cancel`, { method: "POST" });
      setRequestToCancel(null);
      setSuccess("Your service request was cancelled.");
      await load();
    } catch (e) {
      const message = errorMessage(e);
      await load();
      setError(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2>Service requests</h2>
      {searchParams.get("payment") === "returned" && (
        <p className="payment-notice" role="status">
          You returned from PayMongo checkout. We’ll show the payment as paid only after PayMongo confirms it securely.
        </p>
      )}
      {searchParams.get("payment") === "cancelled" && (
        <p className="payment-notice" role="status">
          Checkout was cancelled. Your request is still saved and payment remains pending; you can retry from the request list.
        </p>
      )}
      {error && <p className="error">{error}</p>}
      {success && <p className="payment-notice success-notice" role="status">{success}</p>}

      <div className="module-summary-grid" aria-label="Service request summary" aria-busy={loading}>
        <article className="module-summary-card"><span>Total requests</span><strong>{loading ? "—" : requests.length}</strong><small>All recorded requests</small></article>
        <article className="module-summary-card"><span>Open requests</span><strong>{loading ? "—" : openRequests.length}</strong><small>Awaiting processing or completion</small></article>
        <article className="module-summary-card"><span>Pending payments</span><strong>{loading ? "—" : pendingPayments}</strong><small>Payment not yet confirmed</small></article>
        <article className="module-summary-card"><span>Completed</span><strong>{loading ? "—" : completedRequests}</strong><small>Requests released</small></article>
      </div>

      <form ref={formRef} className="card inline request-form" onSubmit={submit}>
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
        <select
          value={form.paymentMethod}
          onChange={(e) =>
            setForm({
              ...form,
              paymentMethod: e.target.value === "online" ? "online" : "face_to_face",
            })
          }
          aria-label="Payment method"
          required
        >
          <option value="face_to_face">Pay at barangay office</option>
          <option value="online">Online payment (GCash, Maya, card)</option>
        </select>
        <button type="submit" disabled={submitting}>
          {submitting
            ? form.paymentMethod === "online" && isResident
              ? "Opening secure checkout..."
              : "Submitting..."
            : isResident
              ? form.paymentMethod === "online"
                ? "Submit and pay online"
                : "Submit request"
              : "Create request"}
        </button>
      </form>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : isResident ? (
        requests.length === 0 ? (
          <div className="card request-empty">
            <h3>No service requests yet</h3>
            <p className="muted">Submit a request for a barangay document to get started.</p>
            <button
              type="button"
              onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
            >
              Create a request
            </button>
          </div>
        ) : (
          <div className="request-card-list">
            {requests.map((request) => {
              const payment = request.service_request_payments?.[0];
              const canCancel = request.status === "Pending";
              return (
                <article className="card request-card" key={request.request_id}>
                  <div className="request-card-header">
                    <div>
                      <p className="request-eyebrow">Service request</p>
                      <h3>{docName.get(request.doc_type_id) ?? `Document #${request.doc_type_id}`}</h3>
                      <p className="muted request-committee">
                        {committeeName.get(request.committee_id) ?? `Committee #${request.committee_id}`}
                      </p>
                    </div>
                    <span className={`status status-${request.status.toLowerCase()}`}>
                      {request.status === "Released" ? "Completed" : request.status}
                    </span>
                  </div>
                  <div className="request-card-details">
                    <div>
                      <span className="detail-label">Reference</span>
                      <strong className="mono">{request.reference_number ?? `#${request.request_id}`}</strong>
                    </div>
                    <div>
                      <span className="detail-label">Submitted</span>
                      <strong>{new Date(request.date_requested).toLocaleDateString()}</strong>
                    </div>
                    {request.cancelled_at && (
                      <div>
                        <span className="detail-label">Cancelled</span>
                        <strong>{new Date(request.cancelled_at).toLocaleString()}</strong>
                      </div>
                    )}
                    <div>
                      <span className="detail-label">Payment method</span>
                      <strong>
                        {payment?.payment_method === "online" ? "Online (PayMongo)" : "Barangay office"}
                      </strong>
                    </div>
                    <div>
                      <span className="detail-label">Payment status</span>
                      {payment ? (
                        <span
                          className={`status status-${payment.payment_status
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          {payment.payment_status}
                        </span>
                      ) : (
                        <strong>-</strong>
                      )}
                      {payment && (
                        <small className="muted request-amount">
                          {Number(payment.amount).toLocaleString("en-PH", {
                            style: "currency",
                            currency: payment.currency,
                          })}
                          {payment.refund_status !== "Not Requested" &&
                            ` · Refund ${payment.refund_status}`}
                        </small>
                      )}
                    </div>
                  </div>
                  <div className="request-card-footer">
                    {payment?.payment_method === "online" &&
                      ["Pending Payment", "Payment Failed"].includes(payment.payment_status) &&
                      canCancel && (
                        <button
                          type="button"
                          disabled={busyId === request.request_id}
                          onClick={() => void payOnline(request.request_id)}
                        >
                          {payment.payment_status === "Payment Failed" ? "Retry payment" : "Pay online"}
                        </button>
                      )}
                    {canCancel ? (
                      <button
                        type="button"
                        className="cancel-request-button"
                        disabled={busyId === request.request_id}
                        onClick={() => setRequestToCancel(request)}
                      >
                        Cancel request
                      </button>
                    ) : ["Processing", "Approved"].includes(request.status) ? (
                      <span className="muted cancellation-help">
                        Processing has started. Contact the barangay office to cancel.
                      </span>
                    ) : null}
                  </div>
                  {payment && (
                    <details className="payment-history">
                      <summary>Payment and refund history</summary>
                      <div className="payment-references">
                        <div>Checkout: <span className="mono">{payment.checkout_session_id ?? "-"}</span></div>
                        <div>Payment: <span className="mono">{payment.payment_reference ?? "-"}</span></div>
                        <div>Refund: <span className="mono">{payment.refund_reference ?? payment.refund_external_reference ?? "-"}</span></div>
                      </div>
                      <ol>
                        {payment.service_request_payment_events.map((event) => (
                          <li key={event.payment_event_id}>
                            {new Date(event.created_at).toLocaleString()} — {event.event_type.replaceAll("_", " ")}
                            {" · "}{event.payment_status}
                            {event.reference && <span className="mono"> · {event.reference}</span>}
                            {event.notes && <div className="muted">{event.notes}</div>}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )
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
                <th>Payment method</th>
                <th>Payment status</th>
                <th>Reference</th>
                <th>Requested</th>
                <th>Actions / history</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const open = OPEN.includes(r.status);
                const payment = r.service_request_payments?.[0];
                return (
                  <tr key={r.request_id}>
                    <td>{r.request_id}</td>
                    <td>{residentName.get(r.resident_id) ?? `#${r.resident_id}`}</td>
                    <td>{docName.get(r.doc_type_id) ?? `#${r.doc_type_id}`}</td>
                    <td>{committeeName.get(r.committee_id) ?? `#${r.committee_id}`}</td>
                    <td>
                      <span className={`status status-${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>
                      {payment?.payment_method === "online"
                        ? "Online (PayMongo)"
                        : payment?.payment_method === "face_to_face"
                          ? "Barangay office"
                          : "-"}
                    </td>
                    <td>
                      {payment ? (
                        <div>
                          <span
                            className={`status status-${payment.payment_status
                              .toLowerCase()
                              .replace(/\s+/g, "-")}`}
                          >
                            {payment.payment_status}
                          </span>
                          <div className="muted payment-amount">
                            {Number(payment.amount).toLocaleString("en-PH", {
                              style: "currency",
                              currency: payment.currency,
                            })}
                          </div>
                          {payment.refund_status !== "Not Requested" && (
                            <small className="muted">Refund: {payment.refund_status}</small>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="mono">{r.reference_number ?? "-"}</td>
                    <td>{new Date(r.date_requested).toLocaleDateString()}</td>
                    <td>
                      <div className="actions">
                        {isResident && payment?.payment_method === "online" &&
                          ["Pending Payment", "Payment Failed"].includes(payment.payment_status) &&
                          r.status !== "Rejected" && (
                            <button
                              disabled={busyId === r.request_id}
                              onClick={() => void payOnline(r.request_id)}
                            >
                              {payment.payment_status === "Payment Failed" ? "Retry payment" : "Pay online"}
                            </button>
                          )}
                        {!isResident && payment?.payment_method === "face_to_face" &&
                          payment.payment_status === "Pending Payment" && (
                            <button
                              className="secondary"
                              disabled={busyId === r.request_id}
                              onClick={() => void confirmPayment(r.request_id)}
                            >
                              Confirm payment
                            </button>
                          )}
                        {!isResident && ["Rejected", "Cancelled"].includes(r.status) && payment?.payment_method === "face_to_face" &&
                          payment.payment_status === "Refund Pending" && (
                            <>
                              <input
                                className="refund-reference"
                                aria-label="Manual refund reference"
                                placeholder="Refund reference (optional)"
                                value={refundReferences[r.request_id] ?? ""}
                                onChange={(event) =>
                                  setRefundReferences({
                                    ...refundReferences,
                                    [r.request_id]: event.target.value,
                                  })
                                }
                                maxLength={100}
                              />
                              <button
                                className="warn"
                                disabled={busyId === r.request_id}
                                onClick={() => void confirmRefund(r.request_id)}
                              >
                                Confirm money returned
                              </button>
                            </>
                          )}
                        {!isResident && ["Rejected", "Cancelled"].includes(r.status) && payment?.payment_method === "online" &&
                          payment.refund_status === "Failed" && (
                            <button
                              className="secondary"
                              disabled={busyId === r.request_id}
                              onClick={() => void retryRefund(r.request_id)}
                            >
                              Retry online refund
                            </button>
                          )}
                        {!isResident && (
                          <>
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
                          </>
                        )}
                      </div>
                      {payment && (
                        <details className="payment-history">
                          <summary>Payment history</summary>
                          <div className="payment-references">
                            <div>Checkout: <span className="mono">{payment.checkout_session_id ?? "-"}</span></div>
                            <div>Payment: <span className="mono">{payment.payment_reference ?? "-"}</span></div>
                            <div>Refund: <span className="mono">{payment.refund_reference ?? payment.refund_external_reference ?? "-"}</span></div>
                          </div>
                          <ol>
                            {payment.service_request_payment_events.map((event) => (
                              <li key={event.payment_event_id}>
                                {new Date(event.created_at).toLocaleString()} — {event.event_type.replaceAll("_", " ")}
                                {" · "}{event.payment_status}
                                {event.reference && <span className="mono"> · {event.reference}</span>}
                                {event.notes && <div className="muted">{event.notes}</div>}
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">
                    No requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {requestToCancel && (
        <div
          className="request-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busyId !== requestToCancel.request_id) {
              setRequestToCancel(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && busyId !== requestToCancel.request_id) {
              setRequestToCancel(null);
            }
          }}
        >
          <section
            className="request-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-request-title"
            aria-describedby="cancel-request-description"
          >
            <h3 id="cancel-request-title">Cancel service request?</h3>
            <p id="cancel-request-description">
              Are you sure you want to cancel this service request? You can’t undo this action.
              {requestToCancel.service_request_payments?.[0]?.payment_status === "Paid" &&
                " If you have paid, the applicable refund process will begin."}
            </p>
            <div className="request-modal-actions">
              <button
                type="button"
                className="secondary"
                autoFocus
                disabled={busyId === requestToCancel.request_id}
                onClick={() => setRequestToCancel(null)}
              >
                Keep Request
              </button>
              <button
                type="button"
                className="cancel-request-button confirm-cancel-button"
                disabled={busyId === requestToCancel.request_id}
                onClick={() => void cancelRequest()}
              >
                {busyId === requestToCancel.request_id ? "Cancelling..." : "Yes, Cancel Request"}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
