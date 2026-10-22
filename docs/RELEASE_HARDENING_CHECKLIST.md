# LoopProof Release Hardening & Verification Checklist

This checklist tracks the release readiness and security posture of the LoopProof hackathon submission (IEEE ClimateChain Global Hackathon 2026). It distinguishes between engineering controls verified by automated tests/CI and manual verification tasks that require production Supabase / Vercel dashboard access.

---

## 1. Automated Controls & CI Verifications (Completed)

These controls are implemented in the codebase and verified by automated unit, integration, and static invariant test suites (`npm test`, `npm run typecheck`, `npm run build` in root and `web/`).

- [x] **Evidence Pre-Buffering & Size Enforcement**
  - Reject uploads exceeding 20 MiB (`MAX_EVIDENCE_BYTES = 20_971_520`) before calling `arrayBuffer()` in `web/app/live-batches/actions.ts` to prevent memory exhaustion DoS.
  - Secondary byte-length check in `validateAndPrepareEvidence` (`web/lib/live-batches.ts`).
- [x] **Magic-Byte Content Inspection**
  - Enforce genuine file signatures for PDF (`%PDF`), JPEG (`0xFF 0xD8 0xFF`), and PNG (`\x89PNG\r\n\x1a\n`) in `evidenceMatchesMimeSignature`. Rejects extension/MIME spoofing.
- [x] **Server-Side SHA-256 Integrity**
  - Compute canonical SHA-256 digest directly from uploaded bytes (`computeEvidenceSha256Hex`) server-side; client cannot spoof digests.
- [x] **Path Scoping & Storage Isolation**
  - Storage paths strictly formatted as `<batch-uuid>/<object-uuid>` using random v4 UUIDs to prevent directory traversal or object overwriting.
- [x] **Strict Role & Participant Authorization**
  - Lifecycle RPCs strictly enforce participant assignment (`auth.uid()`) and assigned role (`registrar`, `collector`, `processor`, `verifier`).
  - Verifier independence enforced: verifier cannot be the collector or processor.
- [x] **Server-Side Mass Balance & Checklist Validation**
  - Mass balance verified on processing claim (`total_output_grams <= intake_mass_grams`).
  - Verifier checklist structure and size strictly validated; cannot return `MASS_DISCREPANCY` if outputs equal intake.
- [x] **RLS & Security Definer Standards**
  - All migration SQL files verified for `alter table ... enable row level security`.
  - Clients have `SELECT` only; no direct table `INSERT`/`UPDATE`/`DELETE`.
  - All write RPCs use `SECURITY DEFINER set search_path = ''` with revoked anonymous access.
- [x] **Zero-Secret Exposure in Code & Commits**
  - All secrets and service-role keys excluded from source code, client bundles, and repository history.
- [x] **Transparent System Boundaries & Route Disclosures**
  - Explicit banners on `/` and `/batches/[batchId]` disclosing synthetic demo nature.
  - Distinct architectural context on `/live-batches` and `/live-batches/[batchId]`.
  - Footer accurately describes local Hardhat EVM (chainId 31337) reference contract.

---

## 2. Production Environment Verification (Manual / Human-Only)

These steps require direct access to your deployed Supabase project (`tvsjrxjvmebbofjdzxnm`) and Vercel project settings.

### A. Supabase Storage Configuration
1. Open **Supabase Dashboard → Storage → Buckets**:
   - Verify the `evidence` bucket exists and has **Public bucket** set to **OFF** (private). *(Verified: Configured private).*
   - Verify **Maximum file size limit** is set to `20 MB` (or `20971520` bytes). *(Verified: Set to 20 MB).*
   - Verify **Allowed MIME types** is restricted to `application/pdf`, `image/jpeg`, `image/png`. *(Verified: Restricted to PDF, JPEG, PNG).*
2. Open **Supabase Dashboard → Storage → Policies**:
   - Confirm SELECT policy restricts object downloads to assigned batch participants:
     - **Live Dashboard Name:** `evidence_objects_read` (or repository migration name: `evidence_files_select_participant`).
     - **Expression:** `bucket_id = 'evidence' AND (SELECT private.is_batch_participant(private.storage_batch_id(objects.name)))`
   - Confirm INSERT policy restricts uploads to the authorized lifecycle actor:
     - **Live Dashboard Name:** `evidence_objects_upload` (or repository migration name: `evidence_files_insert_actor`).
     - **Expression:** `bucket_id = 'evidence' AND (SELECT private.can_upload_evidence(objects.name))`
   - Confirm **no UPDATE or DELETE policies** exist on `storage.objects` or `storage.buckets` for authenticated or anon roles (evidence must be append-only). *(Verified: No UPDATE or DELETE policies exist).*

### B. Supabase Migrations & Database Schema

> [!CAUTION]
> **Production Safety Warning:** Never run `supabase db push` against production blindly or merely to synchronize migration history. Any database push can alter live database objects, lock tables, or overwrite schema definitions. Every migration must be pre-audited, and both `supabase migration list` and `supabase db push --dry-run` are mandatory prerequisites before any forward application.

1. **Migration Ground Truth (Verified via `supabase migration list`):**
   - `20261020000000_loopproof_core_schema.sql`: **Applied on remote database.**
   - `20261021000000_verifier_mass_discrepancy_guard.sql`: **Applied on remote database.**
   - `20261022000000_align_storage_mime_types.sql`: **Pending remote application.** *(Note: Even though live dashboard settings already restrict MIME types to PDF/JPEG/PNG, this migration must still be checked against actual remote database state and table constraints before executing any push. Do not push merely to synchronize migration history).*
2. **Mandatory Pre-Push Inspection & Dry-Run:**
   Before applying any migration to the remote project, you must inspect remote migration status and execute a dry run:
   ```bash
   # In terminal with Supabase CLI linked:
   supabase migration list
   supabase db push --dry-run
   ```
   - Carefully inspect and understand the dry-run output (diff, statements, and affected schemas).
   - Verify that existing live tables, RLS policies, custom RPC functions, and storage buckets will not be disrupted or overwritten.
3. **Controlled Remote Application (Owner-Only):**
   Only after the dry run has been thoroughly reviewed, understood, and confirmed safe:
   ```bash
   # Apply verified pending migrations:
   supabase db push
   ```

### C. Vercel Environment Variables
1. Open **Vercel Dashboard → Project Settings → Environment Variables**:
   - Verify `NEXT_PUBLIC_SUPABASE_URL` is set to `https://tvsjrxjvmebbofjdzxnm.supabase.co`.
   - Verify `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) is set to your project's publishable/anon key.
   - Verify **no service-role key**, database password, or private Ethereum key is present in environment variables prefixed with `NEXT_PUBLIC_`.

### D. Production Smoke Test (2 Roles)
1. Log in to `https://loop-proof.vercel.app/login` with a registrar account and create a batch assigning distinct test users as collector, processor, and verifier.
2. Sign in as collector, navigate to `/live-batches/<batch-id>`, and record collection with a valid PDF/PNG/JPEG evidence file (<20 MB).
3. Attempt to upload a disallowed file type (e.g. `.txt`) or oversized file (>20 MB) to confirm the frontend and server action cleanly reject it.
4. Sign in as processor and record receipt and submit processing claims.
5. Sign in as independent verifier and verify the batch.

---

## 3. Local Verification Commands

From repository root:

```bash
# Root contracts & Hardhat tests (162 tests)
npm test
npm run typecheck

# Web application tests, typecheck, and Next.js production build
npm test --prefix web
npm run typecheck --prefix web
npm run build --prefix web
```

---

## 4. Submission & Architectural Disclosures

- **Solidity Smart Contracts**: Deployed on local Hardhat EVM (chainId 31337) for reproducible protocol testing (162 passing unit/invariant tests). Not deployed on public Ethereum mainnet.
- **Live Registry**: Backed by PostgreSQL on Supabase with Row Level Security, custom RPC state transitions, and private S3-compatible storage. Not anchored to public blockchain blocks.
- **Cryptographic Hashes**: SHA-256 digests prove byte-level integrity against post-upload tampering; they do not attest to real-world material truth or recycling claims without independent auditing.
- **Synthetic Demo Data**: Routes `/` and `/batches/*` display clearly labeled canonical synthetic fixtures for demonstrative UI review.
