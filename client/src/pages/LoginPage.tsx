import { useState, type FormEvent } from "react";
import { FileText, HeartHandshake, ShieldAlert, ShieldCheck } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { canAccessAppRoute, normalizeAppRoute } from "../auth/routeAccess";
import { BarangayLogo } from "../components/BarangayLogo";
import "./login.css";

const DEFAULT_ROUTE = "/";

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestedLocation = (location.state as {
    from?: { pathname?: unknown; search?: unknown; hash?: unknown };
  } | null)?.from;
  const requestedRoute = normalizeAppRoute(requestedLocation?.pathname);
  const requestedSearch =
    typeof requestedLocation?.search === "string" && requestedLocation.search.startsWith("?")
      ? requestedLocation.search
      : "";
  const requestedHash =
    typeof requestedLocation?.hash === "string" && requestedLocation.hash.startsWith("#")
      ? requestedLocation.hash
      : "";
  const requestedPath = requestedRoute ? `${requestedRoute}${requestedSearch}${requestedHash}` : DEFAULT_ROUTE;

  function destinationFor(role: "admin" | "staff" | "resident") {
    if (!requestedLocation) return { path: DEFAULT_ROUTE };
    if (!requestedRoute) return { path: DEFAULT_ROUTE, notice: "That requested service is unavailable." };
    if (!canAccessAppRoute(requestedRoute, role)) {
      return { path: DEFAULT_ROUTE, notice: "Your account does not have permission to access that service." };
    }
    return { path: requestedPath };
  }

  if (user) {
    const destination = destinationFor(user.role);
    return <Navigate to={destination.path} replace state={destination.notice ? { notice: destination.notice } : undefined} />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const authenticatedUser = await login(username.trim(), password);
      const destination = destinationFor(authenticatedUser.role);
      navigate(destination.path, {
        replace: true,
        state: destination.notice ? { notice: destination.notice } : undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lp">
      <header className="portal-nav" id="top">
        <a className="portal-brand" href="#top">
          <span className="portal-logo"><BarangayLogo /></span>
          <span className="portal-brand-copy">
            <strong>Barangay Mahayag</strong>
            <small>Integrated Management System</small>
          </span>
        </a>
        <nav className="portal-links" aria-label="Portal navigation">
          <a href="#services">Services</a>
          <a href="#community">Community</a>
          <a className="portal-signin-link" href="#login">Sign in</a>
        </nav>
      </header>
      <main className="lp-inner">
        <section className="lp-info" aria-labelledby="portal-title">
          <p className="lp-kicker">Mahayag · Serbisyo online</p>
          <h1 id="portal-title">Ano'ng kailangan mo <span>sa barangay ngayon?</span></h1>
          <p className="lp-lead">
            Request a certificate, file a report, or check on an application. Your records stay with you, and
            only the people who need them can open them.
          </p>

          <section className="portal-services" id="services" aria-labelledby="services-title">
            <div className="portal-section-heading">
              <div>
                <p className="portal-label">Start here</p>
                <h2 id="services-title">Services online</h2>
              </div>
              <Link to="/requests">Sign in to continue</Link>
            </div>
            <div className="portal-service-grid">
              <Link className="portal-service" to="/requests">
                <span className="portal-service-icon" aria-hidden="true"><FileText size={20} /></span>
                <span className="portal-service-copy">
                  <strong>Certificates &amp; Permits</strong>
                  <small>Clearance, residency, indigency, and more.</small>
                </span>
                <span className="portal-arrow" aria-hidden="true">›</span>
              </Link>
              <Link className="portal-service" to="/incidents">
                <span className="portal-service-icon" aria-hidden="true"><ShieldAlert size={20} /></span>
                <span className="portal-service-copy">
                  <strong>Report an Incident</strong>
                  <small>Submit a report and follow its progress.</small>
                </span>
                <span className="portal-arrow" aria-hidden="true">›</span>
              </Link>
              <Link className="portal-service" to="/programs">
                <span className="portal-service-icon" aria-hidden="true"><HeartHandshake size={20} /></span>
                <span className="portal-service-copy">
                  <strong>Community programs</strong>
                  <small>Explore health and livelihood programs.</small>
                </span>
                <span className="portal-arrow" aria-hidden="true">›</span>
              </Link>
            </div>
          </section>

          <div className="lp-roles" id="community">
            <div className="card lp-role">
              <strong>Residents</strong>
              Follow your applications and manage your records.
            </div>
            <div className="card lp-role">
              <strong>Barangay staff</strong>
              Handle requests and reports for your committee.
            </div>
            <div className="card lp-role">
              <strong>Barangay officials</strong>
              Oversee services, staff, budgets, and records.
            </div>
          </div>
        </section>

        <section className="card lp-card" id="login" aria-labelledby="login-title">
          <div className="lp-card-heading">
            <span className="lp-card-mark" aria-hidden="true"><ShieldCheck size={19} /></span>
            <div>
              <p className="portal-label">Secure portal access</p>
              <h2 id="login-title">Sign in</h2>
            </div>
          </div>
          <p className="lp-hint">
            Use the username and password given to you by the barangay office. You can change your password after
            you sign in.
          </p>
          <form onSubmit={submit} aria-busy={busy}>
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
                <button
                  type="button"
                  className="secondary"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((s) => !s)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
            <p className="lp-forgot">Forgot your password? Ask the barangay office to reset it.</p>
          </form>
        </section>
      </main>

      <footer className="lp-footer">Barangay Mahayag, San Miguel, Bohol</footer>
    </div>
  );
}
