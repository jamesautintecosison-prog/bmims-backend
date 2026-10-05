import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, setToken, setUnauthorizedHandler } from "../api/client";

export type Role = "admin" | "staff" | "resident";

export interface User {
  user_id: number;
  username: string;
  role: Role;
  staff_id: number | null;
  resident_id: number | null;
}

interface AuthState {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const USER_KEY = "bmims.user";
const AuthContext = createContext<AuthState | null>(null);

function loadUser(): User | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(loadUser);

  const logout = useCallback(() => {
    setToken(null);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: { username, password },
    });
    setToken(result.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(result.user));
    setUser(result.user);
  }, []);

  // An expired or rejected token signs the user out everywhere
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
