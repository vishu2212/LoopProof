"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getWorkspaceMode } from "@/lib/workspace-context";

export function WorkspaceTopbarTools() {
  const pathname = usePathname();
  const mode = getWorkspaceMode(pathname);

  if (mode === "live") {
    return (
      <div className="topbar__tools">
        <span className="topbar__context-pill" title="Viewing connected Supabase cloud registry">
          <span className="topbar__context-dot topbar__context-dot--live" aria-hidden="true" />
          Live Registry (Supabase)
        </span>
        <Link href="/" className="topbar__link" title="Switch to offline synthetic demo walkthrough">
          ← Back to Demo Mode
        </Link>
      </div>
    );
  }

  if (mode === "auth") {
    return (
      <div className="topbar__tools">
        <span className="topbar__context-pill" title="Account authentication for live registry">
          <span className="topbar__context-dot topbar__context-dot--neutral" aria-hidden="true" />
          Account Access
        </span>
        <Link href="/" className="topbar__link" title="Switch to offline synthetic demo walkthrough">
          ← Back to Demo Mode
        </Link>
      </div>
    );
  }

  return (
    <div className="topbar__tools">
      <span className="topbar__context-pill" title="Currently viewing local synthetic demo fixtures">
        <span className="topbar__context-dot" aria-hidden="true" />
        Demo Mode (Offline Fixtures)
      </span>
      <Link href="/live-batches" className="topbar__link" title="Open connected Supabase database registry">
        Switch to Live Registry →
      </Link>
    </div>
  );
}
