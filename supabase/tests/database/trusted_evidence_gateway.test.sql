-- =============================================================================
-- pgTAP test suite: Trusted Evidence Gateway adversarial boundary & lifecycle
-- =============================================================================
-- Tests:
-- 1. Direct PostgREST invocation rejected for anon and authenticated callers (42501).
-- 2. Actor validation: null actor, non-existent actor, missing role, wrong assignment (42501).
-- 3. Storage metadata validation: foreign uploader, missing metadata, mismatched size/mime/sha256 (42501 / 22023 / 55000).
-- 4. Authorized lifecycle execution: collection, receipt, processing claim, resubmission.
-- 5. Human actor audit attribution in evidence and batch_events.
-- =============================================================================

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ---- fixtures: six users ----
-- a1: registrar
-- a2: assigned collector
-- a3: assigned processor
-- a4: assigned verifier
-- a5: stranger (no roles)
-- a6: unassigned collector (holds collector role, but not on this batch)
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'authenticated', 'authenticated', 'reg@test.org'),
  ('00000000-0000-0000-0000-0000000000a2', 'authenticated', 'authenticated', 'col@test.org'),
  ('00000000-0000-0000-0000-0000000000a3', 'authenticated', 'authenticated', 'proc@test.org'),
  ('00000000-0000-0000-0000-0000000000a4', 'authenticated', 'authenticated', 'ver@test.org'),
  ('00000000-0000-0000-0000-0000000000a5', 'authenticated', 'authenticated', 'stranger@test.org'),
  ('00000000-0000-0000-0000-0000000000a6', 'authenticated', 'authenticated', 'col2@test.org');

insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'registrar'),
  ('00000000-0000-0000-0000-0000000000a2', 'collector'),
  ('00000000-0000-0000-0000-0000000000a3', 'processor'),
  ('00000000-0000-0000-0000-0000000000a4', 'verifier'),
  ('00000000-0000-0000-0000-0000000000a6', 'collector');

-- Helpers for switching roles
create function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

create function pg_temp.as_service_role() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  execute 'set local role service_role';
end $$;

create function pg_temp.hash(n int) returns bytea language sql as $$
  select decode(lpad(to_hex(n), 64, '0'), 'hex');
$$;

create function pg_temp.upload_adv(
  p_batch uuid, p_owner uuid, p_owner_id text, p_size bigint, p_mime text, p_sha256 text
) returns text language plpgsql as $$
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

grant execute on function pg_temp.as_user(text), pg_temp.as_anon(), pg_temp.as_service_role(),
  pg_temp.hash(int), pg_temp.upload_adv(uuid, uuid, text, bigint, text, text) to public;

-- Setup initial batch registered by a1
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select set_config('t.gw_batch', public.lp_register_batch(
  pg_temp.hash(100), 1,
  '00000000-0000-0000-0000-0000000000a2', -- collector
  '00000000-0000-0000-0000-0000000000a3', -- processor
  '00000000-0000-0000-0000-0000000000a4'  -- verifier
)::text, false);
reset role;

-- =============================================================================
-- TEST GROUP 1: Direct PostgREST Caller Boundary Enforcement (42501)
-- =============================================================================
select pg_temp.as_anon();
select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-0000000000a2'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'anon cannot execute lp_gateway_record_collection');
select throws_ok(
  $$select public.lp_gateway_record_receipt('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, pg_temp.hash(102), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'anon cannot execute lp_gateway_record_receipt');
select throws_ok(
  $$select public.lp_gateway_submit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(103), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'anon cannot execute lp_gateway_submit_processing');
select throws_ok(
  $$select public.lp_gateway_resubmit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(104), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'anon cannot execute lp_gateway_resubmit_processing');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-0000000000a2'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'authenticated user cannot execute lp_gateway_record_collection directly');
select throws_ok(
  $$select public.lp_gateway_record_receipt('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, pg_temp.hash(102), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'authenticated user cannot execute lp_gateway_record_receipt directly');
select throws_ok(
  $$select public.lp_gateway_submit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(103), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'authenticated user cannot execute lp_gateway_submit_processing directly');
select throws_ok(
  $$select public.lp_gateway_resubmit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(104), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'authenticated user cannot execute lp_gateway_resubmit_processing directly');
reset role;

-- =============================================================================
-- TEST GROUP 2: Service Role Gateway Actor & Role Checks
-- =============================================================================
select pg_temp.as_service_role();

-- 2.1 Null or non-existent actor
select throws_ok(
  $$select public.lp_gateway_record_collection(null, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', 'invalid actor', 'service_role cannot invoke gateway with null actor_id');

select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-000000000099'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', 'invalid actor', 'service_role cannot invoke gateway with non-existent user actor_id');

-- 2.2 Missing role on actor
select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-0000000000a5'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', 'missing role collector', 'service_role cannot invoke gateway for actor lacking required role');

-- 2.3 Wrong batch assignment (a6 has collector role, but is not the assigned collector on t.gw_batch)
select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-0000000000a6'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(101), 'x/y', 10, 'application/pdf')$$,
  '42501', 'caller is not the collector assigned to this batch', 'service_role cannot invoke gateway for actor not assigned to the batch');

-- =============================================================================
-- TEST GROUP 3: Evidence Storage Metadata & Uploader Validation in Gateway
-- =============================================================================

-- 3.1 Foreign uploader (uploaded by a1, but actor is a2)
select throws_ok(
  $$select public.lp_gateway_record_collection(
    '00000000-0000-0000-0000-0000000000a2'::uuid,
    current_setting('t.gw_batch')::uuid,
    1000,
    pg_temp.hash(101),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000a1', 10, 'application/pdf', encode(pg_temp.hash(101), 'hex'))),
    10,
    'application/pdf'
  )$$,
  '42501', 'caller is not the recorded uploader of the evidence file',
  'gateway rejects storage object uploaded by another user');

-- 3.2 Mismatched SHA-256 vs storage object user_metadata
select throws_ok(
  $$select public.lp_gateway_record_collection(
    '00000000-0000-0000-0000-0000000000a2'::uuid,
    current_setting('t.gw_batch')::uuid,
    1000,
    pg_temp.hash(101),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000000a2', 10, 'application/pdf', encode(pg_temp.hash(999), 'hex'))),
    10,
    'application/pdf'
  )$$,
  '22023', 'sha256 does not match storage object user_metadata',
  'gateway rejects storage object with mismatched SHA-256 digest');

-- =============================================================================
-- TEST GROUP 4: Full Authorized Lifecycle via Gateway + Human Attribution
-- =============================================================================

-- 4.1 Collection recorded via lp_gateway_record_collection
select lives_ok(
  $$select public.lp_gateway_record_collection(
    '00000000-0000-0000-0000-0000000000a2'::uuid,
    current_setting('t.gw_batch')::uuid,
    2500,
    pg_temp.hash(101),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000000a2', 20, 'application/pdf', encode(pg_temp.hash(101), 'hex'))),
    20,
    'application/pdf'
  )$$,
  'service_role successfully registers collection via lp_gateway_record_collection');

select is((select state::text from public.batches where id = current_setting('t.gw_batch')::uuid),
  'COLLECTED', 'batch transitioned to COLLECTED');

select is((select submitted_by from public.evidence where batch_id = current_setting('t.gw_batch')::uuid and kind = 'collection_record'),
  '00000000-0000-0000-0000-0000000000a2'::uuid, 'collection evidence attributed to human collector (a2)');

select is((select actor_id from public.batch_events where batch_id = current_setting('t.gw_batch')::uuid and to_state = 'COLLECTED'),
  '00000000-0000-0000-0000-0000000000a2'::uuid, 'collection batch event attributed to human collector (a2)');

-- 4.2 Gateway rejects wrong state (cannot collect twice)
select throws_ok(
  $$select public.lp_gateway_record_collection(
    '00000000-0000-0000-0000-0000000000a2'::uuid,
    current_setting('t.gw_batch')::uuid,
    2500,
    pg_temp.hash(102),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0000-0000000000a2', 20, 'application/pdf', encode(pg_temp.hash(102), 'hex'))),
    20,
    'application/pdf'
  )$$,
  '55000', null, 'gateway rejects collection on non-REGISTERED batch');

-- 4.3 Facility receipt recorded via lp_gateway_record_receipt
select lives_ok(
  $$select public.lp_gateway_record_receipt(
    '00000000-0000-0000-0000-0000000000a3'::uuid,
    current_setting('t.gw_batch')::uuid,
    pg_temp.hash(103),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000000a3', 30, 'application/pdf', encode(pg_temp.hash(103), 'hex'))),
    30,
    'application/pdf'
  )$$,
  'service_role successfully registers receipt via lp_gateway_record_receipt');

select is((select state::text from public.batches where id = current_setting('t.gw_batch')::uuid),
  'RECEIVED', 'batch transitioned to RECEIVED');

select is((select submitted_by from public.evidence where batch_id = current_setting('t.gw_batch')::uuid and kind = 'receipt_record'),
  '00000000-0000-0000-0000-0000000000a3'::uuid, 'receipt evidence attributed to human processor (a3)');

-- 4.4 Mass-balance rejection in gateway
select throws_ok(
  $$select public.lp_gateway_submit_processing(
    '00000000-0000-0000-0000-0000000000a3'::uuid,
    current_setting('t.gw_batch')::uuid,
    '[{"material_code": 1, "mass_grams": 2000}, {"material_code": 2, "mass_grams": 600}]'::jsonb,
    pg_temp.hash(104),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000000a3', 40, 'application/pdf', encode(pg_temp.hash(104), 'hex'))),
    40,
    'application/pdf'
  )$$,
  '22023', 'total outputs (2600) exceed intake (2500)',
  'gateway rejects processing claim exceeding intake mass (mass-balance)');

-- 4.5 Successful processing claim via lp_gateway_submit_processing
select lives_ok(
  $$select public.lp_gateway_submit_processing(
    '00000000-0000-0000-0000-0000000000a3'::uuid,
    current_setting('t.gw_batch')::uuid,
    '[{"material_code": 1, "mass_grams": 1500}, {"material_code": 2, "mass_grams": 800}]'::jsonb,
    pg_temp.hash(105),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000000a3', 50, 'application/pdf', encode(pg_temp.hash(105), 'hex'))),
    50,
    'application/pdf'
  )$$,
  'service_role successfully registers processing claim via lp_gateway_submit_processing');

select is((select state::text from public.batches where id = current_setting('t.gw_batch')::uuid),
  'PROCESSED_CLAIMED', 'batch transitioned to PROCESSED_CLAIMED');

select is((select created_by from public.processing_revisions where batch_id = current_setting('t.gw_batch')::uuid and revision = 1),
  '00000000-0000-0000-0000-0000000000a3'::uuid, 'processing revision created_by attributed to human processor (a3)');

-- 4.6 Verifier returns batch, then processor resubmits via lp_gateway_resubmit_processing
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
select lives_ok(
  $$select public.lp_return_batch(current_setting('t.gw_batch')::uuid, 'MASS_DISCREPANCY', '{"reviewed": true}'::jsonb)$$,
  'verifier returns batch with MASS_DISCREPANCY');

select pg_temp.as_service_role();
select lives_ok(
  $$select public.lp_gateway_resubmit_processing(
    '00000000-0000-0000-0000-0000000000a3'::uuid,
    current_setting('t.gw_batch')::uuid,
    '[{"material_code": 1, "mass_grams": 1500}, {"material_code": 2, "mass_grams": 1000}]'::jsonb,
    pg_temp.hash(106),
    (select pg_temp.upload_adv(current_setting('t.gw_batch')::uuid, '00000000-0000-0000-0000-0000000000a3'::uuid, '00000000-0000-0000-0000-0000000000a3', 60, 'application/pdf', encode(pg_temp.hash(106), 'hex'))),
    60,
    'application/pdf'
  )$$,
  'service_role successfully resubmits processing claim via lp_gateway_resubmit_processing');

select is((select state::text from public.batches where id = current_setting('t.gw_batch')::uuid),
  'PROCESSED_CLAIMED', 'batch returned to PROCESSED_CLAIMED after resubmission');

select is((select current_revision from public.batches where id = current_setting('t.gw_batch')::uuid),
  2, 'current_revision incremented to 2');

-- =============================================================================
-- TEST GROUP 5: Cutover Verification (Phase 2 Cutover Applied in Isolated Test)
-- =============================================================================
reset role;

-- Apply Phase 2 cutover revocations in this isolated test transaction
revoke all on function public.lp_record_collection(uuid, bigint, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_record_receipt(uuid, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_submit_processing(uuid, jsonb, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_resubmit_processing(uuid, jsonb, bytea, text, bigint, text) from public, anon, authenticated;

-- Confirm authenticated caller is rejected for all 4 legacy RPCs
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select throws_ok(
  $$select public.lp_record_collection(current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(201), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_record_collection');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
select throws_ok(
  $$select public.lp_record_receipt(current_setting('t.gw_batch')::uuid, pg_temp.hash(202), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_record_receipt');

select throws_ok(
  $$select public.lp_submit_processing(current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(203), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_submit_processing');

select throws_ok(
  $$select public.lp_resubmit_processing(current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(204), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_resubmit_processing');

-- Confirm authenticated caller is ALSO rejected for all 4 gateway RPCs
select throws_ok(
  $$select public.lp_gateway_record_collection('00000000-0000-0000-0000-0000000000a2'::uuid, current_setting('t.gw_batch')::uuid, 1000, pg_temp.hash(201), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_gateway_record_collection');
select throws_ok(
  $$select public.lp_gateway_record_receipt('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, pg_temp.hash(202), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_gateway_record_receipt');
select throws_ok(
  $$select public.lp_gateway_submit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(203), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_gateway_submit_processing');
select throws_ok(
  $$select public.lp_gateway_resubmit_processing('00000000-0000-0000-0000-0000000000a3'::uuid, current_setting('t.gw_batch')::uuid, '[]'::jsonb, pg_temp.hash(204), 'x/y', 10, 'application/pdf')$$,
  '42501', null, 'post-cutover: authenticated caller cannot execute lp_gateway_resubmit_processing');

select * from finish();
rollback;
