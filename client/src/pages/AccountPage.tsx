import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./incidents.css";
import "./account.css";

// Every signed-in user, whatever their tier, can change their own password.
// The API checks the current password first; the database then updates only
// the caller's own account.
export function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (next.length < 12) {
      setError("Use at least 12 characters for the new password.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    if (next === current) {
      setError("The new password must be different from the current one.");
      return;
    }

    setBusy(true);
    try {
      await api("/account/password", {
        method: "POST",
        body: { current_password: current, new_password: next },
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Account</h2>

      <form className="card stack account" onSubmit={submit}>
        <dl>
          <dt>Username</dt>
          <dd>{user?.username}</dd>
          <dt>Role</dt>
          <dd>{user?.role}</dd>
        </dl>

        <strong>Change password</strong>
        <label>
          Current password
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
        </label>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        <p className="hint">At least 12 characters. A passphrase of several words works well.</p>

        {error && <p className="error">{error}</p>}
        {done && <p className="success">Your password has been changed.</p>}

        <div>
          <button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
