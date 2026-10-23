-- =============================================================================
-- LoopProof forward-only migration: Harden evidence storage validation
-- =============================================================================
-- Validates that evidence registration:
-- 1. Requires the storage path to reside in the batch's dedicated folder.
-- 2. Requires the storage object to exist in the private 'evidence' bucket.
-- 3. Strictly validates uploader identity:
--    - Resolves owner (deprecated uuid column) and owner_id (text column).
--    - Rejects missing uploader identity (SQLSTATE 42501).
--    - Rejects malformed uploader identity (SQLSTATE 42501).
--    - Rejects conflicting uploader identities if both are present (SQLSTATE 42501).
--    - Rejects foreign uploader identities that do not match auth.uid() (SQLSTATE 42501).
-- 4. Strictly requires non-null byte_size metadata matching declared byte_size (SQLSTATE 22023).
-- 5. Strictly requires non-null mimetype metadata matching declared mime_type (SQLSTATE 22023).
-- 6. Strictly requires non-null, valid 64-character hexadecimal sha256 user_metadata
--    matching declared sha256 digest (SQLSTATE 22023).
--
-- SECURITY NOTICE:
-- Checking storage.objects.user_metadata enforces consistency between storage
-- metadata and the RPC call, but does NOT prove physical file-byte integrity
-- because user_metadata is supplied by the uploader. PostgreSQL does not have
-- direct access to raw storage binary streams to independently re-hash the file.
-- =============================================================================

create or replace function private.add_evidence(
  p_batch_id uuid, p_kind public.evidence_kind, p_revision integer,
  p_sha256 bytea, p_storage_path text, p_byte_size bigint, p_mime_type text)
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
begin
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

  if v_uploader <> auth.uid() then
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
  values (p_batch_id, p_kind, p_revision, p_sha256, p_storage_path, p_byte_size, p_mime_type, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function private.add_evidence(
  uuid, public.evidence_kind, integer, bytea, text, bigint, text
) from public, anon, authenticated;
