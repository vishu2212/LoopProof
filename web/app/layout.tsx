import type { Metadata } from "next";
import Link from "next/link";
import { WorkspaceBanner } from "@/components/WorkspaceBanner";
import { WorkspaceTopbarTools } from "@/components/WorkspaceTopbarTools";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LoopProof — E-Waste Traceability Prototype", template: "%s · LoopProof Demo" },
  description:
    "Evidence-gated e-waste traceability ledger with synthetic demo fixtures and a connected Supabase live registry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <WorkspaceBanner className="demo-banner" />
        <div className="app-shell">
          <aside className="sidebar" aria-label="Application sidebar">
            <div className="sidebar__header">
              <Link href="/" className="brand" aria-label="LoopProof — dashboard">
                <span className="brand__mark" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3a9 9 0 0 1 9 9" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </span>
                <span className="brand__title">LoopProof</span>
              </Link>
            </div>

            <nav className="sidebar__nav" aria-label="Primary">
              <Link href="/" className="sidebar__link sidebar__link--active" aria-label="Overview dashboard">
                <span className="sidebar__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="7" height="9" x="3" y="3" rx="1" />
                    <rect width="7" height="5" x="14" y="3" rx="1" />
                    <rect width="7" height="9" x="14" y="12" rx="1" />
                    <rect width="7" height="5" x="3" y="16" rx="1" />
                  </svg>
                </span>
                Overview
              </Link>
              <Link href="/#batches-title" className="sidebar__link" aria-label="Batch Ledger">
                <span className="sidebar__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
                    <path d="m3.3 7 8.7 5 8.7-5" />
                    <path d="M12 22V12" />
                  </svg>
                </span>
                Batches
              </Link>
              <Link href="/#review-queue-title" className="sidebar__link" aria-label="Evidence Review Queue">
                <span className="sidebar__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="m9 15 2 2 4-4" />
                  </svg>
                </span>
                Evidence Review
              </Link>
              <Link href="/live-batches" className="sidebar__link" aria-label="Live Registry (Supabase DB)">
                <span className="sidebar__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" x2="12" y1="2" y2="6" />
                    <line x1="12" x2="12" y1="18" y2="22" />
                    <line x1="4.93" x2="7.76" y1="4.93" y2="7.76" />
                    <line x1="16.24" x2="19.07" y1="16.24" y2="19.07" />
                    <line x1="2" x2="6" y1="12" y2="12" />
                    <line x1="18" x2="22" y1="12" y2="12" />
                    <circle cx="12" cy="12" r="4" />
                  </svg>
                </span>
                Live Registry
              </Link>
              <Link href="/login" className="sidebar__link" aria-label="Sign In">
                <span className="sidebar__icon" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" x2="3" y1="12" y2="12" />
                  </svg>
                </span>
                Sign In
              </Link>
            </nav>

            <div className="sidebar__footer">
              <div className="sidebar__user" title="Synthetic demo user profile">
                <div className="sidebar__avatar" aria-hidden="true">J</div>
                <div className="sidebar__user-meta">
                  <span className="sidebar__user-name">Joen</span>
                  <span className="sidebar__user-org">LoopProof</span>
                </div>
                <span className="sidebar__user-caret" aria-hidden="true">⌄</span>
              </div>
              <div className="sidebar__principle" role="note">
                <strong>Demo workspace</strong>
                <span>LoopProof · prototype</span>
              </div>
            </div>
          </aside>

          <div className="app-workspace">
            <header className="topbar">
              <div className="topbar__left">
                <Link href="/" className="topbar__breadcrumb" aria-label="Go to Overview dashboard">
                  Material Traceability
                </Link>
                <span className="topbar__status-tag">Audit Ledger · v0.1</span>
              </div>
              <WorkspaceTopbarTools />
            </header>

            <main id="main" className="app-main" tabIndex={-1}>
              {children}
            </main>

            <footer className="site-footer">
              <p>
                <strong>Collected does not mean recycled.</strong> Environmental impact must not be
                claimed until the required evidence exists.
              </p>
              <p className="muted">
                On-chain records would show that authorized keys recorded actions and that anchored
                evidence hashes are unaltered. They do not prove that physical recycling occurred.
                Smart contracts are verified locally on Hardhat EVM (chainId 31337) and are not deployed to a public blockchain.
              </p>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
