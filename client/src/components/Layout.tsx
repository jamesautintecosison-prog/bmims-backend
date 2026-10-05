import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth, type Role } from "../auth/AuthContext";

interface NavItem {
  to: string;
  label: string;
  roles: Role[];
}

// Each tier sees only the screens that make sense for it.
// More screens are added here as they are built.
const NAV: NavItem[] = [
  { to: "/residents", label: "Residents", roles: ["admin", "staff"] },
  { to: "/profile", label: "My record", roles: ["resident"] },
  { to: "/requests", label: "Service requests", roles: ["admin", "staff", "resident"] },
];

export function Layout() {
  const { user, logout } = useAuth();
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="shell">
      <header className="topbar">
        <strong>BMIMS</strong>
        <nav>
          {NAV.filter((item) => item.roles.includes(user.role)).map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <span className={`badge badge-${user.role}`}>{user.role}</span>
          <span>{user.username}</span>
          <button className="link" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
