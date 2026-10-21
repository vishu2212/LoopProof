// Static checks for the PROPOSED Supabase migration. These do NOT execute SQL — they guard the
// security-critical invariants of the file and keep its enums in step with the Solidity contract.
// Behavioural checks live in supabase/tests/database/core_schema.test.sql (pgTAP, local Supabase only).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { BATCH_STATES, RETURN_REASONS, REJECT_REASONS } from "../lib/lifecycle.ts";

const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const sql = files.map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");
const code = sql.replace(/--.*$/gm, ""); // strip comments for structural checks

const tables = [...code.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
const enumMembers = (name: string) => {
  const m = code.match(new RegExp(`create type public\\.${name} as enum \\(([^)]*)\\)`));
  assert.ok(m, `enum ${name} missing`);
  return [...m![1].matchAll(/'([A-Za-z_]+)'/g)].map((x) => x[1]);
};

test("migration files are timestamp-named and present", () => {
  assert.ok(files.length >= 1);
  for (const f of files) assert.match(f, /^\d{14}_[a-z0-9_]+\.sql$/);
});

test("every public table has RLS enabled", () => {
  assert.ok(tables.length >= 7);
  for (const t of tables) {
    assert.match(code, new RegExp(`alter table public\\.${t}\\s+enable row level security`), `${t}: RLS`);
  }
});

test("clients get SELECT only: no insert/update/delete grants or write policies", () => {
  assert.doesNotMatch(code, /grant\s+(insert|update|delete|all)[^;]*to[^;]*(authenticated|anon|public)/i);
  assert.doesNotMatch(code, /create policy[^;]*for\s+(insert|update|delete|all)[^;]*on public\./i);
  for (const m of code.matchAll(/create policy \w+ on public\.\w+\s+for (\w+) to (\w+)/g)) {
    assert.equal(m[1], "select");
    assert.equal(m[2], "authenticated");
  }
});

test("lifecycle write functions are SECURITY DEFINER with a pinned empty search_path and no anon access", () => {
  const fns = [...code.matchAll(/create function (public\.lp_\w+)\(/g)].map((m) => m[1]);
  assert.deepEqual(
    fns.sort(),
    [
      "public.lp_cancel_batch",
      "public.lp_record_collection",
      "public.lp_record_receipt",
      "public.lp_register_batch",
      "public.lp_reject_batch",
      "public.lp_resubmit_processing",
      "public.lp_return_batch",
      "public.lp_submit_processing",
      "public.lp_verify_batch",
    ].sort(),
  );
  for (const f of fns) {
    const body = code.slice(code.indexOf(`create function ${f}(`)).split(/\n\$\$;/)[0];
    assert.match(body, /security definer/i, `${f} security definer`);
    assert.match(body, /set search_path = ''/, `${f} search_path`);
  }
  const submitBody = code.slice(code.indexOf("create function public.lp_submit_processing(")).split(/\n\$\$;/)[0];
  const resubmitBody = code.slice(code.indexOf("create function public.lp_resubmit_processing(")).split(/\n\$\$;/)[0];
  assert.match(submitBody, /'RECEIVED'::public\.batch_state/, "lp_submit_processing requires RECEIVED");
  assert.doesNotMatch(submitBody, /'RETURNED'/, "lp_submit_processing rejects RETURNED");
  assert.match(resubmitBody, /'RETURNED'::public\.batch_state/, "lp_resubmit_processing requires RETURNED");
  assert.doesNotMatch(resubmitBody, /'RECEIVED'/, "lp_resubmit_processing rejects RECEIVED");
  assert.match(code, /revoke all on function[\s\S]*from public, anon, authenticated;/);
  assert.doesNotMatch(code, /grant execute on function[^;]*to[^;]*\banon\b/i);
});

test("VERIFIED cannot be set without a verifier decision, and transitions and stage evidence are trigger-guarded", () => {
  assert.match(code, /create trigger batches_guard before insert or update on public\.batches/);
  assert.match(code, /requires a matching decision by the assigned verifier/);
  assert.match(code, /COLLECTED requires a collection_record evidence row/);
  assert.match(code, /RECEIVED requires a receipt_record evidence row/);
  assert.match(code, /PROCESSED_CLAIMED requires a new processing revision/);
  assert.match(code, /private\.transition_allowed\(old\.state, new\.state\)/);
  assert.match(code, /loopproof\.in_transition/);
});

test("history/evidence tables are append-only", () => {
  for (const t of ["batch_events", "evidence", "verifier_decisions", "processing_revisions", "processing_outputs"]) {
    assert.match(code, new RegExp(`before update or delete on public\\.${t}`), `${t}: update/delete`);
    assert.match(code, new RegExp(`before truncate on public\\.${t}`), `${t}: truncate`);
  }
});

test("evidence bucket is private; paths use storage_batch_id; hashes are 32-byte SHA-256 and globally unique", () => {
  assert.match(code, /values \('evidence', 'evidence', false,/);
  assert.match(code, /set public = false/);
  assert.match(code, /sha256\s+bytea not null unique/);
  assert.match(code, /octet_length\(sha256\) = 32/);
  assert.match(code, /constraint evidence_path_in_batch_folder check \(private\.storage_batch_id\(storage_path\) = batch_id\)/);
  assert.doesNotMatch(code, /for (update|delete) to authenticated[^;]*on storage\.objects/i);
  assert.doesNotMatch(code, /on storage\.objects\s+for (update|delete)/i);
});

test("enums match web/lib/lifecycle.ts (and therefore the Solidity enums)", () => {
  assert.deepEqual(enumMembers("batch_state"), BATCH_STATES.filter((s) => s !== "NONE"));
  assert.deepEqual(enumMembers("return_reason"), RETURN_REASONS.filter((r) => r !== "NONE"));
  assert.deepEqual(enumMembers("reject_reason"), REJECT_REASONS.filter((r) => r !== "NONE"));
});

test("no impact numbers, free-text reasons, secrets, or demo IDs in the schema", () => {
  assert.doesNotMatch(code, /\b(co2|carbon|emission|impact_)\w*\b/i, "no impact columns (D-08)");
  assert.doesNotMatch(code, /reason\s+text/i, "reasons are enum codes only (D-14)");
  assert.doesNotMatch(sql, /(service_role_key|eyJ[A-Za-z0-9_-]{20,}|sk_live|postgres:\/\/\S+:\S+@)/i, "no secrets");
  assert.match(code, /public_ref ~ '\^LP-/, "real refs cannot collide with DEMO-NNN");
});

