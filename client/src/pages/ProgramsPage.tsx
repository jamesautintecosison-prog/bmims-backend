import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { Assignment, Committee, Person } from "../api/types";
import "./serviceRequests.css";
import "./incidents.css";
import "./budgets.css";
import "./programs.css";

interface Program {
  program_id: number;
  committee_id: number;
  program_name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
}
interface Enrollment {
  enrollment_id: number;
  resident_id: number;
  program_id: number;
  enrollment_date: string;
  status: string;
}

const ENROLLMENT_STATUSES = ["Enrolled", "Completed", "Dropped"];
const day = (iso: string) => iso.slice(0, 10);
const EMPTY_PROGRAM = { committeeId: "", name: "", description: "", start: "", end: "" };

// Health and livelihood programs and who is enrolled in them: the
// resident <-> program junction table, with its own enrollment date and status.
//  - residents see the programs and their own enrollments (read-only)
//  - staff enroll residents in their own committees' programs
//  - admin does that for every committee, and creates or deletes programs
export function ProgramsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const isStaff = user?.role === "staff";
  const isResident = user?.role === "resident";
  const canManage = isAdmin || isStaff;

  const [programs, setPrograms] = useState<Program[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [residents, setResidents] = useState<Person[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [enroll, setEnroll] = useState({ residentId: "", programId: "" });
  const [newProgram, setNewProgram] = useState(EMPTY_PROGRAM);

  const load = useCallback(async () => {
    try {
      const [p, e, c, r] = await Promise.all([
        api<Program[]>("/health-programs?limit=200"),
        api<Enrollment[]>("/enrollments?limit=200"),
        api<Committee[]>("/committees?limit=200"),
        api<Person[]>("/residents?limit=200"),
      ]);
      setPrograms(p);
      setEnrollments(e);
      setCommittees(c);
      setResidents(r);
      // staff need to know which committees are theirs; other tiers do not
      if (isStaff) setAssignments(await api<Assignment[]>("/staff-assignments?limit=200"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    void load();
  }, [load]);

  const committeeName = useMemo(
    () => new Map(committees.map((c) => [c.committee_id, c.committee_name])),
    [committees],
  );
  const residentName = useMemo(
    () => new Map(residents.map((r) => [r.resident_id, `${r.first_name} ${r.last_name}`])),
    [residents],
  );
  const programName = useMemo(() => new Map(programs.map((p) => [p.program_id, p.program_name])), [programs]);
  const programCommittee = useMemo(
    () => new Map(programs.map((p) => [p.program_id, p.committee_id])),
    [programs],
  );

  // committees this person may manage: everything for admin, their own for staff
  const myCommittees = useMemo(
    () => new Set(assignments.filter((a) => a.staff_id === user?.staff_id).map((a) => a.committee_id)),
    [assignments, user?.staff_id],
  );
  const mayManage = (committeeId: number) => isAdmin || (isStaff && myCommittees.has(committeeId));

  const manageablePrograms = programs.filter((p) => mayManage(p.committee_id));
  const enrolledCount = (programId: number) =>
    enrollments.filter((e) => e.program_id === programId && e.status !== "Dropped").length;
  const myEnrollment = (programId: number) => enrollments.find((e) => e.program_id === programId);
  const activeEnrollments = enrollments.filter((enrollment) => enrollment.status === "Enrolled").length;
  const completedEnrollments = enrollments.filter((enrollment) => enrollment.status === "Completed").length;

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (err) {
      // e.g. "A record with this value already exists" when the resident is already enrolled (HTTP 409)
      setError(errorMessage(err));
    }
  }

  const enrollResident = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/enrollments", {
        method: "POST",
        body: { resident_id: Number(enroll.residentId), program_id: Number(enroll.programId) },
      });
      setEnroll({ residentId: "", programId: "" });
      setNotice("Resident enrolled.");
    });
  };

  const changeStatus = (enrollment: Enrollment, status: string) =>
    void run(async () => {
      await api(`/enrollments/${enrollment.enrollment_id}`, { method: "PATCH", body: { status } });
    });

  const createProgram = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/health-programs", {
        method: "POST",
        body: {
          committee_id: Number(newProgram.committeeId),
          program_name: newProgram.name,
          description: newProgram.description.trim() || null,
          start_date: newProgram.start,
          end_date: newProgram.end || null,
        },
      });
      setNewProgram(EMPTY_PROGRAM);
      setNotice("Program created.");
    });
  };

  const deleteProgram = (program: Program) => {
    if (!window.confirm(`Delete the program "${program.program_name}"?`)) return;
    void run(async () => {
      await api(`/health-programs/${program.program_id}`, { method: "DELETE" });
    });
  };

  return (
    <section>
      <h2>Programs</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="module-summary-grid" aria-label="Program summary" aria-busy={loading}>
        <article className="module-summary-card"><span>Programs</span><strong>{loading ? "—" : programs.length}</strong><small>Available programs</small></article>
        <article className="module-summary-card"><span>Active enrollments</span><strong>{loading ? "—" : activeEnrollments}</strong><small>Residents currently enrolled</small></article>
        <article className="module-summary-card"><span>Completed enrollments</span><strong>{loading ? "—" : completedEnrollments}</strong><small>Residents who completed a program</small></article>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <div className="budget-grid">
            {programs.map((p) => {
              const mine = myEnrollment(p.program_id);
              return (
                <div className="budget-card program-card" key={p.program_id}>
                  <h3>{p.program_name}</h3>
                  <span className="muted">{committeeName.get(p.committee_id) ?? `Committee #${p.committee_id}`}</span>
                  <div className="dates">
                    {day(p.start_date)} to {p.end_date ? day(p.end_date) : "no end date"}
                  </div>
                  {p.description && <p>{p.description}</p>}
                  <div className="foot">
                    {isResident ? (
                      mine ? (
                        <span className={`status status-${mine.status.toLowerCase()}`}>{mine.status}</span>
                      ) : (
                        <span className="muted">Not enrolled. Ask the barangay office to enroll you.</span>
                      )
                    ) : (
                      <span className="muted">
                        {isAdmin || mayManage(p.committee_id) ? `${enrolledCount(p.program_id)} enrolled` : "Another committee"}
                      </span>
                    )}
                    {isAdmin && (
                      <button type="button" className="link danger" onClick={() => deleteProgram(p)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {programs.length === 0 && <p className="muted">No programs yet.</p>}
          </div>

          {isAdmin && (
            <form className="card stack" onSubmit={createProgram}>
              <strong>Create a program</strong>
              <div className="row">
                <select
                  value={newProgram.committeeId}
                  onChange={(e) => setNewProgram({ ...newProgram, committeeId: e.target.value })}
                  required
                >
                  <option value="">Committee...</option>
                  {committees.map((c) => (
                    <option key={c.committee_id} value={c.committee_id}>
                      {c.committee_name}
                    </option>
                  ))}
                </select>
                <input
                  className="grow"
                  placeholder="Program name"
                  value={newProgram.name}
                  onChange={(e) => setNewProgram({ ...newProgram, name: e.target.value })}
                  required
                />
              </div>
              <textarea
                placeholder="Description (optional)"
                value={newProgram.description}
                onChange={(e) => setNewProgram({ ...newProgram, description: e.target.value })}
              />
              <div className="row">
                <label className="muted">
                  Starts{" "}
                  <input
                    type="date"
                    value={newProgram.start}
                    onChange={(e) => setNewProgram({ ...newProgram, start: e.target.value })}
                    required
                  />
                </label>
                <label className="muted">
                  Ends (optional){" "}
                  <input
                    type="date"
                    value={newProgram.end}
                    onChange={(e) => setNewProgram({ ...newProgram, end: e.target.value })}
                  />
                </label>
                <button type="submit">Create program</button>
              </div>
            </form>
          )}

          {canManage && (
            <form className="card stack" onSubmit={enrollResident}>
              <strong>Enroll a resident</strong>
              <div className="row">
                <select
                  value={enroll.residentId}
                  onChange={(e) => setEnroll({ ...enroll, residentId: e.target.value })}
                  required
                >
                  <option value="">Resident...</option>
                  {residents.map((r) => (
                    <option key={r.resident_id} value={r.resident_id}>
                      {r.first_name} {r.last_name}
                    </option>
                  ))}
                </select>
                <select
                  value={enroll.programId}
                  onChange={(e) => setEnroll({ ...enroll, programId: e.target.value })}
                  required
                >
                  <option value="">Program...</option>
                  {manageablePrograms.map((p) => (
                    <option key={p.program_id} value={p.program_id}>
                      {p.program_name}
                    </option>
                  ))}
                </select>
                <button type="submit">Enroll</button>
              </div>
              {isStaff && manageablePrograms.length === 0 && (
                <span className="muted">You can enroll residents in programs of the committees you belong to.</span>
              )}
            </form>
          )}

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  {!isResident && <th>Resident</th>}
                  <th>Program</th>
                  <th>Committee</th>
                  <th>Enrolled on</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const committeeId = programCommittee.get(e.program_id);
                  return (
                    <tr key={e.enrollment_id}>
                      {!isResident && <td>{residentName.get(e.resident_id) ?? `#${e.resident_id}`}</td>}
                      <td>{programName.get(e.program_id) ?? `#${e.program_id}`}</td>
                      <td>{committeeId !== undefined ? (committeeName.get(committeeId) ?? `#${committeeId}`) : "-"}</td>
                      <td>{day(e.enrollment_date)}</td>
                      <td>
                        {committeeId !== undefined && mayManage(committeeId) ? (
                          <select value={e.status} onChange={(ev) => changeStatus(e, ev.target.value)}>
                            {ENROLLMENT_STATUSES.map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`status status-${e.status.toLowerCase()}`}>{e.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {enrollments.length === 0 && (
                  <tr>
                    <td colSpan={isResident ? 4 : 5} className="muted">
                      {isResident ? "You are not enrolled in any program." : "No enrollments to show."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
