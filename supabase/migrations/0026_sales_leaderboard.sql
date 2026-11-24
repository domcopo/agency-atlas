-- Agency Atlas: sales leaderboard (approved 2026-11-24, docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md
-- Phase 2). Numbered 0026 by the owner on 2026-11-24 (0024 Scout, 0025 client care,
-- 0027 SEO Watcher). It does not depend on 0025, so it can run before or after it.
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
--
-- What this adds: ONE read-only view, sales_leaderboard. No tables, no data changes.
-- For each person on the board it gives ONLY: their display name, whether they are linked
-- to a GoHighLevel user, the total value of deals marked Won in GoHighLevel this month
-- (New York time), how many deals that is, and "is this me". Never which deals, which
-- clients or any lead details.
--
-- Who is on the board: every salesperson, plus the owner or a manager if the owner has
-- linked them to a GoHighLevel user (Sales > Setup). Developers are never on it.
-- Which deals count: Won copies of GoHighLevel deals (already copied by Sync), credited to
-- the GoHighLevel user the deal is assigned to. Once the owner has picked sales pipelines,
-- only those pipelines count; before that, every pipeline counts.
-- Who can read it: owner, managers and salespeople, with two-factor. Everyone else gets
-- nothing. Salespeople still cannot read won deals themselves (ghl_opportunities rules are
-- unchanged); this view hands them totals only.
-- Nothing here talks to GoHighLevel or any outside service.

begin;

-- Like my_work (0007): a view that runs with the view owner's rights so it can add up deals
-- a salesperson can't read row by row. Its WHERE clause is the lock (two-factor + role),
-- and it only ever returns totals. Supabase's advisor may call it a "security definer
-- view": expected here, and covered by the break-in tests (section 7w).
create view public.sales_leaderboard as
  select t.display_name                              as name,
         (t.user_id = (select auth.uid()))           as is_me,
         (t.ghl_user_id is not null)                 as linked,
         coalesce(sum(o.monetary_value), 0)::numeric(12, 2) as won_usd,
         count(o.ghl_id)::integer                    as won_deals
  from public.team_members t
  left join public.ghl_opportunities o
    on t.ghl_user_id is not null
   and o.assigned_user_id = t.ghl_user_id
   and o.status = 'won'
   and coalesce(o.status_changed_at, o.ghl_updated_at)
         >= (date_trunc('month', now() at time zone 'America/New_York') at time zone 'America/New_York')
   and (
     not exists (select 1 from public.sales_pipelines sp where sp.active)
     or exists (select 1 from public.sales_pipelines sp where sp.active and sp.pipeline_id = o.pipeline_id)
   )
  where (select auth.jwt() ->> 'aal') = 'aal2'
    and (select private.my_role()) in ('owner', 'manager', 'sales')
    and t.role in ('owner', 'manager', 'sales')
    and (t.role = 'sales' or t.ghl_user_id is not null)
  group by t.user_id, t.display_name, t.ghl_user_id;

revoke all on public.sales_leaderboard from public, anon, authenticated;
grant select on public.sales_leaderboard to authenticated;

commit;

-- Undo (only if asked; nothing else depends on it):
--   drop view public.sales_leaderboard;
