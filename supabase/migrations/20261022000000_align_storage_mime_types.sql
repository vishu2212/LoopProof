-- =============================================================================
-- LoopProof forward-only migration: Align evidence bucket MIME types
-- =============================================================================
-- Aligns storage.buckets.allowed_mime_types for 'evidence' with the
-- public.evidence.mime_type check constraint ('application/pdf', 'image/jpeg', 'image/png').
--
-- Background:
-- In 20261020000000_loopproof_core_schema.sql, the storage bucket 'evidence'
-- included 'application/json', whereas the public.evidence table CHECK constraint
-- only permitted ('application/pdf', 'image/jpeg', 'image/png').
-- The application code (web/lib/live-batches.ts) strictly enforces these three
-- formats with magic-byte inspection.
--
-- This forward-only migration updates storage.buckets to restrict allowed
-- MIME types to ('application/pdf', 'image/jpeg', 'image/png'), eliminating
-- the discrepancy at the storage layer.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'evidence';
