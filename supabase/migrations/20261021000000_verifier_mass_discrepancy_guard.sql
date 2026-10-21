-- =============================================================================
-- LoopProof forward-only migration: Verifier MASS_DISCREPANCY guard
-- =============================================================================
-- Prevents returning a batch with reason MASS_DISCREPANCY when the active
-- revision's total_output_grams equals the batch's intake_mass_grams (0 g
-- unaccounted mass), while preserving MASS_DISCREPANCY returns whenever a
-- genuine discrepancy exists (total_output_grams < intake_mass_grams).
-- =============================================================================

create or replace function private.decide(
  p_batch_id uuid, p_decision public.decision_kind,
  p_return public.return_reason, p_reject public.reject_reason, p_checklist jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  b       public.batches;
  v_to    public.batch_state;
  v_ev    uuid;
  v_total bigint;
begin
  b := private.lock_batch(p_batch_id, 'verifier');
  -- Defense in depth: the assigned verifier is already distinct (table constraint), re-check anyway.
  if auth.uid() in (b.collector_id, b.processor_id) then
    raise exception 'verifier must be independent of collector and processor' using errcode = '42501';
  end if;
  perform private.require_state(b, array['PROCESSED_CLAIMED']::public.batch_state[]);

  p_checklist := coalesce(p_checklist, '{}'::jsonb);
  if jsonb_typeof(p_checklist) <> 'object'
     or (select count(*) from jsonb_each(p_checklist)) > 20
     or exists (select 1 from jsonb_each(p_checklist) c where jsonb_typeof(c.value) <> 'boolean' or length(c.key) > 64) then
    raise exception 'checklist must be an object of at most 20 boolean items' using errcode = '22023';
  end if;

  v_to := (case p_decision
             when 'verified' then 'VERIFIED'
             when 'returned' then 'RETURNED'
             else 'REJECTED' end)::public.batch_state;

  select r.evidence_id, r.total_output_grams into v_ev, v_total
  from public.processing_revisions r where r.batch_id = b.id and r.revision = b.current_revision;

  if p_decision = 'returned' and p_return = 'MASS_DISCREPANCY' and v_total = b.intake_mass_grams then
    raise exception 'cannot return with MASS_DISCREPANCY when total_output_grams (%) equals intake_mass_grams (%)', v_total, b.intake_mass_grams using errcode = '22023';
  end if;

  insert into public.verifier_decisions (batch_id, revision, decision, return_reason, reject_reason, checklist, verifier_id)
  values (b.id, b.current_revision, p_decision, p_return, p_reject, p_checklist, auth.uid());   -- table CHECKs enforce reasons

  update public.batches set state = v_to where id = b.id;
  perform private.log_event(b.id, b.state, v_to, v_ev, b.current_revision, p_return, p_reject);
end;
$$;

revoke all on function private.decide(
  uuid, public.decision_kind, public.return_reason, public.reject_reason, jsonb
) from public, anon, authenticated;
