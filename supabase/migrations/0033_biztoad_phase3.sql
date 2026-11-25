-- Agency Atlas: BizToad Phase 3 (approved 2026-11-24, docs/BIZTOAD_PLAN.md section 12).
-- Run after 0030 (BizToad). It doesn't depend on 0031 or 0032.
--
-- One small change: each person may READ their own BizToad ('ask_toad') cost rows, so
-- developers and salespeople can see "you've used $X of $5 this month". Everything else in
-- the AI cost log stays owner/managers only (0005). Nobody gains insert, update or delete:
-- logging is unchanged (0030), and there is still no update or delete grant at all.
--
-- Which roles may ask is already the owner's switch in toad_settings (0030), set on the
-- Data Safety page. Two-factor is still required by ai_usage_requires_2fa (0005).
-- Undo steps are at the end.

begin;

create policy ai_usage_read_own_toad on public.ai_usage for select to authenticated
  using (feature = 'ask_toad' and requested_by = (select auth.uid()));

commit;

-- ---------------------------------------------------------------------------
-- Undo (only if needed):
-- ---------------------------------------------------------------------------
-- drop policy ai_usage_read_own_toad on public.ai_usage;
