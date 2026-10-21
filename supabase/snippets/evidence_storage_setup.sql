
-- LoopProof private evidence storage setup.
-- Run only after the local Supabase Storage service has initialized.

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'evidence',
  'evidence',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy evidence_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidence'
    and (
      select private.is_batch_participant(
        private.storage_batch_id(name)
      )
    )
  );

create policy evidence_objects_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidence'
    and (
      select private.can_upload_evidence(name)
    )
  );

-- No UPDATE or DELETE policies:
-- uploaded evidence objects are immutable to clients.
