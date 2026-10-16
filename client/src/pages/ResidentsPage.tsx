import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./residents.css";
import "./serviceRequests.css";
import "./staff.css";

interface Resident {
  resident_id: number;
  household_id: number | null;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string;
  contact_number: string | null;
  resident_status: string;
}
interface UserRow {
  user_id: number;
  username: string;
  role: string;
  resident_id: number | null;
}
interface Credential {
  name: string;
  username: string;
  password: string;
}

const EMPTY_FORM = { first_name: "", last_name: "", birth_date: "", gender: "Male", contact_number: "" };

// Used for both the staff/admin list and the resident's own record:
// the database decides which rows come back for the signed-in tier.
// Admins can also give residents their own login and reset passwords.
export function ResidentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [residents, setResidents] = useState<Resident[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creds, setCreds] = useState<{ title: string; rows: Credential[] } | null>(null);

  const load = useCallback(async () => {
    try {
      setResidents(await api<Resident[]>("/residents?limit=200"));
      if (isAdmin) setUsers(await api<UserRow[]>("/users"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const accountByResident = useMemo(() => {
    const map = new Map<number, UserRow>();
    users.forEach((u) => {
      if (u.resident_id !== null) map.set(u.resident_id, u);
    });
    return map;
  }, [users]);

  const withoutAccount = residents.filter(
    (r) => r.resident_status === "Active" && !accountByResident.has(r.resident_id),
  ).length;

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const add = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/residents", {
        method: "POST",
        body: {
          first_name: form.first_name,
          last_name: form.last_name,
          birth_date: form.birth_date,
          gender: form.gender,
          contact_number: form.contact_number.trim() || null,
        },
      });
      setForm(EMPTY_FORM);
    });
  };

  const remove = (resident: Resident) => {
    if (!window.confirm(`Delete ${resident.first_name} ${resident.last_name}?`)) return;
    void run(async () => {
      await api(`/residents/${resident.resident_id}`, { method: "DELETE" });
    });
  };

  // One call creates every missing login at once, or just the ones given
  const provision = (residentIds?: number[], title = "Logins created") =>
    void run(async () => {
      const result = await api<{
        created: { name: string; username: string; temporary_password: string }[];
        remaining: number;
      }>("/users/provision-residents", {
        method: "POST",
        body: residentIds ? { resident_ids: residentIds } : {},
      });
      setCreds({
        title,
        rows: result.created.map((c) => ({ name: c.name, username: c.username, password: c.temporary_password })),
      });
      if (result.created.length === 0) setNotice("Every active resident already has a login.");
      if (result.remaining > 0) {
        setNotice(`${result.remaining} more residents still need a login. Run it again after saving these.`);
      }
    });

  const resetPassword = (resident: Resident, account: UserRow) => {
    if (!window.confirm(`Reset the password for ${account.username}? Their old password stops working.`)) return;
    void run(async () => {
      const result = await api<{ username: string; temporary_password: string }>(
        `/users/${account.user_id}/reset-password`,
        { method: "POST" },
      );
      setCreds({
        title: "Password reset",
        rows: [
          {
            name: `${resident.first_name} ${resident.last_name}`,
            username: result.username,
            password: result.temporary_password,
          },
        ],
      });
    });
  };

  async function copyAll() {
    if (!creds) return;
    const text = creds.rows.map((r) => `${r.name}\t${r.username}\t${r.password}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied. Paste it somewhere private, then dismiss this box.");
    } catch {
      setNotice("Copy failed. Select the table and copy it by hand.");
    }
  }

  function downloadCsv() {
    if (!creds) return;
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = ["name,username,temporary_password", ...creds.rows.map((r) => [r.name, r.username, r.password].map(quote).join(","))];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resident-logins.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section>
      <h2>{user?.role === "resident" ? "My record" : "Residents"}</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {creds && (
        <div className="secret">
          <strong>{creds.title}</strong>
          <table className="creds">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Temporary password</th>
              </tr>
            </thead>
            <tbody>
              {creds.rows.map((r) => (
                <tr key={r.username}>
                  <td>{r.name}</td>
                  <td>
                    <code>{r.username}</code>
                  </td>
                  <td>
                    <code>{r.password}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ margin: "0 0 8px" }}>
            Shown only once. Give each person their own details privately, and ask them to change the password on
            the Account page after signing in. Delete any saved copy afterwards.
          </p>
          <div className="bar" style={{ marginBottom: 0 }}>
            <button type="button" className="secondary" onClick={() => void copyAll()}>
              Copy all
            </button>
            <button type="button" className="secondary" onClick={downloadCsv}>
              Download CSV
            </button>
            <button type="button" className="link" onClick={() => setCreds(null)}>
              I have saved them, dismiss
            </button>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="bar">
          <button type="button" disabled={withoutAccount === 0} onClick={() => provision()}>
            Create logins for all residents without one ({withoutAccount})
          </button>
        </div>
      )}

      {isAdmin && (
        <form className="card inline" onSubmit={add}>
          <input
            placeholder="First name"
            value={form.first_name}
            onChange={(e) => setForm({ ...form, first_name: e.target.value })}
            required
          />
          <input
            placeholder="Last name"
            value={form.last_name}
            onChange={(e) => setForm({ ...form, last_name: e.target.value })}
            required
          />
          <input
            type="date"
            value={form.birth_date}
            onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            required
          />
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
          <input
            placeholder="Contact number"
            value={form.contact_number}
            onChange={(e) => setForm({ ...form, contact_number: e.target.value })}
          />
          <button type="submit">Add resident</button>
        </form>
      )}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Birth date</th>
                <th>Gender</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Household</th>
                {isAdmin && <th>Login</th>}
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {residents.map((r) => {
                const account = accountByResident.get(r.resident_id);
                return (
                  <tr key={r.resident_id}>
                    <td>{r.resident_id}</td>
                    <td>
                      {r.first_name} {r.last_name}
                    </td>
                    <td>{r.birth_date.slice(0, 10)}</td>
                    <td>{r.gender}</td>
                    <td>{r.contact_number ?? "-"}</td>
                    <td>{r.resident_status}</td>
                    <td>{r.household_id ?? "-"}</td>
                    {isAdmin && (
                      <td>{account ? account.username : <span className="muted">No login</span>}</td>
                    )}
                    {isAdmin && (
                      <td>
                        <div className="actions">
                          {account ? (
                            <button type="button" className="secondary" onClick={() => resetPassword(r, account)}>
                              Reset password
                            </button>
                          ) : (
                            r.resident_status === "Active" && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => provision([r.resident_id], "Login created")}
                              >
                                Create login
                              </button>
                            )
                          )}
                          <button type="button" className="link danger" onClick={() => remove(r)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {residents.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No records.
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
