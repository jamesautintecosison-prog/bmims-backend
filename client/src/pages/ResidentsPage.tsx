import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

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

const EMPTY_FORM = { first_name: "", last_name: "", birth_date: "", gender: "Male", contact_number: "" };

// Used for both the staff/admin list and the resident's own record:
// the database decides which rows come back for the signed-in tier.
export function ResidentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [residents, setResidents] = useState<Resident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      setResidents(await api<Resident[]>("/residents"));
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

  async function add(event: FormEvent) {
    event.preventDefault();
    try {
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
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function remove(resident: Resident) {
    if (!window.confirm(`Delete ${resident.first_name} ${resident.last_name}?`)) return;
    try {
      await api(`/residents/${resident.resident_id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      // e.g. "Blocked: other records still depend on this one" (HTTP 409)
      setError(errorMessage(e));
    }
  }

  return (
    <section>
      <h2>{user?.role === "resident" ? "My record" : "Residents"}</h2>
      {error && <p className="error">{error}</p>}

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
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {residents.map((r) => (
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
                    <td>
                      <button className="link danger" onClick={() => void remove(r)}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {residents.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted">
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
