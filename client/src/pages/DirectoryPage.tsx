import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { api } from "../api/client";
import { peso } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import "./incidents.css";
import "./directory.css";

type Row = Record<string, unknown>;

interface Field {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select";
  required?: boolean;
  nullable?: boolean;
  options?: { value: number; label: string }[];
  step?: string;
}
interface Column {
  header: string;
  cell: (row: Row) => ReactNode;
}
interface Resident {
  resident_id: number;
  household_id: number | null;
  first_name: string;
  last_name: string;
}

const day = (value: unknown) => (typeof value === "string" ? value.slice(0, 10) : "-");

function identityOf(row: Row, idKey: string) {
  const value = row.address ?? row.committee_name ?? row.name;
  return typeof value === "string" && value.trim() ? value : `#${String(row[idKey])}`;
}

function ResourceTab(props: {
  title: string;
  noun: string;
  path: string;
  idKey: string;
  fields: Field[];
  columns: Column[];
  canEdit: boolean;
}) {
  const { title, noun, path, idKey, fields, columns, canEdit } = props;
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyDeleteId, setBusyDeleteId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const tableHeadingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const deletingRef = useRef(false);
  const rowActionRefs = useRef(new Map<number, HTMLButtonElement>());
  const inputRefs = useRef(new Map<string, HTMLElement>());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<Row[]>(`${path}?limit=200`);
      setRows(result);
      setHasLoaded(true);
      setError(null);
      return result;
    } catch {
      setError(`Couldn't load ${title.toLowerCase()}. Please try again.`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [path, title]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pendingDelete) {
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLButtonElement>("[data-dialog-cancel]")?.focus());
    }
  }, [pendingDelete]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row[idKey], ...fields.map((field) => row[field.key])]
        .some((value) => value !== null && value !== undefined && String(value).toLocaleLowerCase().includes(query)),
    );
  }, [fields, idKey, rows, search]);

  function reset() {
    setValues({});
    setFieldErrors({});
    setEditingId(null);
    setError(null);
  }

  function updateValue(key: string, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (!previous[key]) return previous;
      const nextErrors = { ...previous };
      delete nextErrors[key];
      return nextErrors;
    });
    setError(null);
    setSuccess(null);
  }

  function startEdit(row: Row) {
    const next: Record<string, string> = {};
    for (const field of fields) {
      const raw = row[field.key];
      next[field.key] = raw === null || raw === undefined
        ? ""
        : field.type === "date"
          ? day(raw)
          : String(raw);
    }
    setValues(next);
    setFieldErrors({});
    setError(null);
    setSuccess(null);
    setEditingId(Number(row[idKey]));
    requestAnimationFrame(() => formHeadingRef.current?.focus());
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const raw = (values[field.key] ?? "").trim();
      if (field.required && !raw) {
        nextErrors[field.key] = field.key === "address"
          ? "Address is required."
          : field.key === "committee_name"
            ? "Committee name is required."
            : field.key === "name"
              ? "Name is required."
              : `${field.label} is required.`;
        continue;
      }
      if (field.type === "number" && raw) {
        const amount = Number(raw);
        if (!Number.isFinite(amount) || amount < 0) {
          nextErrors[field.key] = "Fee must be a valid non-negative amount.";
        }
      }
      if (field.type === "date" && raw && Number.isNaN(Date.parse(raw))) {
        nextErrors[field.key] = `${field.label} must be a valid date.`;
      }
    }
    setFieldErrors(nextErrors);
    const firstInvalid = fields.find((field) => nextErrors[field.key]);
    if (firstInvalid) {
      inputRefs.current.get(firstInvalid.key)?.focus();
      return false;
    }
    return true;
  }

  function buildBody() {
    const body: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = (values[field.key] ?? "").trim();
      if (raw === "") {
        if (field.nullable) body[field.key] = null;
        continue;
      }
      body[field.key] = field.type === "number" || field.type === "select" ? Number(raw) : raw;
    }
    return body;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (submittingRef.current || !validate()) return;
    submittingRef.current = true;
    setBusy(true);
    const wasEditing = editingId !== null;
    try {
      const body = buildBody();
      await api(editingId === null ? path : `${path}/${editingId}`, {
        method: editingId === null ? "POST" : "PATCH",
        body,
      });
      const updatedValues = Object.fromEntries(
        fields.map((field) => [field.key, body[field.key] === null || body[field.key] === undefined ? "" : String(body[field.key])]),
      );
      if (wasEditing) {
        setValues(updatedValues);
      } else {
        reset();
      }
      const result = await load();
      setSuccess(result
        ? `${title.slice(0, -1)} ${wasEditing ? "updated" : "added"} successfully.`
        : `${title.slice(0, -1)} ${wasEditing ? "updated" : "added"} successfully, but the list couldn't refresh.`);
      if (!wasEditing && result) requestAnimationFrame(() => formHeadingRef.current?.focus());
    } catch {
      setError(`Couldn't ${wasEditing ? "save" : "add"} this ${noun}. Your changes are still here; please try again.`);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  function openDelete(row: Row, trigger: HTMLButtonElement) {
    deleteTriggerRef.current = trigger;
    setPendingDelete(row);
    setError(null);
    setSuccess(null);
  }

  function closeDelete(restoreFocus = true) {
    setPendingDelete(null);
    if (restoreFocus) requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && !deletingRef.current) {
      event.preventDefault();
      closeDelete();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function removeConfirmed() {
    if (!pendingDelete || deletingRef.current) return;
    deletingRef.current = true;
    const row = pendingDelete;
    const deletedId = Number(row[idKey]);
    const oldIndex = rows.findIndex((item) => Number(item[idKey]) === deletedId);
    const nextFocusId = Number(rows[oldIndex + 1]?.[idKey] ?? rows[oldIndex - 1]?.[idKey]);
    setBusyDeleteId(deletedId);
    try {
      await api(`${path}/${deletedId}`, { method: "DELETE" });
      const result = await load();
      setSuccess(`${title.slice(0, -1)} deleted successfully.`);
      setPendingDelete(null);
      requestAnimationFrame(() => {
        const nextAction = result?.length && Number.isFinite(nextFocusId)
          ? rowActionRefs.current.get(nextFocusId)
          : undefined;
        (nextAction ?? tableHeadingRef.current)?.focus();
      });
    } catch {
      setError(`Couldn't delete this ${noun}. The record is unchanged; please try again.`);
      setPendingDelete(null);
      requestAnimationFrame(() => deleteTriggerRef.current?.focus());
    } finally {
      deletingRef.current = false;
      setBusyDeleteId(null);
    }
  }

  function renderField(field: Field) {
    const inputId = `${path.replaceAll("/", "-")}-${field.key}`;
    const errorId = `${inputId}-error`;
    const common = {
      id: inputId,
      "aria-invalid": Boolean(fieldErrors[field.key]) || undefined,
      "aria-describedby": fieldErrors[field.key] ? errorId : undefined,
      "aria-required": field.required || undefined,
      ref: (element: HTMLElement | null) => {
        if (element) inputRefs.current.set(field.key, element);
        else inputRefs.current.delete(field.key);
      },
    };
    return (
      <div className={`directory-field${field.type === "textarea" || field.key === "address" ? " grow" : ""}`} key={field.key}>
        <label htmlFor={inputId}>{field.label}{field.required && <span aria-hidden="true"> *</span>}</label>
        {field.type === "textarea" ? (
          <textarea
            {...common}
            value={values[field.key] ?? ""}
            onChange={(event) => updateValue(field.key, event.target.value)}
            disabled={busy}
          />
        ) : field.type === "select" ? (
          <select
            {...common}
            value={values[field.key] ?? ""}
            onChange={(event) => updateValue(field.key, event.target.value)}
            disabled={busy}
          >
            <option value="">No head selected</option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            {...common}
            type={field.type}
            step={field.step}
            min={field.type === "number" ? 0 : undefined}
            value={values[field.key] ?? ""}
            onChange={(event) => updateValue(field.key, event.target.value)}
            disabled={busy}
          />
        )}
        {fieldErrors[field.key] && <span className="directory-field-error" id={errorId}>{fieldErrors[field.key]}</span>}
      </div>
    );
  }

  const identity = pendingDelete ? identityOf(pendingDelete, idKey) : "";

  return (
    <div className="directory-resource">
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="notice" role="status">{success}</p>}

      {canEdit && (
        <form className="card stack directory-form" onSubmit={submit} aria-busy={busy} noValidate>
          <h3 ref={formHeadingRef} tabIndex={-1} className="directory-form-heading">
            {editingId === null ? `Add ${noun}` : `Edit ${noun}`}
          </h3>
          <div className="form-row directory-form-fields">{fields.map(renderField)}</div>
          <div className="directory-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? (editingId === null ? "Adding…" : "Saving…") : (editingId === null ? "Add" : "Save changes")}
            </button>
            {editingId !== null && <button type="button" className="secondary" onClick={reset} disabled={busy}>Cancel edit</button>}
            {busy && <span className="directory-live-status" role="status" aria-live="polite">
              {editingId === null ? `Adding ${noun}…` : `Saving ${noun}…`}
            </span>}
          </div>
        </form>
      )}

      <div className="directory-table-heading">
        <h3 ref={tableHeadingRef} tabIndex={-1}>{title}</h3>
        <label className="directory-search">
          <span>Search {title.toLowerCase()}</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${noun}`}
            aria-label={`Search ${title.toLowerCase()}`}
          />
          {search && <button type="button" className="link" onClick={() => setSearch("")}>Clear search</button>}
        </label>
      </div>
      <p className="directory-result-count" role="status" aria-live="polite">
        {loading ? `Loading ${title.toLowerCase()}…` : search.trim()
          ? `${filteredRows.length} ${noun}${filteredRows.length === 1 ? "" : "s"} found.`
          : `${rows.length} ${noun}${rows.length === 1 ? "" : "s"} found.`}
      </p>

      {loading && !hasLoaded ? (
        <div className="card directory-loading" role="status" aria-live="polite">Loading {title.toLowerCase()}…</div>
      ) : !hasLoaded ? (
        <div className="card directory-loading">
          <p role="alert">Couldn't load {title.toLowerCase()}.</p>
          <button type="button" className="secondary" onClick={() => void load()}>Try again</button>
        </div>
      ) : (
        <div
          className="card table-wrap directory-table-wrap"
          role="region"
          aria-label={`${title} records table`}
          tabIndex={0}
          aria-busy={loading}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                {columns.map((column) => <th scope="col" key={column.header}>{column.header}</th>)}
                {canEdit && <th scope="col"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const id = Number(row[idKey]);
                const identityText = identityOf(row, idKey);
                return (
                  <tr key={String(row[idKey])} aria-busy={busyDeleteId === id || (busy && editingId === id)}>
                    <td data-label="ID">{String(row[idKey])}</td>
                    {columns.map((column) => <td key={column.header} data-label={column.header}>{column.cell(row)}</td>)}
                    {canEdit && (
                      <td data-label="Actions">
                        <div className="actions">
                          {busy && editingId === id && <span className="directory-row-progress" role="status">Saving…</span>}
                          <button
                            type="button"
                            className="secondary"
                            aria-label={`Edit ${identityText} ${noun}`}
                            onClick={() => startEdit(row)}
                            disabled={busy || busyDeleteId !== null}
                          >Edit</button>
                          <button
                            type="button"
                            className="link danger"
                            aria-label={`Delete ${identityText} ${noun}`}
                            ref={(element) => {
                              if (element) rowActionRefs.current.set(id, element);
                              else rowActionRefs.current.delete(id);
                            }}
                            onClick={(event) => openDelete(row, event.currentTarget)}
                            disabled={busy || busyDeleteId !== null}
                          >{busyDeleteId === id ? "Deleting…" : "Delete"}</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (canEdit ? 2 : 1)} className="directory-empty-cell">
                    {search.trim() ? (
                      <>
                        <strong>No records match your filters.</strong>
                        <button type="button" className="link" onClick={() => setSearch("")}>Clear search</button>
                      </>
                    ) : (
                      <>
                        <strong>No {title.toLowerCase()} found.</strong>
                        {canEdit && <span>Use the form above to add a {noun}.</span>}
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingRef.current) closeDelete();
          }}
        >
          <section
            className="resident-dialog confirm-dialog directory-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="directory-delete-title"
            aria-describedby="directory-delete-description"
            ref={dialogRef}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="dialog-header">
              <div><span className="dialog-kicker">This action cannot be undone</span><h2 id="directory-delete-title">Delete {noun}?</h2></div>
            </div>
            <p id="directory-delete-description">
              Are you sure you want to delete <strong>{identity}</strong>? If other records depend on it, deletion may be prevented.
            </p>
            <div className="directory-dialog-actions">
              <button type="button" className="secondary" data-dialog-cancel disabled={busyDeleteId !== null} onClick={() => closeDelete()}>
                Cancel
              </button>
              <button type="button" className="danger" disabled={busyDeleteId !== null} onClick={() => void removeConfirmed()}>
                {busyDeleteId !== null ? "Deleting…" : "Delete"}
              </button>
            </div>
            {busyDeleteId !== null && <p role="status" aria-live="polite">Deleting {noun}…</p>}
          </section>
        </div>
      )}
    </div>
  );
}

type TabKey = "households" | "committees" | "documents";

export function DirectoryPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const [tab, setTab] = useState<TabKey>("households");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [residentsError, setResidentsError] = useState<string | null>(null);

  useEffect(() => {
    api<Resident[]>("/residents?limit=200")
      .then(setResidents)
      .catch(() => setResidentsError("Couldn't load resident names. Household head names may appear as IDs."));
  }, []);

  const nameOf = new Map(residents.map((resident) => [resident.resident_id, `${resident.first_name} ${resident.last_name}`]));
  const tabs: { key: TabKey; label: string }[] = [
    { key: "households", label: "Households" },
    { key: "committees", label: "Committees" },
    { key: "documents", label: "Document types" },
  ];

  return (
    <section>
      <h2>Directory</h2>
      {residentsError && <p className="notice" role="status">{residentsError}</p>}
      <div className="tabs directory-tabs" role="tablist" aria-label="Directory categories">
        {tabs.map((item) => (
          <button
            key={item.key}
            id={`directory-tab-${item.key}`}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            aria-controls={`directory-panel-${item.key}`}
            tabIndex={tab === item.key ? 0 : -1}
            className={tab === item.key ? "active" : ""}
            onClick={() => setTab(item.key)}
            onKeyDown={(event) => {
              const current = tabs.findIndex((candidate) => candidate.key === tab);
              const nextIndex = event.key === "ArrowRight" ? (current + 1) % tabs.length
                : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length : -1;
              if (nextIndex >= 0) {
                event.preventDefault();
                setTab(tabs[nextIndex].key);
                document.getElementById(`directory-tab-${tabs[nextIndex].key}`)?.focus();
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "households" && (
        <div role="tabpanel" id="directory-panel-households" aria-labelledby="directory-tab-households">
          <ResourceTab
            title="Households" noun="household" path="/households" idKey="household_id" canEdit={canEdit}
            fields={[
              { key: "address", label: "Address", type: "text", required: true },
              {
                key: "head_resident_id", label: "Head of household", type: "select", nullable: true,
                options: residents.map((resident) => ({ value: resident.resident_id, label: `${resident.first_name} ${resident.last_name}` })),
              },
              { key: "date_registered", label: "Registered on", type: "date" },
            ]}
            columns={[
              { header: "Address", cell: (row) => String(row.address) },
              {
                header: "Head",
                cell: (row) => row.head_resident_id === null || row.head_resident_id === undefined
                  ? "-" : nameOf.get(Number(row.head_resident_id)) ?? `#${String(row.head_resident_id)}`,
              },
              { header: "Members", cell: (row) => residents.filter((member) => member.household_id === Number(row.household_id)).length },
              { header: "Registered", cell: (row) => day(row.date_registered) },
            ]}
          />
        </div>
      )}

      {tab === "committees" && (
        <div role="tabpanel" id="directory-panel-committees" aria-labelledby="directory-tab-committees">
          <ResourceTab
            title="Committees" noun="committee" path="/committees" idKey="committee_id" canEdit={canEdit}
            fields={[
              { key: "committee_name", label: "Committee name", type: "text", required: true },
              { key: "description", label: "Description", type: "textarea", nullable: true },
            ]}
            columns={[
              { header: "Name", cell: (row) => String(row.committee_name) },
              { header: "Description", cell: (row) => row.description ? String(row.description) : "-" },
            ]}
          />
        </div>
      )}

      {tab === "documents" && (
        <div role="tabpanel" id="directory-panel-documents" aria-labelledby="directory-tab-documents">
          <ResourceTab
            title="Document types" noun="document type" path="/document-types" idKey="doc_type_id" canEdit={canEdit}
            fields={[
              { key: "name", label: "Name", type: "text", required: true },
              { key: "description", label: "Description", type: "textarea", nullable: true },
              { key: "fee_amount", label: "Fee (PHP)", type: "number", step: "0.01" },
            ]}
            columns={[
              { header: "Name", cell: (row) => String(row.name) },
              { header: "Description", cell: (row) => row.description ? String(row.description) : "-" },
              { header: "Fee", cell: (row) => peso(row.fee_amount as string | number) },
            ]}
          />
        </div>
      )}
    </section>
  );
}
