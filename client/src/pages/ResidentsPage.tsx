import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  House,
  KeyRound,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [genderFilter, setGenderFilter] = useState("All");
  const [householdFilter, setHouseholdFilter] = useState("All");
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Resident | null>(null);
  const [pendingPasswordReset, setPendingPasswordReset] = useState<{ resident: Resident; account: UserRow } | null>(null);

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

  useEffect(() => {
    const closeDialogs = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowAddForm(false);
        setPendingDelete(null);
        setPendingPasswordReset(null);
      }
    };
    window.addEventListener("keydown", closeDialogs);
    return () => window.removeEventListener("keydown", closeDialogs);
  }, []);

  const accountByResident = useMemo(() => {
    const map = new Map<number, UserRow>();
    users.forEach((entry) => {
      if (entry.resident_id !== null) map.set(entry.resident_id, entry);
    });
    return map;
  }, [users]);

  const totalResidents = residents.length;
  const activeResidents = residents.filter((resident) => resident.resident_status === "Active").length;
  const withoutAccount = residents.filter(
    (resident) => resident.resident_status === "Active" && !accountByResident.has(resident.resident_id),
  ).length;
  const withAccount = residents.filter((resident) => accountByResident.has(resident.resident_id)).length;
  const statusOptions = useMemo(
    () => Array.from(new Set(residents.map((resident) => resident.resident_status))).sort(),
    [residents],
  );
  const genderOptions = useMemo(
    () => Array.from(new Set(residents.map((resident) => resident.gender))).sort(),
    [residents],
  );
  const householdOptions = useMemo(
    () =>
      Array.from(new Set(residents.map((resident) => resident.household_id).filter((id): id is number => id !== null))).sort(
        (first, second) => first - second,
      ),
    [residents],
  );

  const filteredResidents = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return residents.filter((resident) => {
      const fullName = `${resident.first_name} ${resident.last_name}`.toLowerCase();
      const matchesSearch =
        search.length === 0 ||
        fullName.includes(search) ||
        resident.resident_id.toString().includes(search) ||
        (resident.contact_number ?? "").toLowerCase().includes(search);

      const matchesStatus = statusFilter === "All" || resident.resident_status === statusFilter;
      const matchesGender = genderFilter === "All" || resident.gender === genderFilter;
      const matchesHousehold =
        householdFilter === "All" ||
        (householdFilter === "None" ? resident.household_id === null : resident.household_id === Number(householdFilter));

      return matchesSearch && matchesStatus && matchesGender && matchesHousehold;
    });
  }, [genderFilter, householdFilter, residents, searchTerm, statusFilter]);

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
      setShowAddForm(false);
    });
  };

  const remove = () => {
    if (!pendingDelete) return;
    const resident = pendingDelete;
    setPendingDelete(null);
    void run(async () => {
      await api(`/residents/${resident.resident_id}`, { method: "DELETE" });
    });
  };

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
        rows: result.created.map((credential) => ({
          name: credential.name,
          username: credential.username,
          password: credential.temporary_password,
        })),
      });
      if (result.created.length === 0) setNotice("Every active resident already has a login.");
      if (result.remaining > 0) {
        setNotice(`${result.remaining} more residents still need a login. Run it again after saving these.`);
      }
    });

  const resetPassword = () => {
    if (!pendingPasswordReset) return;
    const { resident, account } = pendingPasswordReset;
    setPendingPasswordReset(null);
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
    const text = creds.rows.map((row) => `${row.name}\t${row.username}\t${row.password}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied. Paste it somewhere private, then dismiss this box.");
    } catch {
      setNotice("Copy failed. Select the table and copy it by hand.");
    }
  }

  function downloadCsv() {
    if (!creds) return;
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      "name,username,temporary_password",
      ...creds.rows.map((row) => [row.name, row.username, row.password].map(quote).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resident-logins.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function exportResidentsCsv() {
    const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      ["resident_id", "name", "birth_date", "gender", "contact_number", "household_id", "resident_status"]
        .map(quote)
        .join(","),
      ...filteredResidents.map((resident) =>
        [
          resident.resident_id.toString(),
          `${resident.first_name} ${resident.last_name}`,
          resident.birth_date,
          resident.gender,
          resident.contact_number ?? "",
          resident.household_id?.toString() ?? "",
          resident.resident_status,
        ]
          .map(quote)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "resident-directory.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function getStatusClass(status: string): string {
    if (status === "Active") return "badge active";
    if (status === "Inactive") return "badge inactive";
    return "badge pending";
  }

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("All");
    setGenderFilter("All");
    setHouseholdFilter("All");
  };

  const statCards = [
    { label: "Total residents", value: totalResidents, icon: Users, tone: "forest" },
    { label: "Active residents", value: activeResidents, icon: UserCheck, tone: "mint" },
    { label: "Without accounts", value: withoutAccount, icon: UserRoundX, tone: "gold" },
    { label: "With accounts", value: withAccount, icon: ShieldCheck, tone: "blue" },
  ];

  return (
    <section className="residents" aria-labelledby="residents-title">
      <header className="residents-header">
        <div className="residents-heading-copy">
          <nav className="residents-breadcrumb" aria-label="Breadcrumb">
            <House size={14} aria-hidden="true" />
            <span>Dashboard</span>
            <ChevronRight size={14} aria-hidden="true" />
            <span aria-current="page">Residents</span>
          </nav>
          <h1 id="residents-title">Residents</h1>
          <p className="residents-subtitle">Resident records, household links, and account access</p>
        </div>
        <div className="residents-header-actions">
          <div className="resident-total-pill">
            <span>Records loaded</span>
            <strong>{totalResidents.toLocaleString()}</strong>
          </div>
          {isAdmin && (
            <button type="button" className="btn primary" onClick={() => setShowAddForm(true)}>
              <Plus size={17} aria-hidden="true" /> Add resident
            </button>
          )}
        </div>
      </header>

      <div className="stats-grid">
        {statCards.map((card) => (
          <article key={card.label} className={`stat-card stat-${card.tone}`}>
            <div className="stat-meta">
              <span className="stat-label">{card.label}</span>
              <strong className="stat-value">{card.value.toLocaleString()}</strong>
            </div>
            <div className="stat-icon" aria-hidden="true">
              <card.icon size={20} strokeWidth={1.8} />
            </div>
          </article>
        ))}
      </div>

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
              {creds.rows.map((row) => (
                <tr key={`${row.username}-${row.name}`}>
                  <td>{row.name}</td>
                  <td>
                    <code>{row.username}</code>
                  </td>
                  <td>
                    <code>{row.password}</code>
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
            <button type="button" className="btn secondary" onClick={() => void copyAll()}>
              Copy all
            </button>
            <button type="button" className="btn secondary" onClick={downloadCsv}>
              Download CSV
            </button>
            <button type="button" className="link-button" onClick={() => setCreds(null)}>
              I have saved them, dismiss
            </button>
          </div>
        </div>
      )}

      <div className="toolbar" aria-label="Resident filters">
        <label className="search-box">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            placeholder="Search name, ID, or contact"
            aria-label="Search residents by name, ID, or contact number"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <select className="filter-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          <option value="All">All statuses</option>
          {statusOptions.map((status) => <option key={status}>{status}</option>)}
        </select>

        <select className="filter-select" value={genderFilter} onChange={(event) => setGenderFilter(event.target.value)} aria-label="Filter by gender">
          <option value="All">All genders</option>
          {genderOptions.map((gender) => <option key={gender}>{gender}</option>)}
        </select>

        <select className="filter-select" value={householdFilter} onChange={(event) => setHouseholdFilter(event.target.value)} aria-label="Filter by household">
          <option value="All">All households</option>
          <option value="None">No household</option>
          {householdOptions.map((householdId) => <option key={householdId} value={householdId}>Household {householdId}</option>)}
        </select>

        <div className="toolbar-group">
          <button type="button" className="btn secondary" onClick={resetFilters}><RotateCcw size={15} aria-hidden="true" /> Reset</button>
          <button type="button" className="btn gold" onClick={exportResidentsCsv}><Download size={15} aria-hidden="true" /> Export CSV</button>
        </div>
      </div>

      {isAdmin && showAddForm && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAddForm(false); }}>
          <section className="resident-dialog" role="dialog" aria-modal="true" aria-labelledby="add-resident-title">
            <header className="dialog-header">
              <div><span className="dialog-kicker">Resident directory</span><h2 id="add-resident-title">Add resident</h2></div>
              <button type="button" className="icon-button" aria-label="Close add resident dialog" onClick={() => setShowAddForm(false)}><X size={18} /></button>
            </header>
            <form className="resident-form" onSubmit={add}>
              <label>First name<input placeholder="First name" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></label>
              <label>Last name<input placeholder="Last name" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></label>
              <label>Birth date<span className="input-with-icon"><CalendarDays size={16} aria-hidden="true" /><input type="date" value={form.birth_date} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} required /></span></label>
              <label>Gender<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option>Male</option><option>Female</option><option>Other</option></select></label>
              <label>Contact number<input placeholder="Contact number" value={form.contact_number} onChange={(event) => setForm({ ...form, contact_number: event.target.value })} /></label>
              <div className="dialog-actions"><button type="button" className="btn secondary" onClick={() => setShowAddForm(false)}>Cancel</button><button type="submit" className="btn primary"><Plus size={16} aria-hidden="true" /> Save resident</button></div>
            </form>
          </section>
        </div>
      )}

      {loading ? (
        <div className="resident-loading" role="status"><span className="loading-spinner" />Loading residents...</div>
      ) : (
        <div className="data-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Resident ID</th>
                <th>Name</th>
                <th>Birth Date</th>
                <th>Gender</th>
                <th>Contact</th>
                <th>Household ID</th>
                <th>{isAdmin ? "Account" : "Status"}</th>
                {isAdmin && <th className="actions-heading">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredResidents.map((resident) => {
                const account = accountByResident.get(resident.resident_id);
                const initials = `${resident.first_name[0] ?? ""}${resident.last_name[0] ?? ""}`.toUpperCase();

                return (
                  <tr key={resident.resident_id}>
                    <td><span className="resident-id">RES-{String(resident.resident_id).padStart(4, "0")}</span></td>
                    <td>
                      <div className="name-cell">
                        <span className="name-avatar">{initials}</span>
                        <span className="name-value">
                          {resident.first_name} {resident.last_name}
                        </span>
                      </div>
                    </td>
                    <td>{new Date(resident.birth_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td>{resident.gender}</td>
                    <td>{resident.contact_number ?? "—"}</td>
                    <td>{resident.household_id ?? "—"}</td>
                    <td>
                      {isAdmin ? (
                        account ? <span className="account-badge has-account"><Check size={14} aria-hidden="true" /> Account active</span> : <span className="account-badge no-account"><UserRoundX size={14} aria-hidden="true" /> No account</span>
                      ) : <span className={getStatusClass(resident.resident_status)}>{resident.resident_status}</span>}
                    </td>
                    {isAdmin && <td>
                      <div className="table-actions">
                        {account ? (
                          <button type="button" className="icon-button" aria-label={`Reset password for ${account.username}`} title="Reset password" onClick={() => setPendingPasswordReset({ resident, account })}><KeyRound size={16} /></button>
                        ) : resident.resident_status === "Active" ? (
                          <button type="button" className="action-button" onClick={() => provision([resident.resident_id], "Login created")}><UserPlus size={15} aria-hidden="true" /> Create login</button>
                        ) : null}
                        <button type="button" className="icon-button danger-icon" aria-label={`Delete ${resident.first_name} ${resident.last_name}`} title="Delete resident" onClick={() => setPendingDelete(resident)}><Trash2 size={16} /></button>
                      </div>
                    </td>}
                  </tr>
                );
              })}
              {filteredResidents.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="empty-state-cell">
                    <div className="empty-state">
                      <Users size={24} aria-hidden="true" />
                      <strong>No residents found</strong>
                      <span>Try adjusting your search or filters.</span>
                      <button type="button" className="btn secondary" onClick={resetFilters}>Reset filters</button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="data-footer">
            <span>Showing <strong>{filteredResidents.length}</strong> of {totalResidents} loaded records</span>
            <span className="data-limit-note">Up to 200 residents loaded</span>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingDelete(null); }}>
          <section className="resident-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-resident-title">
            <header className="dialog-header">
              <div><span className="dialog-kicker">This cannot be undone</span><h2 id="delete-resident-title">Delete resident?</h2></div>
              <button type="button" className="icon-button" aria-label="Close delete confirmation" onClick={() => setPendingDelete(null)}><X size={18} /></button>
            </header>
            <p>Delete <strong>{pendingDelete.first_name} {pendingDelete.last_name}</strong> from the resident directory?</p>
            <div className="dialog-actions"><button type="button" className="btn secondary" onClick={() => setPendingDelete(null)}>Cancel</button><button type="button" className="btn destructive" onClick={remove}><Trash2 size={16} aria-hidden="true" /> Delete resident</button></div>
          </section>
        </div>
      )}

      {pendingPasswordReset && (
        <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingPasswordReset(null); }}>
          <section className="resident-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-password-title">
            <header className="dialog-header">
              <div><span className="dialog-kicker">Account security</span><h2 id="reset-password-title">Reset password?</h2></div>
              <button type="button" className="icon-button" aria-label="Close password reset confirmation" onClick={() => setPendingPasswordReset(null)}><X size={18} /></button>
            </header>
            <p>The current password for <strong>{pendingPasswordReset.account.username}</strong> will stop working. A temporary password will be shown once.</p>
            <div className="dialog-actions"><button type="button" className="btn secondary" onClick={() => setPendingPasswordReset(null)}>Cancel</button><button type="button" className="btn primary" onClick={resetPassword}><KeyRound size={16} aria-hidden="true" /> Reset password</button></div>
          </section>
        </div>
      )}
    </section>
  );
}
