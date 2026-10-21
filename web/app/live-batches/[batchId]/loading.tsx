export default function LiveBatchDetailLoading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <header className="page-header">
        <p className="eyebrow">Live Supabase Record</p>
        <h1>Loading Batch Detail &amp; Evidence History…</h1>
        <p className="lede">
          Querying RLS-scoped batch metadata, evidence digests, and append-only event history…
        </p>
      </header>
    </div>
  );
}
