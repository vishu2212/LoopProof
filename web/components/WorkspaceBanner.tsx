"use client";

import { usePathname } from "next/navigation";
import { DEMO_DATA_NOTICE } from "@/lib/demo-data";
import { getWorkspaceMode } from "@/lib/workspace-context";

export function WorkspaceBanner({ className = "demo-banner" }: { className?: string }) {
  const pathname = usePathname();
  const mode = getWorkspaceMode(pathname);

  if (mode === "live") {
    return (
      <div className={`${className} ${className}--live`} role="note">
        <span className="demo-banner__pill demo-banner__pill--live">LIVE REGISTRY</span>
        <span>
          <strong>Workspace Mode:</strong> Supabase-backed registry. Access to real records is restricted by
          Row Level Security (RLS) to assigned participants. Not deployed to a public blockchain.
        </span>
      </div>
    );
  }

  if (mode === "auth") {
    return (
      <div className={`${className} ${className}--neutral`} role="note">
        <span className="demo-banner__pill demo-banner__pill--neutral">ACCOUNT ACCESS</span>
        <span>
          <strong>Workspace Mode:</strong> Sign in with Supabase credentials to access RLS-scoped live batches, or
          navigate to Demo Mode for offline preview.
        </span>
      </div>
    );
  }

  return (
    <div className={className} role="note">
      <span className="demo-banner__pill">SYNTHETIC DEMO</span>
      <span>
        <strong>Workspace Mode:</strong> {DEMO_DATA_NOTICE} (Navigate to <em>Live Registry</em> for connected Supabase DB).
      </span>
    </div>
  );
}
