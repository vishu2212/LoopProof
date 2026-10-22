/**
 * Workspace mode determination for route-aware headers, banners, and disclosures.
 *
 * - `demo`: Offline synthetic walkthrough (`/` and `/batches/*`).
 * - `live`: Supabase-backed live registry (`/live-batches` and `/live-batches/*`).
 * - `auth`: Supabase account authentication (`/login`).
 */
export type WorkspaceMode = "demo" | "live" | "auth";

export function getWorkspaceMode(pathname: string | null | undefined): WorkspaceMode {
  if (!pathname) return "demo";
  const normalized = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (normalized === "/live-batches" || normalized.startsWith("/live-batches/")) return "live";
  if (normalized === "/login" || normalized.startsWith("/login/")) return "auth";
  return "demo";
}
