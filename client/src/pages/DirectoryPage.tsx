import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, errorMessage } from "../api/client";
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
  // empty value is sent as null (true) or left out (false)
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

// One reusable list-and-form for a simple table. Staff can read it; only the
// admin gets the form and the Edit and Delete buttons, and the database
// refuses writes from anyone else anyway.
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
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api<Row[]>(`${path}?limit=200`));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setValues({});
    setEditingId(null);
  }

  function startEdit(row: Row) {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const raw = row[f.key];
      next[f.key] = raw === null || raw === undefined ? "" : f.type === "date" ? day(raw) : String(raw);
    }
    setValues(next);
    setEditingId(Number(row[idKey]));
  }

  function buildBody() {
    const body: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = (values[f.key] ?? "").trim();
      if (raw === "") {
        if (f.nullable) body[f.key] = null;
        continue;
      }
      body[f.key] = f.type === "number" || f.type === "select" ? Number(raw) : raw;
    }
    return body;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (editingId === null) {
        await api(path, { method: "POST", body: buildBody() });
      } else {
        await api(`${path}/${editingId}`, { method: "PATCH", body: buildBody() });
      }
      reset();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`Delete this ${noun}?`)) return;
    try {
      await api(`${path}/${row[idKey]}`, { method: "DELETE" });
      await load();
    } catch (e) {
      // e.g. "other records still depend on this one" (HTTP 409)
      setError(errorMessage(e));
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}

      {canEdit && (
        <form className="card stack" onSubmit={submit}>
          <strong>{editingId === null ? `Add a ${noun}` : `Edit ${noun} #${editingId}`}</strong>
          <div className="form-row">
            {fields.map((f) => (
              <label className={`field${f.type === "textarea" || f.key === "address" ? " grow" : ""}`} key={f.key}>
                {f.label}
                {f.type === "textarea" ? (
                  <textarea
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    required={f.required}
                  />
                ) : f.type === "select" ? (
                  <select
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    required={f.required}
                  >
                    <option value="">None</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={f.type}
                    step={f.step}
                    min={f.type === "number" ? 0 : undefined}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    required={f.required}
                  />
                )}
              </label>
            ))}
            <button type="submit">{editingId === null ? "Add" : "Save changes"}</button>
            {editingId !== null && (
              <button type="button" className="secondary" onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                {columns.map((c) => (
                  <th key={c.header}>{c.header}</th>
                ))}
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row[idKey])}>
                  <td>{String(row[idKey])}</td>
                  {columns.map((c) => (
                    <td key={c.header}>{c.cell(row)}</td>
                  ))}
                  {canEdit && (
                    <td>
                      <div className="actions">
                        <button type="button" className="secondary" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="link danger" onClick={() => void remove(row)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + (canEdit ? 2 : 1)} className="muted">
                    No {title.toLowerCase()} yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type TabKey = "households" | "committees" | "documents";

// Households, committees and document types in one place.
export function DirectoryPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin";
  const [tab, setTab] = useState<TabKey>("households");
  const [residents, setResidents] = useState<Resident[]>([]);

  useEffect(() => {
    api<Resident[]>("/residents?limit=200")
      .then(setResidents)
      .catch(() => setResidents([]));
  }, []);

  const nameOf = new Map(residents.map((r) => [r.resident_id, `${r.first_name} ${r.last_name}`]));

  return (
    <section>
      <h2>Directory</h2>
      <div className="tabs">
        <button type="button" className={tab === "households" ? "active" : ""} onClick={() => setTab("households")}>
          Households
        </button>
        <button type="button" className={tab === "committees" ? "active" : ""} onClick={() => setTab("committees")}>
          Committees
        </button>
        <button type="button" className={tab === "documents" ? "active" : ""} onClick={() => setTab("documents")}>
          Document types
        </button>
      </div>

      {tab === "households" && (
        <ResourceTab
          title="Households"
          noun="household"
          path="/households"
          idKey="household_id"
          canEdit={canEdit}
          fields={[
            { key: "address", label: "Address", type: "text", required: true },
            {
              key: "head_resident_id",
              label: "Head of household",
              type: "select",
              nullable: true,
              options: residents.map((r) => ({ value: r.resident_id, label: `${r.first_name} ${r.last_name}` })),
            },
            { key: "date_registered", label: "Registered on", type: "date" },
          ]}
          columns={[
            { header: "Address", cell: (r) => String(r.address) },
            {
              header: "Head",
              cell: (r) =>
                r.head_resident_id === null || r.head_resident_id === undefined
                  ? "-"
                  : (nameOf.get(Number(r.head_resident_id)) ?? `#${String(r.head_resident_id)}`),
            },
            {
              header: "Members",
              cell: (r) => residents.filter((m) => m.household_id === Number(r.household_id)).length,
            },
            { header: "Registered", cell: (r) => day(r.date_registered) },
          ]}
        />
      )}

      {tab === "committees" && (
        <ResourceTab
          title="Committees"
          noun="committee"
          path="/committees"
          idKey="committee_id"
          canEdit={canEdit}
          fields={[
            { key: "committee_name", label: "Name", type: "text", required: true },
            { key: "description", label: "Description", type: "textarea", nullable: true },
          ]}
          columns={[
            { header: "Name", cell: (r) => String(r.committee_name) },
            { header: "Description", cell: (r) => (r.description ? String(r.description) : "-") },
          ]}
        />
      )}

      {tab === "documents" && (
        <ResourceTab
          title="Document types"
          noun="document type"
          path="/document-types"
          idKey="doc_type_id"
          canEdit={canEdit}
          fields={[
            { key: "name", label: "Name", type: "text", required: true },
            { key: "description", label: "Description", type: "textarea", nullable: true },
            { key: "fee_amount", label: "Fee (PHP)", type: "number", step: "0.01" },
          ]}
          columns={[
            { header: "Name", cell: (r) => String(r.name) },
            { header: "Description", cell: (r) => (r.description ? String(r.description) : "-") },
            { header: "Fee", cell: (r) => peso(r.fee_amount as string | number) },
          ]}
        />
      )}
    </section>
  );
}
