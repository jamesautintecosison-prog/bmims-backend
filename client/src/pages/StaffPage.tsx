import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./incidents.css";
import "./serviceRequests.css";
import "./staff.css";

interface StaffRow {
  staff_id: number;
  first_name: string;
  last_name: string;
  position: string;
}
interface Assignment {
  assignment_id: number;
  staff_id: number;
  committee_id: number;
  role: string;
}
interface Committee {
  committee_id: number;
  committee_name: string;
}
interface UserRow {
  user_id: number;
  username: string;
  role: string;
  staff_id: number | null;
}
interface Secret {
  title: string;
  username: string;
  password: string;
}

const COMMITTEE_ROLES = ["Chairperson", "Secretary", "Member"];

// Admin-only screen: add staff, give them a login, assign them to
// committees, reset passwords, and remove them. The database enforces the
// admin-only rules too, so the page cannot be used to bypass them.
export function StaffPage() {
  const { user } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState<Secret | null>(null);

  const [newStaff, setNewStaff] = useState({ first_name: "", last_name: "", position: "" });
  const [assign, setAssign] = useState({ staffId: "", committeeId: "", role: "Member" });
  const [login, setLogin] = useState({ staffId: "", username: "", role: "staff" });

  const load = useCallback(async () => {
    try {
      const [s, a, c, u] = await Promise.all([
        api<StaffRow[]>("/staff?limit=200"),
        api<Assignment[]>("/staff-assignments?limit=200"),
        api<Committee[]>("/committees?limit=200"),
        api<UserRow[]>("/users"),
      ]);
      setStaff(s);
      setAssignments(a);
      setCommittees(c);
      setUsers(u);
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

  const committeeName = useMemo(
    () => new Map(committees.map((c) => [c.committee_id, c.committee_name])),
    [committees],
  );
  const loginByStaff = useMemo(() => {
    const map = new Map<number, UserRow>();
    users.forEach((u) => {
      if (u.staff_id !== null) map.set(u.staff_id, u);
    });
    return map;
  }, [users]);
  const assignmentsByStaff = useMemo(() => {
    const map = new Map<number, Assignment[]>();
    assignments.forEach((a) => map.set(a.staff_id, [...(map.get(a.staff_id) ?? []), a]));
    return map;
  }, [assignments]);

  const withoutLogin = staff.filter((s) => !loginByStaff.has(s.staff_id));

  // Runs one action, reports any database message, then refreshes the lists
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

  const addStaff = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/staff", { method: "POST", body: newStaff });
      setNewStaff({ first_name: "", last_name: "", position: "" });
      setNotice("Staff member added. Now assign them to a committee and give them a login.");
    });
  };

  const assignStaff = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/staff-assignments", {
        method: "POST",
        body: {
          staff_id: Number(assign.staffId),
          committee_id: Number(assign.committeeId),
          role: assign.role,
        },
      });
      setAssign({ staffId: "", committeeId: "", role: "Member" });
    });
  };

  const unassign = (a: Assignment) =>
    void run(async () => {
      await api(`/staff-assignments/${a.assignment_id}`, { method: "DELETE" });
    });

  const createLogin = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const created = await api<{ username: string; temporary_password: string }>("/users/staff-login", {
        method: "POST",
        body: { staff_id: Number(login.staffId), username: login.username, role: login.role },
      });
      setLogin({ staffId: "", username: "", role: "staff" });
      setSecret({
        title: "Login created",
        username: created.username,
        password: created.temporary_password,
      });
    });
  };

  const resetPassword = (account: UserRow) => {
    if (!window.confirm(`Reset the password for ${account.username}? Their old password stops working.`)) return;
    void run(async () => {
      const result = await api<{ username: string; temporary_password: string }>(
        `/users/${account.user_id}/reset-password`,
        { method: "POST" },
      );
      setSecret({
        title: "Password reset",
        username: result.username,
        password: result.temporary_password,
      });
    });
  };

  const removeStaff = (member: StaffRow) => {
    const name = `${member.first_name} ${member.last_name}`;
    if (
      !window.confirm(
        `Remove ${name}?\n\nTheir login and committee assignments are deleted. ` +
          `If they issued certificates or approved expenses, the record itself is kept for the audit trail.`,
      )
    ) {
      return;
    }
    void run(async () => {
      const result = await api<{ result: string }>(`/staff/${member.staff_id}/remove`, { method: "POST" });
      setNotice(
        result.result === "deleted"
          ? `${name} was removed.`
          : `${name} no longer has access. The record is kept because certificates, expenses or incidents refer to it.`,
      );
    });
  };

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.password);
      setNotice("Password copied.");
    } catch {
      setNotice("Copy failed. Select the password and copy it by hand.");
    }
  }

  return (
    <section>
      <h2>Staff</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {secret && (
        <div className="secret">
          <strong>{secret.title}</strong>
          <p style={{ margin: "6px 0" }}>
            Username <code>{secret.username}</code> Temporary password <code>{secret.password}</code>
            <button type="button" className="secondary" onClick={() => void copySecret()}>
              Copy
            </button>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            This is shown only once and cannot be looked up later. Give it to the person privately, and ask them
            to change it on the Account page after signing in.
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <button type="button" className="link" onClick={() => setSecret(null)}>
              I have saved it, dismiss
            </button>
          </p>
        </div>
      )}

      <div className="card stack">
        <strong>Add a staff member</strong>
        <form className="row" onSubmit={addStaff}>
          <input
            placeholder="First name"
            value={newStaff.first_name}
            onChange={(e) => setNewStaff({ ...newStaff, first_name: e.target.value })}
            required
          />
          <input
            placeholder="Last name"
            value={newStaff.last_name}
            onChange={(e) => setNewStaff({ ...newStaff, last_name: e.target.value })}
            required
          />
          <input
            className="grow"
            placeholder="Position, for example Kagawad - Education"
            value={newStaff.position}
            onChange={(e) => setNewStaff({ ...newStaff, position: e.target.value })}
            required
          />
          <button type="submit">Add</button>
        </form>

        <strong>Assign to a committee</strong>
        <form className="row" onSubmit={assignStaff}>
          <select value={assign.staffId} onChange={(e) => setAssign({ ...assign, staffId: e.target.value })} required>
            <option value="">Staff member...</option>
            {staff.map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
          <select
            value={assign.committeeId}
            onChange={(e) => setAssign({ ...assign, committeeId: e.target.value })}
            required
          >
            <option value="">Committee...</option>
            {committees.map((c) => (
              <option key={c.committee_id} value={c.committee_id}>
                {c.committee_name}
              </option>
            ))}
          </select>
          <select value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value })}>
            {COMMITTEE_ROLES.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <button type="submit">Assign</button>
        </form>

        <strong>Give a staff member a login</strong>
        <form className="row" onSubmit={createLogin}>
          <select value={login.staffId} onChange={(e) => setLogin({ ...login, staffId: e.target.value })} required>
            <option value="">Staff member without a login...</option>
            {withoutLogin.map((s) => (
              <option key={s.staff_id} value={s.staff_id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
          <input
            placeholder="Username"
            value={login.username}
            onChange={(e) => setLogin({ ...login, username: e.target.value })}
            required
          />
          <select value={login.role} onChange={(e) => setLogin({ ...login, role: e.target.value })}>
            <option value="staff">staff</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit">Create login</button>
        </form>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Position</th>
                <th>Committees</th>
                <th>Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => {
                const account = loginByStaff.get(s.staff_id);
                const mine = assignmentsByStaff.get(s.staff_id) ?? [];
                const isSelf = user?.staff_id === s.staff_id;
                return (
                  <tr key={s.staff_id}>
                    <td>
                      {s.first_name} {s.last_name}
                    </td>
                    <td>{s.position}</td>
                    <td>
                      <div className="chips">
                        {mine.map((a) => (
                          <span className="chip" key={a.assignment_id}>
                            {committeeName.get(a.committee_id) ?? `#${a.committee_id}`} ({a.role})
                            <button type="button" title="Remove from this committee" onClick={() => unassign(a)}>
                              ×
                            </button>
                          </span>
                        ))}
                        {mine.length === 0 && <span className="muted">None</span>}
                      </div>
                    </td>
                    <td>
                      {account ? (
                        <>
                          {account.username} <span className={`badge badge-${account.role}`}>{account.role}</span>
                        </>
                      ) : (
                        <span className="muted">No login</span>
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {account && (
                          <button type="button" className="secondary" onClick={() => resetPassword(account)}>
                            Reset password
                          </button>
                        )}
                        <button
                          type="button"
                          className="warn"
                          disabled={isSelf}
                          title={isSelf ? "You cannot remove your own account" : "Remove this staff member"}
                          onClick={() => removeStaff(s)}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No staff yet.
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
