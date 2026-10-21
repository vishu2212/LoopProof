import type { Metadata } from "next";
import Link from "next/link";
import { DEMO_DATA_NOTICE } from "@/lib/demo-data";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "LoopProof — E-Waste Traceability Prototype", template: "%s · LoopProof Demo" },
  description:
    "LoopProof e-waste traceability interface prototype. Synthetic demo data; not connected to a backend, database, or blockchain.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <div className="demo-banner" role="note">
          <span className="demo-banner__pill">SYNTHETIC DEMO</span>
          <span><strong>Prototype disclosure:</strong> {DEMO_DATA_NOTICE}</span>
        </div>
        <div className="app-shell">
          <aside className="sidebar" aria-label="Application sidebar">
            <div className="sidebar__header">
              <Link href="/" className="brand" aria-label="LoopProof — dashboard">
                <span className="brand__mark" aria-hidden="true">◉</span>
                <span className="brand__title">LoopProof</span>
              </Link>
            </div>

            <nav className="sidebar__nav" aria-label="Primary">
              <Link href="/" className="sidebar__link sidebar__link--active"><span>▦</span>Overview</Link>
              <Link href="/#batches-title" className="sidebar__link"><span>◇</span>Batches</Link>
              <Link href="/#review-queue-title" className="sidebar__link"><span>≡</span>Evidence Review</Link>
              <Link href="/live-batches" className="sidebar__link"><span>◉</span>Live Registry</Link>
              <Link href="/login" className="sidebar__link"><span>⚿</span>Sign In</Link>
              <Link href="/" className="sidebar__link"><span>▤</span>Organizations</Link>
              <Link href="/" className="sidebar__link"><span>↗</span>Public Proofs</Link>
              <Link href="/" className="sidebar__link"><span>⚙</span>Settings</Link>
            </nav>

            <div className="sidebar__principle" role="note">
              <strong>Demo workspace</strong>
              <span>LoopProof · prototype</span>
            </div>
          </aside>

          <div className="app-workspace">
            <header className="topbar">
              <span className="topbar__breadcrumb">Traceability Overview</span>
              <div className="topbar__tools">
                <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search batches and organizations" placeholder="Search batches, organizations..." /></label>
                <span className="topbar__bell" aria-label="Notifications">♧</span>
                <button className="org-switcher" type="button">▣ &nbsp; Demo Org&nbsp;⌄</button>
              </div>
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
                This prototype has no live connection to any backend, database, or blockchain.
              </p>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
