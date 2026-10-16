import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/AccountPage";
import { AuditPage } from "./pages/AuditPage";
import { BudgetsPage } from "./pages/BudgetsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { LoginPage } from "./pages/LoginPage";
import { ResidentsPage } from "./pages/ResidentsPage";
import { ServiceRequestsPage } from "./pages/ServiceRequestsPage";
import { StaffPage } from "./pages/StaffPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/residents" element={<ResidentsPage />} />
        <Route path="/profile" element={<ResidentsPage />} />
        <Route path="/requests" element={<ServiceRequestsPage />} />
        <Route path="/incidents" element={<IncidentsPage />} />
        <Route path="/budgets" element={<BudgetsPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
