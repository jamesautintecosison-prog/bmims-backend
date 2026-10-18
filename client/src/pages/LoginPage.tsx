import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./login.css";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate("/", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp">
      <div className="lp-overlay" />

      <div className="lp-inner">
        <section className="lp-info">
          <p className="lp-kicker">Mahayag, San Miguel, Bohol</p>
          <h1>Barangay Mahayag</h1>
          <p className="lp-sub">Integrated Management System (BMIMS)</p>
          <p className="lp-lead">
            One place for the barangay's services and records. Residents can ask for certificates and follow
            their requests online, and barangay officials can handle them faster, with a clear record of who did
            what.
          </p>

          <h2>What you can do here</h2>
          <ul className="lp-list">
            <li>Request a barangay clearance, certificate of indigency, residency certificate, or business permit.</li>
            <li>Report an incident and follow its progress.</li>
            <li>Join barangay programs such as vaccination drives and livelihood training.</li>
            <li>Track every request, from submitted to ready for pick-up.</li>
          </ul>

          <div className="lp-roles">
            <div className="lp-role">
              <strong>Residents</strong>
              See and manage only your own requests and records.
            </div>
            <div className="lp-role">
              <strong>Barangay staff</strong>
              Process requests, incidents, and expenses for your committee.
            </div>
            <div className="lp-role">
              <strong>Barangay officials</strong>
              See the whole barangay, manage staff and budgets, and review the audit trail.
            </div>
          </div>
        </section>

        <section className="lp-card">
          <h2>Sign in</h2>
          <p className="lp-hint">
            Use the username and password given to you by the barangay office. You can change your password after
            you sign in.
          </p>
          <form onSubmit={submit}>
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </label>
            <label>
              Password
              <span className="lp-pass">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)}>
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <p className="lp-forgot">Forgot your password? Ask the barangay office to reset it.</p>
          </form>
        </section>
      </div>

      <footer className="lp-footer">Barangay Mahayag, San Miguel, Bohol</footer>
    </div>
  );
}
