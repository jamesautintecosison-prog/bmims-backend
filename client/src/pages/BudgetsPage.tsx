import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./incidents.css";
import "./staff.css";
import "./budgets.css";

interface Budget {
  budget_id: number;
  committee_id: number;
  fiscal_year: string;
  allocated_amount: string | number;
  remaining_amount: string | number;
}
interface Expense {
  expense_id: number;
  budget_id: number;
  approved_by_staff_id: number;
  description: string;
  amount: string | number;
  date_incurred: string;
}
interface Committee {
  committee_id: number;
  committee_name: string;
}
interface StaffRow {
  staff_id: number;
  first_name: string;
  last_name: string;
}

const peso = (value: string | number) =>
  Number(value).toLocaleString("en-PH", { style: "currency", currency: "PHP" });

// Budget cards and expense log. Logging an expense fires the database trigger
// that deducts it from the budget, and refuses it if the balance is too low.
// Admins see every committee; staff see only the committees they belong to
// (row-level security), so the same page shows different data per tier.
export function BudgetsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expense, setExpense] = useState({ budgetId: "", description: "", amount: "" });
  const [newBudget, setNewBudget] = useState({
    committeeId: "",
    fiscalYear: String(new Date().getFullYear()),
    allocated: "",
  });

  const load = useCallback(async () => {
    try {
      const [b, e, c, s] = await Promise.all([
        api<Budget[]>("/budgets?limit=200"),
        api<Expense[]>("/expenses?limit=200"),
        api<Committee[]>("/committees?limit=200"),
        api<StaffRow[]>("/staff?limit=200"),
      ]);
      setBudgets(b);
      setExpenses(e);
      setCommittees(c);
      setStaff(s);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
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
  const staffName = useMemo(
    () => new Map(staff.map((s) => [s.staff_id, `${s.first_name} ${s.last_name}`])),
    [staff],
  );
  const budgetLabel = useMemo(
    () =>
      new Map(
        budgets.map((b) => [b.budget_id, `${committeeName.get(b.committee_id) ?? `#${b.committee_id}`} ${b.fiscal_year}`]),
      ),
    [budgets, committeeName],
  );

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
    try {
      await action();
      await load();
    } catch (err) {
      // e.g. "Insufficient budget: expense of 999999 exceeds the remaining balance..." (HTTP 409)
      setError(errorMessage(err));
    }
  }

  const addExpense = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/expenses", {
        method: "POST",
        body: {
          budget_id: Number(expense.budgetId),
          description: expense.description,
          amount: Number(expense.amount),
        },
      });
      setExpense({ budgetId: "", description: "", amount: "" });
      setNotice("Expense saved. The database reduced the budget automatically.");
    });
  };

  const createBudget = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api("/budgets", {
        method: "POST",
        body: {
          committee_id: Number(newBudget.committeeId),
          fiscal_year: newBudget.fiscalYear,
          allocated_amount: Number(newBudget.allocated),
        },
      });
      setNewBudget({ ...newBudget, committeeId: "", allocated: "" });
    });
  };

  return (
    <section>
      <h2>Budgets and expenses</h2>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {loading ? (
        <p className="muted">Loading...</p>
      ) : (
        <>
          <div className="budget-grid">
            {budgets.map((b) => {
              const allocated = Number(b.allocated_amount);
              const remaining = Number(b.remaining_amount);
              const percentLeft = allocated > 0 ? Math.max(0, Math.min(100, (remaining / allocated) * 100)) : 0;
              return (
                <div className="budget-card" key={b.budget_id}>
                  <h3>{committeeName.get(b.committee_id) ?? `Committee #${b.committee_id}`}</h3>
                  <span className="muted">Fiscal year {b.fiscal_year}</span>
                  <div className="amount">{peso(remaining)}</div>
                  <span className="muted">remaining of {peso(allocated)}</span>
                  <div className={`meter${percentLeft < 15 ? " low" : ""}`}>
                    <span style={{ width: `${percentLeft}%` }} />
                  </div>
                  <span className="muted">{percentLeft.toFixed(0)}% left</span>
                </div>
              );
            })}
            {budgets.length === 0 && <p className="muted">No budgets visible to you.</p>}
          </div>

          <form className="card stack" onSubmit={addExpense}>
            <strong>Log an expense</strong>
            <div className="row">
              <select
                value={expense.budgetId}
                onChange={(e) => setExpense({ ...expense, budgetId: e.target.value })}
                required
              >
                <option value="">Budget...</option>
                {budgets.map((b) => (
                  <option key={b.budget_id} value={b.budget_id}>
                    {budgetLabel.get(b.budget_id)}
                  </option>
                ))}
              </select>
              <input
                className="grow"
                placeholder="What was it for?"
                value={expense.description}
                onChange={(e) => setExpense({ ...expense, description: e.target.value })}
                required
              />
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Amount"
                value={expense.amount}
                onChange={(e) => setExpense({ ...expense, amount: e.target.value })}
                required
              />
              <button type="submit">Save expense</button>
            </div>
            <span className="muted">
              Spending more than the remaining balance is refused by the database, so the budget can never go below
              zero.
            </span>
          </form>

          {isAdmin && (
            <form className="card stack" onSubmit={createBudget}>
              <strong>Set up a committee budget</strong>
              <div className="row">
                <select
                  value={newBudget.committeeId}
                  onChange={(e) => setNewBudget({ ...newBudget, committeeId: e.target.value })}
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
                  placeholder="Year"
                  pattern="[0-9]{4}"
                  value={newBudget.fiscalYear}
                  onChange={(e) => setNewBudget({ ...newBudget, fiscalYear: e.target.value })}
                  required
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Allocated amount"
                  value={newBudget.allocated}
                  onChange={(e) => setNewBudget({ ...newBudget, allocated: e.target.value })}
                  required
                />
                <button type="submit">Create budget</button>
              </div>
            </form>
          )}

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Budget</th>
                  <th>Description</th>
                  <th className="num">Amount</th>
                  <th>Approved by</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.expense_id}>
                    <td>{x.date_incurred.slice(0, 10)}</td>
                    <td>{budgetLabel.get(x.budget_id) ?? `#${x.budget_id}`}</td>
                    <td>{x.description}</td>
                    <td className="num">{peso(x.amount)}</td>
                    <td>{staffName.get(x.approved_by_staff_id) ?? `#${x.approved_by_staff_id}`}</td>
                  </tr>
                ))}
                {expenses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No expenses logged.
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
