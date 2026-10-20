import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import "./account.css";

type PasswordField = "current" | "next" | "confirm";

const ROLE_NAMES: Record<string, string> = {
  admin: "Administrator",
  staff: "Staff",
  resident: "Resident",
};

export function AccountPage() {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    current: false,
    next: false,
    confirm: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const username = user?.username ?? "Account";
  const initials = username.trim().slice(0, 2).toUpperCase() || "BM";
  const role = user ? ROLE_NAMES[user.role] ?? user.role : "Signed-in user";

  function toggleVisibility(field: PasswordField) {
    setVisible((previous) => ({ ...previous, [field]: !previous[field] }));
  }

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

  function passwordInput(
    field: PasswordField,
    label: string,
    value: string,
    update: (value: string) => void,
    autoComplete: "current-password" | "new-password",
  ) {
    const inputId = `account-password-${field}`;
    const visibleNow = visible[field];
    return (
      <div className="account-field">
        <label htmlFor={inputId}>{label}</label>
        <div className="account-password-control">
          <input
            id={inputId}
            type={visibleNow ? "text" : "password"}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => update(event.target.value)}
            required
            minLength={field === "current" ? undefined : 12}
            maxLength={200}
            disabled={busy}
          />
          <button
            type="button"
            className="account-password-toggle"
            aria-label={`${visibleNow ? "Hide" : "Show"} ${label.toLowerCase()}`}
            aria-pressed={visibleNow}
            onClick={() => toggleVisibility(field)}
            disabled={busy}
          >
            {visibleNow ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="account-page">
      <header className="account-page-header">
        <p className="account-eyebrow">Personal settings</p>
        <h1>Account</h1>
        <p>Manage your profile information and keep your account secure.</p>
      </header>

      <div className="account-content">
        <article className="card account-profile-card">
          <div className="account-profile-heading">
            <span className="account-section-icon"><UserRound size={19} aria-hidden="true" /></span>
            <div>
              <h2>Profile information</h2>
              <p>Your signed-in BMIMS account</p>
            </div>
          </div>
          <div className="account-profile-identity">
            <span className="account-avatar" aria-label={`${username} initials`}>{initials}</span>
            <div className="account-identity-copy">
              <strong>{username}</strong>
              <span className="account-role-badge">{role}</span>
            </div>
          </div>
          <dl className="account-information">
            <div><dt>Username</dt><dd>{username}</dd></div>
            <div><dt>Role</dt><dd>{role}</dd></div>
          </dl>
        </article>

        <form className="card account-security-card" onSubmit={submit}>
          <div className="account-profile-heading">
            <span className="account-section-icon"><ShieldCheck size={19} aria-hidden="true" /></span>
            <div>
              <h2>Password &amp; Security</h2>
              <p>Change your password to protect your account.</p>
            </div>
          </div>

          <div className="account-password-fields">
            {passwordInput("current", "Current password", current, setCurrent, "current-password")}
            {passwordInput("next", "New password", next, setNext, "new-password")}
            {passwordInput("confirm", "Confirm new password", confirm, setConfirm, "new-password")}
          </div>

          <div className="account-password-guidance">
            <KeyRound size={17} aria-hidden="true" />
            <p>Use at least 12 characters. A passphrase of several words is easier to remember and harder to guess.</p>
          </div>

          {error && <p className="account-message account-error" role="alert">{error}</p>}
          {done && <p className="account-message account-success" role="status">Your password has been changed.</p>}

          <div className="account-form-actions">
            <button type="submit" disabled={busy}>
              {busy ? "Updating password…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
