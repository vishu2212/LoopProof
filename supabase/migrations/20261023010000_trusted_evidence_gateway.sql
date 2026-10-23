-- =============================================================================
-- LoopProof forward-only migration: Trusted Evidence Gateway (Phase 1)
-- =============================================================================
-- Adds trusted gateway RPCs executed exclusively by service_role on behalf of
-- authenticated users after server-side binary SHA-256 byte hashing.
--
-- Preserves:
-- - Row-level locking (SELECT ... FOR UPDATE) via private.lock_batch
-- - Deep role verification via public.user_roles
-- - Per-batch assignment checks (collector_id, processor_id)
-- - Lifecycle state-machine transition invariants (private.require_state)
-- - Mass-balance bounds and conservation rules (private.submit_processing_internal)
-- - Human actor audit attribution in public.evidence and public.batch_events
--
-- Security boundary:
-- - lp_gateway_* functions are accessible ONLY to service_role (HTTP 403 / 42501 for clients).
-- - In Phase 1, legacy lp_* functions remain temporarily available for backward compatibility.
-- =============================================================================

-- 1. Overload private.lock_batch to accept explicit actor_id
create or replace function private.lock_batch(p_batch_id uuid, p_role public.app_role, p_actor_id uuid)
returns public.batches
language plpgsql security definer set search_path = '' as $$
declare
  b public.batches;
begin
  if p_actor_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into b from public.batches where id = p_batch_id for update;
  if not found then
    raise exception 'unknown batch' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_actor_id and role = p_role) then
    raise exception 'missing role %', p_role using errcode = '42501';
  end if;
  if p_actor_id is distinct from (case p_role
        when 'registrar' then b.registrar_id
        when 'collector' then b.collector_id
        when 'processor' then b.processor_id
        when 'verifier'  then b.verifier_id end) then
    raise exception 'caller is not the % assigned to this batch', p_role using errcode = '42501';
  end if;
  perform set_config('loopproof.in_transition', 'on', true);
  return b;
end;
$$;

create or replace function private.lock_batch(p_batch_id uuid, p_role public.app_role)
returns public.batches
language plpgsql security definer set search_path = '' as $$
begin
  return private.lock_batch(p_batch_id, p_role, auth.uid());
end;
$$;

-- 2. Overload private.add_evidence to accept explicit submitted_by actor
create or replace function private.add_evidence(
  p_batch_id uuid, p_kind public.evidence_kind, p_revision integer,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text,
  p_submitted_by uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id             uuid;
  v_owner          uuid;
  v_owner_id_uuid  uuid;
  v_uploader       uuid;
  v_size           bigint;
  v_mimetype       text;
  v_stored_sha256  text;
  v_raw_owner_id   text;
  v_expected_user  uuid := coalesce(p_submitted_by, auth.uid());
begin
  if v_expected_user is null then
    raise exception 'missing evidence submitter' using errcode = '42501';
  end if;

  -- 1. Storage path must belong to the target batch folder
  if private.storage_batch_id(p_storage_path) is distinct from p_batch_id then
    raise exception 'evidence storage path % does not belong to batch %', p_storage_path, p_batch_id using errcode = '22023';
  end if;

  -- 2. Lookup the storage object in the private evidence bucket
  select o.owner,
         o.owner_id,
         (o.metadata->>'size')::bigint,
         o.metadata->>'mimetype',
         o.user_metadata->>'sha256'
  into v_owner, v_raw_owner_id, v_size, v_mimetype, v_stored_sha256
  from storage.objects o
  where o.bucket_id = 'evidence' and o.name = p_storage_path;

  if not found then
    raise exception 'evidence file has not been uploaded to the private bucket' using errcode = '55000';
  end if;

  -- 3. Strictly resolve and validate uploader identity
  if v_raw_owner_id is not null then
    if v_raw_owner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_owner_id_uuid := v_raw_owner_id::uuid;
    else
      raise exception 'storage object has malformed uploader identity' using errcode = '42501';
    end if;
  end if;

  if v_owner is not null and v_owner_id_uuid is not null and v_owner <> v_owner_id_uuid then
    raise exception 'storage object has conflicting uploader identities' using errcode = '42501';
  end if;

  v_uploader := coalesce(v_owner, v_owner_id_uuid);
  if v_uploader is null then
    raise exception 'storage object has no recorded uploader' using errcode = '42501';
  end if;

  if v_uploader <> v_expected_user then
    raise exception 'caller is not the recorded uploader of the evidence file' using errcode = '42501';
  end if;

  -- 4. Strictly require non-null byte_size metadata matching declared size
  if v_size is null then
    raise exception 'storage object is missing required size metadata' using errcode = '22023';
  end if;
  if v_size <> p_byte_size then
    raise exception 'byte size (%) does not match uploaded storage object size (%)', p_byte_size, v_size using errcode = '22023';
  end if;

  -- 5. Strictly require non-null mimetype metadata matching declared MIME type
  if v_mimetype is null then
    raise exception 'storage object is missing required mimetype metadata' using errcode = '22023';
  end if;
  if v_mimetype <> p_mime_type then
    raise exception 'mime type (%) does not match uploaded storage object mime type (%)', p_mime_type, v_mimetype using errcode = '22023';
  end if;

  -- 6. Strictly require non-null, valid 64-hex sha256 user_metadata matching declared digest
  if v_stored_sha256 is null then
    raise exception 'storage object is missing required sha256 user_metadata' using errcode = '22023';
  end if;
  if length(v_stored_sha256) <> 64 or v_stored_sha256 !~ '^[0-9a-fA-F]{64}$' then
    raise exception 'storage object has malformed sha256 user_metadata' using errcode = '22023';
  end if;
  if decode(v_stored_sha256, 'hex') <> p_sha256 then
    raise exception 'sha256 does not match storage object user_metadata' using errcode = '22023';
  end if;

  insert into public.evidence (batch_id, kind, revision, sha256, storage_path, byte_size, mime_type, submitted_by)
  values (p_batch_id, p_kind, p_revision, p_sha256, p_storage_path, p_byte_size, p_mime_type, v_expected_user)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function private.add_evidence(
  p_batch_id uuid, p_kind public.evidence_kind, p_revision integer,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  return private.add_evidence(p_batch_id, p_kind, p_revision, p_sha256, p_storage_path, p_byte_size, p_mime_type, auth.uid());
end;
$$;

-- 3. Overload private.log_event to accept explicit actor_id
create or replace function private.log_event(
  p_batch_id uuid, p_from public.batch_state, p_to public.batch_state, p_evidence uuid,
  p_revision integer, p_return public.return_reason, p_reject public.reject_reason,
  p_actor_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.batch_events
    (batch_id, seq, from_state, to_state, actor_id, evidence_id, revision, return_reason, reject_reason)
  select p_batch_id, coalesce(max(e.seq), 0) + 1, p_from, p_to, p_actor_id, p_evidence, p_revision, p_return, p_reject
  from public.batch_events e where e.batch_id = p_batch_id;
end;
$$;

create or replace function private.log_event(
  p_batch_id uuid, p_from public.batch_state, p_to public.batch_state, p_evidence uuid,
  p_revision integer, p_return public.return_reason, p_reject public.reject_reason)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.log_event(p_batch_id, p_from, p_to, p_evidence, p_revision, p_return, p_reject, auth.uid());
end;
$$;

-- 4. Overload private.submit_processing_internal to accept explicit actor_id
create or replace function private.submit_processing_internal(
  p_batch_id uuid, p_expected_state public.batch_state, p_outputs jsonb,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text,
  p_actor_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b       public.batches;
  v_ev    uuid;
  v_rev   integer;
  v_total bigint := 0;
  v_n     integer;
  o       record;
begin
  b := private.lock_batch(p_batch_id, 'processor', p_actor_id);
  perform private.require_state(b, array[p_expected_state]);

  if p_outputs is null or jsonb_typeof(p_outputs) <> 'array' then
    raise exception 'outputs must be a JSON array' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_outputs);
  if v_n < 1 or v_n > 16 then
    raise exception 'between 1 and 16 outputs are required' using errcode = '22023';
  end if;

  v_rev := b.current_revision + 1;
  v_ev := private.add_evidence(b.id, 'processing_claim', v_rev, p_sha256, p_storage_path, p_byte_size, p_mime_type, p_actor_id);

  for o in
    select (e ->> 'material_code')::integer as material_code,
           (e ->> 'mass_grams')::bigint     as mass_grams
    from jsonb_array_elements(p_outputs) e
  loop
    if o.material_code is null or o.material_code not between 1 and 65535 or o.mass_grams is null or o.mass_grams <= 0 then
      raise exception 'invalid output entry' using errcode = '22023';
    end if;
    v_total := v_total + o.mass_grams;
  end loop;

  if v_total > b.intake_mass_grams then
    raise exception 'total outputs (%) exceed intake (%)', v_total, b.intake_mass_grams using errcode = '22023';
  end if;

  insert into public.processing_revisions (batch_id, revision, evidence_id, total_output_grams, created_by)
  values (b.id, v_rev, v_ev, v_total, p_actor_id);

  insert into public.processing_outputs (batch_id, revision, position, material_code, mass_grams)
  select b.id, v_rev, t.ord::smallint, (t.e ->> 'material_code')::integer, (t.e ->> 'mass_grams')::bigint
  from jsonb_array_elements(p_outputs) with ordinality as t(e, ord);

  update public.batches set state = 'PROCESSED_CLAIMED', current_revision = v_rev where id = b.id;
  perform private.log_event(b.id, b.state, 'PROCESSED_CLAIMED', v_ev, v_rev, null, null, p_actor_id);
end;
$$;

create or replace function private.submit_processing_internal(
  p_batch_id uuid, p_expected_state public.batch_state, p_outputs jsonb,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.submit_processing_internal(p_batch_id, p_expected_state, p_outputs, p_sha256, p_storage_path, p_byte_size, p_mime_type, auth.uid());
end;
$$;

-- 5. Create trusted gateway RPCs (Phase 1)
create or replace function public.lp_gateway_record_collection(
  p_actor_id uuid, p_batch_id uuid, p_intake_mass_grams bigint,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.batches;
  v_ev uuid;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'forbidden: execution restricted to service_role' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'invalid actor' using errcode = '42501';
  end if;

  b := private.lock_batch(p_batch_id, 'collector', p_actor_id);
  perform private.require_state(b, array['REGISTERED']::public.batch_state[]);

  if p_intake_mass_grams is null or p_intake_mass_grams <= 0 then
    raise exception 'intake mass must be > 0 grams' using errcode = '22023';
  end if;

  v_ev := private.add_evidence(b.id, 'collection_record', null, p_sha256, p_storage_path, p_byte_size, p_mime_type, p_actor_id);
  update public.batches set state = 'COLLECTED', intake_mass_grams = p_intake_mass_grams where id = b.id;
  perform private.log_event(b.id, b.state, 'COLLECTED', v_ev, null, null, null, p_actor_id);
end;
$$;

create or replace function public.lp_gateway_record_receipt(
  p_actor_id uuid, p_batch_id uuid,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b public.batches;
  v_ev uuid;
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'forbidden: execution restricted to service_role' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'invalid actor' using errcode = '42501';
  end if;

  b := private.lock_batch(p_batch_id, 'processor', p_actor_id);
  perform private.require_state(b, array['COLLECTED']::public.batch_state[]);

  v_ev := private.add_evidence(b.id, 'receipt_record', null, p_sha256, p_storage_path, p_byte_size, p_mime_type, p_actor_id);
  update public.batches set state = 'RECEIVED' where id = b.id;
  perform private.log_event(b.id, b.state, 'RECEIVED', v_ev, null, null, null, p_actor_id);
end;
$$;

create or replace function public.lp_gateway_submit_processing(
  p_actor_id uuid, p_batch_id uuid, p_outputs jsonb,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'forbidden: execution restricted to service_role' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'invalid actor' using errcode = '42501';
  end if;

  perform private.submit_processing_internal(
    p_batch_id, 'RECEIVED'::public.batch_state, p_outputs,
    p_sha256, p_storage_path, p_byte_size, p_mime_type, p_actor_id
  );
end;
$$;

create or replace function public.lp_gateway_resubmit_processing(
  p_actor_id uuid, p_batch_id uuid, p_outputs jsonb,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' and current_user <> 'service_role' then
    raise exception 'forbidden: execution restricted to service_role' using errcode = '42501';
  end if;

  if p_actor_id is null or not exists (select 1 from auth.users where id = p_actor_id) then
    raise exception 'invalid actor' using errcode = '42501';
  end if;

  perform private.submit_processing_internal(
    p_batch_id, 'RETURNED'::public.batch_state, p_outputs,
    p_sha256, p_storage_path, p_byte_size, p_mime_type, p_actor_id
  );
end;
$$;

-- 6. Explicit least-privilege grants on gateway functions
revoke all on function public.lp_gateway_record_collection(uuid, uuid, bigint, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_gateway_record_receipt(uuid, uuid, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_gateway_submit_processing(uuid, uuid, jsonb, bytea, text, bigint, text) from public, anon, authenticated;
revoke all on function public.lp_gateway_resubmit_processing(uuid, uuid, jsonb, bytea, text, bigint, text) from public, anon, authenticated;

grant execute on function public.lp_gateway_record_collection(uuid, uuid, bigint, bytea, text, bigint, text) to service_role;
grant execute on function public.lp_gateway_record_receipt(uuid, uuid, bytea, text, bigint, text) to service_role;
grant execute on function public.lp_gateway_submit_processing(uuid, uuid, jsonb, bytea, text, bigint, text) to service_role;
grant execute on function public.lp_gateway_resubmit_processing(uuid, uuid, jsonb, bytea, text, bigint, text) to service_role;
