export default function LiveBatchesLoading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <header className="page-header">
        <h1>Loading Live Batch Registry…</h1>
        <p className="lede">
          Verifying server session and querying RLS-scoped records from Supabase…
        </p>
      </header>
      <section className="card">
        <p className="muted">Fetching session roles and visible batch records…</p>
      </section>
    </div>
  );
}
