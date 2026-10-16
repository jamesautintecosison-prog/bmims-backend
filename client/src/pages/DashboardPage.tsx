import { useAuth } from "../auth/AuthContext";
import { AdminDashboard } from "./AdminDashboard";
import { ResidentDashboard } from "./ResidentDashboard";
import { StaffDashboard } from "./StaffDashboard";

// Home page. Each tier gets its own layout and its own numbers; what the
// numbers cover is decided by the database (row-level security), not here.
export function DashboardPage() {
  const { user } = useAuth();
  if (user?.role === "admin") return <AdminDashboard />;
  if (user?.role === "staff") return <StaffDashboard />;
  return <ResidentDashboard />;
}
