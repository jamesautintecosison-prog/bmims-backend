import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  ContactRound,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings2,
  ShieldAlert,
  Wallet,
  Users,
  X,
  BriefcaseBusiness,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { canAccessAppRoute, normalizeAppRoute, ROUTE_ACCESS, type AppRoute } from "../auth/routeAccess";
import { useAuth, type Role } from "../auth/AuthContext";
import { BarangayLogo } from "./BarangayLogo";

interface NavItem {
  to: AppRoute;
  label: string;
  roles: readonly Role[];
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", roles: ROUTE_ACCESS["/"], icon: LayoutDashboard },
  { to: "/residents", label: "Residents", roles: ROUTE_ACCESS["/residents"], icon: Users },
  { to: "/profile", label: "My record", roles: ROUTE_ACCESS["/profile"], icon: ContactRound },
  { to: "/requests", label: "Service requests", roles: ROUTE_ACCESS["/requests"], icon: FileText },
  { to: "/incidents", label: "Incidents", roles: ROUTE_ACCESS["/incidents"], icon: ShieldAlert },
  { to: "/programs", label: "Programs", roles: ROUTE_ACCESS["/programs"], icon: HeartHandshake },
  { to: "/budgets", label: "Budgets", roles: ROUTE_ACCESS["/budgets"], icon: Wallet },
  { to: "/directory", label: "Directory", roles: ROUTE_ACCESS["/directory"], icon: BookOpen },
  { to: "/staff", label: "Staff", roles: ROUTE_ACCESS["/staff"], icon: BriefcaseBusiness },
  { to: "/audit", label: "Audit log", roles: ROUTE_ACCESS["/audit"], icon: ListChecks },
  { to: "/account", label: "Account", roles: ROUTE_ACCESS["/account"], icon: Settings2 },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const currentPath = normalizeAppRoute(location.pathname);
  const currentPage = NAV.find((item) => item.to === currentPath) ?? NAV[0];
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (currentPath && !canAccessAppRoute(currentPath, user.role)) {
    return <Navigate to="/" replace state={{ notice: "Your account does not have permission to access that page." }} />;
  }
  const notice = (location.state as { notice?: unknown } | null)?.notice;

  return (
    <div className="app-shell">
      <aside className={`sidebar${mobileNavOpen ? " mobile-open" : ""}`}>
        <div className="sidebar-brand" aria-label="Municipality branding">
          <div className="brand-mark">
            <BarangayLogo />
          </div>
          <div className="brand-copy">
            <span className="brand-kicker">BARANGAY MAHAYAG</span>
            <span className="brand-name">BMIMS</span>
            <span className="brand-location">San Miguel, Bohol</span>
          </div>
          <button
            type="button"
            className="sidebar-menu-toggle"
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Sidebar navigation">
          {NAV.filter((item) => item.roles.includes(user.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileNavOpen(false)}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              <item.icon className="nav-icon" size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">Mahayag · San Miguel · Bohol</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs" aria-label="Breadcrumb">
            <span>Barangay portal</span>
            <ChevronRight size={15} aria-hidden="true" />
            <strong>{currentPage.label}</strong>
          </div>
          <div className="topbar-user">
            <span className="avatar-pill">{user.username.slice(0, 2).toUpperCase()}</span>
            <span className="topbar-user-name"><strong>{user.username}</strong><small>{user.role}</small></span>
            <button type="button" className="topbar-signout" onClick={logout} aria-label="Sign out">
              <LogOut size={17} aria-hidden="true" /><span>Sign out</span>
            </button>
          </div>
        </header>
        <main className="page-shell">
          {typeof notice === "string" && <p className="notice" role="status">{notice}</p>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
