-- pgTAP tests for supabase/migrations/
-- Run LOCALLY ONLY:  supabase start && supabase db reset && supabase test db
-- (requires Docker + Supabase CLI; never run against a hosted/production project)
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- ---- fixtures: five users (registrar, collector, processor, verifier, stranger) ----
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'registrar@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'collector@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'processor@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'verifier@example.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'stranger@example.test');
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'registrar'),
  ('00000000-0000-0000-0000-0000000000a2', 'collector'),
  ('00000000-0000-0000-0000-0000000000a3', 'processor'),
  ('00000000-0000-0000-0000-0000000000a4', 'verifier'),
  ('00000000-0000-0000-0000-0000000000a5', 'collector');

create function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.hash(n int) returns bytea language sql as $$ select decode(lpad(to_hex(n), 64, '0'), 'hex') $$;
-- Simulates a completed upload to the private bucket (includes owner, owner_id, metadata, and user_metadata)
create function pg_temp.upload(p_batch uuid, p_hash bytea default null) returns text language plpgsql as $$
declare
  v_path text := p_batch::text || '/' || gen_random_uuid()::text;
  v_hash text := encode(coalesce(p_hash, pg_temp.hash(1)), 'hex');
begin
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
  values ('evidence', v_path, auth.uid(), auth.uid()::text,
          jsonb_build_object('size', 10, 'mimetype', 'application/pdf'),
          jsonb_build_object('sha256', v_hash));
  return v_path;
end $$;
create function pg_temp.upload_adv(p_batch uuid, p_owner uuid, p_owner_id text, p_size bigint, p_mime text, p_sha256 text) returns text language plpgsql as $$
declare
  v_path      text := p_batch::text || '/' || gen_random_uuid()::text;
  v_meta      jsonb := '{}'::jsonb;
  v_user_meta jsonb := '{}'::jsonb;
begin
  if p_size is not null then
    v_meta := v_meta || jsonb_build_object('size', p_size);
  end if;
  if p_mime is not null then
    v_meta := v_meta || jsonb_build_object('mimetype', p_mime);
  end if;
  if p_sha256 is not null then
    v_user_meta := jsonb_build_object('sha256', p_sha256);
  end if;
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata, user_metadata)
  values ('evidence', v_path, p_owner, p_owner_id,
          case when v_meta = '{}'::jsonb then null else v_meta end,
          case when v_user_meta = '{}'::jsonb then null else v_user_meta end);
  return v_path;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.hash(int), pg_temp.upload(uuid, bytea), pg_temp.upload_adv(uuid, uuid, text, bigint, text, text) to public;

-- ---- structure ----
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
          'RLS is enabled on every public table');
select is((select public from storage.buckets where id = 'evidence'), false, 'evidence bucket is private');
select is((select count(*)::int from information_schema.table_privileges
           where table_schema = 'public' and grantee = 'anon'), 0, 'anon has no table privileges');
select is((select count(*)::int from information_schema.table_privileges
           where table_schema = 'public' and grantee = 'authenticated' and privilege_type <> 'SELECT'), 0,
          'authenticated has SELECT only (no direct writes)');

-- ---- registration ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.lp_register_batch(pg_temp.hash(1), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4')$$,
  '42501', 'missing role registrar', 'a collector cannot register batches (D-12)');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.lp_register_batch(pg_temp.hash(1), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'verifier must hold the verifier role');
select throws_ok($$select public.lp_register_batch(pg_temp.hash(1), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a3')$$,
  null::char(5), null::text, 'verifier equal to processor is rejected');
select set_config('t.batch', public.lp_register_batch(pg_temp.hash(1), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4')::text, false);
select throws_ok($$select public.lp_register_batch(pg_temp.hash(1), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4')$$,
  '23505', null, 'duplicate claim key is rejected');
select is((select state::text from public.batches where id = current_setting('t.batch')::uuid), 'REGISTERED', 'registered');
reset role;

-- ---- direct writes and visibility ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$update public.batches set state = 'VERIFIED'$$, '42501', null, 'client cannot UPDATE batches directly');
select throws_ok($$insert into public.batch_events (batch_id, seq, to_state, actor_id)
  values (current_setting('t.batch')::uuid, 99, 'REGISTERED', '00000000-0000-0000-0000-0000000000a2')$$,
  '42501', null, 'client cannot INSERT events directly');
select is((select count(*)::int from public.batches), 1, 'assigned collector sees the batch');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
select is((select count(*)::int from public.batches), 0, 'unassigned user sees no batches');
select is((select count(*)::int from public.batch_events), 0, 'unassigned user sees no events');
reset role;
set local role anon;
select throws_ok($$select * from public.batches$$, '42501', null, 'anon cannot read batches');
reset role;

-- ---- lifecycle (happy path up to PROCESSED_CLAIMED) ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'processor cannot perform the collector action');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$select public.lp_record_receipt(current_setting('t.batch')::uuid, pg_temp.hash(3), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'collector cannot perform the processor action');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  500, 'application/pdf')$$,
  '22023', null, 'mismatched byte_size against storage object metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, null, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '22023', 'storage object is missing required size metadata', 'storage object missing size metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'image/png')$$,
  '22023', null, 'mismatched mime_type against storage object metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, null, encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '22023', 'storage object is missing required mimetype metadata', 'storage object missing mimetype metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', null)),
  10, 'application/pdf')$$,
  '22023', 'storage object is missing required sha256 user_metadata', 'storage object missing sha256 user_metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', 'short_hash')),
  10, 'application/pdf')$$,
  '22023', 'storage object has malformed sha256 user_metadata', 'storage object with short sha256 user_metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', repeat('g', 64))),
  10, 'application/pdf')$$,
  '22023', 'storage object has malformed sha256 user_metadata', 'storage object with non-hex sha256 user_metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, auth.uid(), auth.uid()::text, 10, 'application/pdf', encode(pg_temp.hash(99), 'hex'))),
  10, 'application/pdf')$$,
  '22023', 'sha256 does not match storage object user_metadata', 'mismatched sha256 against storage object user_metadata is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, null, null, 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '42501', 'storage object has no recorded uploader', 'storage object missing recorded uploader is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, null, 'malformed-not-a-uuid', 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '42501', 'storage object has malformed uploader identity', 'storage object with malformed uploader identity is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a2', 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '42501', 'storage object has conflicting uploader identities', 'storage object with conflicting uploader identities is rejected');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a1', 10, 'application/pdf', encode(pg_temp.hash(2), 'hex'))),
  10, 'application/pdf')$$,
  '42501', 'caller is not the recorded uploader of the evidence file', 'evidence uploaded by another user cannot be attached');
select throws_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  gen_random_uuid()::text || '/test.pdf',
  10, 'application/pdf')$$,
  '22023', null, 'storage path outside batch folder is rejected');
select lives_ok($$select public.lp_record_collection(current_setting('t.batch')::uuid, 1000, pg_temp.hash(2),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(2))), 10, 'application/pdf')$$, 'collection recorded');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.lp_submit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":500}]', pg_temp.hash(9), 'x/y', 10, 'application/pdf')$$,
  '55000', null, 'cannot skip RECEIVED');
select throws_ok($$select public.lp_record_receipt(current_setting('t.batch')::uuid, pg_temp.hash(3),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, null, '00000000-0000-0000-0000-0000000000a1', 10, 'application/pdf', encode(pg_temp.hash(3), 'hex'))), 10, 'application/pdf')$$,
  '42501', 'caller is not the recorded uploader of the evidence file',
  'foreign owner_id in storage object is rejected even if owner column is null');
select lives_ok($$select public.lp_record_receipt(current_setting('t.batch')::uuid, pg_temp.hash(3),
  (select pg_temp.upload_adv(current_setting('t.batch')::uuid, null, auth.uid()::text, 10, 'application/pdf', encode(pg_temp.hash(3), 'hex'))), 10, 'application/pdf')$$, 'receipt recorded');
select throws_ok($$select public.lp_resubmit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":500}]', pg_temp.hash(9), 'x/y', 10, 'application/pdf')$$,
  '55000', null, 'cannot call lp_resubmit_processing from RECEIVED');
select throws_ok($$select public.lp_submit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":600},{"material_code":2,"mass_grams":401}]', pg_temp.hash(4),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(4))), 10, 'application/pdf')$$,
  '22023', null, 'outputs exceeding intake are rejected (mass balance)');
select throws_ok($$select public.lp_submit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":500}]', pg_temp.hash(2),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(2))), 10, 'application/pdf')$$,
  '23505', null, 'evidence hash reuse is rejected');
select lives_ok($$select public.lp_submit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":500},{"material_code":2,"mass_grams":400}]', pg_temp.hash(5),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(5))), 10, 'application/pdf')$$, 'claim submitted');
reset role;

-- ---- verifier: independence, return, resubmit, verify ----
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.lp_verify_batch(current_setting('t.batch')::uuid)$$, '42501', null,
  'processor cannot verify its own claim');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select lives_ok($$select public.lp_return_batch(current_setting('t.batch')::uuid, 'INSUFFICIENT_EVIDENCE', '{"hash_matches":false}')$$,
  'verifier returns with an explicit reason');
select throws_ok($$select public.lp_verify_batch(current_setting('t.batch')::uuid)$$, '55000', null,
  'cannot verify a RETURNED batch (needs resubmission)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$select public.lp_submit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":450}]', pg_temp.hash(6), 'x/y', 10, 'application/pdf')$$,
  '55000', null, 'cannot call lp_submit_processing from RETURNED');
select lives_ok($$select public.lp_resubmit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":450}]', pg_temp.hash(6),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(6))), 10, 'application/pdf')$$, 'resubmission with NEW evidence');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select lives_ok($$select public.lp_return_batch(current_setting('t.batch')::uuid, 'MASS_DISCREPANCY', '{"mass_balance":false}')$$,
  'verifier can return with MASS_DISCREPANCY when output (450 g) < intake (1000 g)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select lives_ok($$select public.lp_resubmit_processing(current_setting('t.batch')::uuid,
  '[{"material_code":1,"mass_grams":700},{"material_code":2,"mass_grams":300}]', pg_temp.hash(7),
  (select pg_temp.upload(current_setting('t.batch')::uuid, pg_temp.hash(7))), 10, 'application/pdf')$$,
  'resubmission with total_output_grams (1000 g) equal to intake_mass_grams (1000 g)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$select public.lp_return_batch(current_setting('t.batch')::uuid, 'MASS_DISCREPANCY', '{"mass_balance":false}')$$,
  '22023', null, 'cannot return with MASS_DISCREPANCY when total_output_grams equals intake_mass_grams');
select lives_ok($$select public.lp_verify_batch(current_setting('t.batch')::uuid, '{"hash_matches":true}')$$, 'verifier verifies');
select is((select state::text from public.batches where id = current_setting('t.batch')::uuid), 'VERIFIED', 'batch is VERIFIED');
select is((select count(*)::int from public.processing_revisions where batch_id = current_setting('t.batch')::uuid), 3,
  'all revisions are preserved (D-13)');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select set_config('t.nonterminal_batch', public.lp_register_batch(pg_temp.hash(99), 1,
  '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4')::text, false);
reset role;

-- ---- integrity holds even for the owner / service role ----
select throws_ok($$update public.batch_events set to_state = 'REGISTERED'$$, '42501', null, 'events are append-only (update)');
select throws_ok($$delete from public.batch_events$$, '42501', null, 'events are append-only (delete)');
select throws_ok($$truncate public.evidence cascade$$, '42501', null, 'evidence cannot be truncated');
select set_config('loopproof.in_transition', 'off', true);
select throws_ok($$update public.batches set state = 'COLLECTED' where id = current_setting('t.nonterminal_batch')::uuid$$, '42501', null,
  'direct batch updates outside lp_* functions are rejected even for the owner');

select * from finish();
rollback;
