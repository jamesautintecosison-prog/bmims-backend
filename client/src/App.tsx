import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { ResidentsPage } from "./pages/ResidentsPage";

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "resident" ? "/profile" : "/residents"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/residents" element={<ResidentsPage />} />
        <Route path="/profile" element={<ResidentsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
