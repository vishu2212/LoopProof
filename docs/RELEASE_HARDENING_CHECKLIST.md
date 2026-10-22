# Release Hardening Checklist

This checklist is for the LoopProof hackathon prototype. It is not a security audit and does not certify the deployed Supabase project.

## Release blockers to verify

- [ ] Confirm the live Supabase schema and migration history match the intended schema. The repository migration is labelled `PROPOSED / UNAPPLIED`; do not run it against production blindly.
- [ ] Confirm the `evidence` Storage bucket is private, with a 20 MiB limit and only PDF/JPEG/PNG allowed.
- [ ] Inspect every `storage.objects` policy. Upload, read, update, and delete permissions must be scoped to the authenticated user's assigned batch and the expected `<batch-uuid>/<object-uuid>` path. Avoid broad authenticated-user policies.
- [ ] Verify each upload is hashed server-side from the exact bytes that are uploaded; compare the digest to the metadata persisted by the lifecycle RPC.
- [ ] Verify no uploaded object can be overwritten after its digest is recorded. Prefer immutable random object paths and deny update/upsert/delete unless a documented lifecycle action requires it.
- [ ] Verify signed URLs are short-lived and are issued only after batch-participant authorization.
- [ ] Verify all public `SECURITY DEFINER` functions use a fixed `search_path`, check `auth.uid()`, role and batch assignment, and are executable only by the intended roles.
- [ ] Verify the verifier decision RPC checks every required checklist key server-side and does not trust client-provided intake/output values for mass balance.
- [ ] Confirm audit events and lifecycle changes are atomic, append-only for normal clients, and cannot be modified through direct table access.
- [ ] Review screenshots and demo fixtures for personal data, emails, full UUIDs, secrets, and any suggestion that synthetic records are real recycling evidence.
- [ ] Confirm the Vercel production build uses only public Supabase URL/publishable key. Never expose service-role keys, database passwords, or private keys in `NEXT_PUBLIC_*`, source control, screenshots, logs, or browser bundles.
- [ ] Re-run CI and manually smoke-test login, batch registration, evidence upload, invalid upload rejection, lifecycle transitions, verifier return/reject/approve, and unauthorized access.

## Repository checks (run locally)

From the repository root:

```bash
npm ci
npm run build
npm test
npm run typecheck
cd web
npm ci
npm test
npm run typecheck
npm run build
```

If a script name differs from the package scripts, inspect `package.json` and use the actual script name.

## Supabase verification (read-only first)

1. Open Supabase Dashboard → Storage → Buckets. Confirm `evidence` is private and inspect size/MIME restrictions.
2. Open Storage → Policies (or inspect `storage.objects` policies in SQL Editor). Read all SELECT/INSERT/UPDATE/DELETE policies. Do not add a broad policy to make an error disappear.
3. Check the migration history before applying anything. With the Supabase CLI linked to the intended project, run:

   ```bash
   supabase migration list
   supabase db push --dry-run
   ```

4. Review the dry-run output. If it proposes applying the core migration labelled `PROPOSED / UNAPPLIED`, stop and reconcile the live schema and migration history first. Do not run `supabase db push` against production until the diff is understood and a backup/recovery path exists.
5. Use two test accounts with different roles to verify that a user cannot access another batch's evidence or invoke another role's lifecycle action.

## Current architecture caveats

- The Solidity reference contract is tested locally on Hardhat; do not claim a public testnet deployment unless one is actually deployed and verified.
- The live registry uses Supabase; do not describe its records as blockchain-anchored.
- A SHA-256 digest proves byte-level correspondence to a digest, not the truth of the evidence or that recycling occurred.
- CI passing is evidence of reproducible checks, not proof of security or a substitute for an independent audit.
