import type { Role } from "./AuthContext";

export const ROUTE_ACCESS = {
  "/": ["admin", "staff", "resident"],
  "/residents": ["admin", "staff"],
  "/profile": ["resident"],
  "/requests": ["admin", "staff", "resident"],
  "/incidents": ["admin", "staff", "resident"],
  "/programs": ["admin", "staff", "resident"],
  "/budgets": ["admin", "staff"],
  "/directory": ["admin", "staff"],
  "/staff": ["admin"],
  "/audit": ["admin"],
  "/account": ["admin", "staff", "resident"],
} as const satisfies Record<string, readonly Role[]>;

export type AppRoute = keyof typeof ROUTE_ACCESS;

export function normalizeAppRoute(pathname: unknown): AppRoute | null {
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) return null;
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return Object.prototype.hasOwnProperty.call(ROUTE_ACCESS, normalized) ? (normalized as AppRoute) : null;
}

export function canAccessAppRoute(pathname: unknown, role: Role | null | undefined): boolean {
  const route = normalizeAppRoute(pathname);
  if (!route || !role) return false;
  const roles: readonly Role[] = ROUTE_ACCESS[route];
  return roles.includes(role);
}
