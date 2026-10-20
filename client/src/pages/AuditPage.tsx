import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ClipboardList } from "lucide-react";
import { api, errorMessage } from "../api/client";
import "./audit.css";

type Json = Record<string, unknown> | null;
type ActionType = "INSERT" | "UPDATE" | "DELETE";

interface AuditRow {
  audit_id: string;
  changed_by_user_id: number | null;
  table_name: string;
  record_id: number;
  action_type: ActionType;
  old_value: Json;
  new_value: Json;
  logged_at: string;
}
interface UserRow {
  user_id: number;
  username: string;
}
interface AuditSummary {
  totalRecords: number;
  todayActivity: number;
  tablesTracked: number;
}
interface AuditFilters {
  search: string;
  tableName: string;
  actionType: string;
  dateFrom: string;
  dateTo: string;
}

const PAGE = 100;
const TABLES = ["residents", "service_requests", "incident_reports"];
const EMPTY_FILTERS: AuditFilters = {
  search: "",
  tableName: "",
  actionType: "",
  dateFrom: "",
  dateTo: "",
};

function readableField(field: string) {
  return field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableValue(value: unknown) {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "string") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function changedFields(row: AuditRow) {
  if (!row.old_value || !row.new_value) return [];
  return Object.keys(row.new_value)
    .filter((key) => JSON.stringify(row.old_value?.[key]) !== JSON.stringify(row.new_value?.[key]))
    .map((key) => ({
      key,
      label: readableField(key),
      before: row.old_value?.[key],
      after: row.new_value?.[key],
    }));
}

function summary(row: AuditRow) {
  if (row.action_type === "INSERT") return "Record created.";
  if (row.action_type === "DELETE") return "Record deleted.";
  const fields = changedFields(row);
  if (!fields.length) return "Record updated.";
  const field = fields.find((item) => item.key === "status") ?? fields[0];
  return `${field.label} changed from ${readableValue(field.before)} to ${readableValue(field.after)}.`;
}

function formattedTimestamp(value: string) {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return value;
  return {
    date: timestamp.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
    time: timestamp.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

function localDayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { day_start: start.toISOString(), day_end: end.toISOString() };
}

function AuditDetails({ row }: { row: AuditRow }) {
  const fields = changedFields(row);
  return (
    <details className="audit-details">
      <summary>View full details</summary>
      <div className="audit-full-detail-header">
        <span className={`audit-action audit-action-${row.action_type.toLowerCase()}`}>
          {row.action_type === "INSERT" ? "Create" : row.action_type === "UPDATE" ? "Update" : "Delete"}
        </span>
        <strong>{readableField(row.table_name.replace(/s$/, ""))} #{row.record_id}</strong>
      </div>
      <p className="audit-detail-table">Database table: {row.table_name}</p>
      {row.action_type === "UPDATE" && fields.length > 0 ? (
        <div className="audit-change-list">
          {fields.map((field) => (
            <div className="audit-change-item" key={field.key}>
              <strong>{field.label}</strong>
              <div className="audit-value-pair">
                <span><small>Previous value</small><b>{readableValue(field.before)}</b></span>
                <span><small>New value</small><b>{readableValue(field.after)}</b></span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="audit-json-values">
          {row.old_value && (
            <div><strong>Previous values</strong><pre>{JSON.stringify(row.old_value, null, 2)}</pre></div>
          )}
          {row.new_value && (
            <div><strong>New values</strong><pre>{JSON.stringify(row.new_value, null, 2)}</pre></div>
          )}
          {!row.old_value && !row.new_value && <span className="muted">No field values were recorded.</span>}
        </div>
      )}
    </details>
  );
}

// Read-only trail written by database triggers; the page only queries existing records.
export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<AuditSummary | null>(null);
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_FILTERS);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (filter: AuditFilters, offset: number) => {
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (filter.tableName) params.set("table_name", filter.tableName);
    if (filter.actionType) params.set("action_type", filter.actionType);
    if (filter.search.trim()) params.set("search", filter.search.trim());
    if (filter.dateFrom) params.set("date_from", filter.dateFrom);
    if (filter.dateTo) params.set("date_to", filter.dateTo);
    return api<AuditRow[]>(`/audit-logs?${params.toString()}`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const range = new URLSearchParams(localDayRange());
        const [first, accounts, summary] = await Promise.all([
          fetchPage(applied, 0),
          api<UserRow[]>("/users"),
          api<AuditSummary>(`/audit-logs/summary?${range.toString()}`),
        ]);
        if (cancelled) return;
        setRows(first);
        setUsers(accounts);
        setStats(summary);
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

  const userName = useMemo(() => new Map(users.map((user) => [user.user_id, user.username])), [users]);

  async function loadMore() {
    try {
      setLoadingMore(true);
      const next = await fetchPage(applied, rows.length);
      setRows((current) => [...current, ...next]);
      setHasMore(next.length === PAGE);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  const apply = (event: FormEvent) => {
    event.preventDefault();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setError("Start date must be on or before the end date.");
      return;
    }
    setApplied({ ...filters, search: filters.search.trim() });
  };

  function reset() {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setError(null);
  }

  function userLabel(row: AuditRow) {
    return row.changed_by_user_id !== null
      ? userName.get(row.changed_by_user_id) ?? `User #${row.changed_by_user_id}`
      : "Direct database edit";
  }

  function recordDetails(row: AuditRow) {
    const timestamp = formattedTimestamp(row.logged_at);
    const fields = changedFields(row);
    const statusChange = fields.find((field) => field.key === "status");
    const cancellationRecorded = fields.some((field) => field.key === "cancelled_at");
    return (
      <article className="audit-activity-card" key={row.audit_id}>
        <div className="audit-record-top">
          <span className={`audit-action audit-action-${row.action_type.toLowerCase()}`}>
            {row.action_type === "INSERT" ? "Create" : row.action_type === "UPDATE" ? "Update" : "Delete"}
          </span>
          <time dateTime={row.logged_at}>
            {typeof timestamp === "string" ? timestamp : `${timestamp.date} · ${timestamp.time}`}
          </time>
        </div>
        <h3>{readableField(row.table_name.replace(/s$/, ""))} #{row.record_id}</h3>
        <p className="audit-changed-by">Changed by {userLabel(row)}</p>
        {statusChange ? (
          <div className="audit-status-change">
            <span>{statusChange.label}</span>
            <div>
              <span className="audit-value-old">{readableValue(statusChange.before)}</span>
              <span aria-hidden="true">→</span>
              <span className="audit-value-new">{readableValue(statusChange.after)}</span>
            </div>
          </div>
        ) : (
          <p className="audit-change-summary">{summary(row)}</p>
        )}
        {cancellationRecorded && <p className="audit-cancellation-note">Cancellation date was recorded.</p>}
        <AuditDetails row={row} />
      </article>
    );
  }

  return (
    <section className="audit-page">
      <header className="audit-page-header">
        <div>
          <p className="audit-eyebrow">BMIMS Administration</p>
          <h1>Audit Log</h1>
          <p className="audit-description">Track changes made across the barangay portal.</p>
        </div>
        <span className="audit-header-icon" aria-hidden="true"><ClipboardList size={22} /></span>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="audit-stats" aria-label="Audit log summary">
        <article><span>Total records</span><strong>{stats ? stats.totalRecords.toLocaleString() : "—"}</strong></article>
        <article><span>Today’s activity</span><strong>{stats ? stats.todayActivity.toLocaleString() : "—"}</strong></article>
        <article><span>Tables tracked</span><strong>{stats ? stats.tablesTracked.toLocaleString() : "—"}</strong></article>
      </div>

      <form className="card audit-filter-panel" onSubmit={apply}>
        <div className="audit-filter-heading">
          <div><h2>Filter activity</h2></div>
        </div>
        <div className="audit-filter-grid">
          <label className="audit-search-filter">
            <span>Record ID or user</span>
            <input
              type="search"
              placeholder="Search by ID or username"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </label>
          <label>
            <span>Table</span>
            <select value={filters.tableName} onChange={(event) => setFilters({ ...filters, tableName: event.target.value })}>
              <option value="">All tables</option>
              {TABLES.map((table) => <option key={table} value={table}>{readableField(table)}</option>)}
            </select>
          </label>
          <label>
            <span>Action</span>
            <select value={filters.actionType} onChange={(event) => setFilters({ ...filters, actionType: event.target.value })}>
              <option value="">All actions</option>
              <option value="INSERT">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={filters.dateFrom} onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={filters.dateTo} onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} />
          </label>
        </div>
        <div className="audit-filter-actions">
          <button type="button" className="secondary" onClick={reset}>Reset</button>
          <button type="submit">Apply filters</button>
        </div>
      </form>

      <div className="audit-results-heading">
        <div><h2>Recent activity</h2><p>{loading ? "Loading activity…" : "Showing the latest changes"}</p></div>
        <span className="muted">Database-triggered · Read only</span>
      </div>

      {loading ? (
        <p className="muted audit-loading" role="status">Loading audit records…</p>
      ) : rows.length ? (
        <>
          <div className="audit-activity-list">{rows.map((row) => recordDetails(row))}</div>
        </>
      ) : (
        <div className="card audit-empty"><strong>No audit activity found</strong><p>Try adjusting your filters, or reset them to see all recorded activity.</p></div>
      )}

      {hasMore && !loading && (
        <button type="button" className="secondary audit-load-more" disabled={loadingMore} onClick={() => void loadMore()}>
          {loadingMore ? "Loading…" : "Load more activity"}
        </button>
      )}
    </section>
  );
}
