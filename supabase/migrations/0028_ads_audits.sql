-- Agency Atlas: Google Ads audits (approved 2026-11-24, docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md
-- Phase 3). Numbered 0028: the owner set 0024 Scout, 0025 client care, 0026 leaderboard,
-- 0027 SEO Watcher. It needs 0023 (saved audits) and nothing else.
--
-- Run ONCE in the Supabase SQL Editor. Before running it, check that today's daily backup
-- exists (Supabase > Database > Backups). Undo steps are at the end.
--
-- What this changes (no data is changed or removed):
-- * audits.sections – the allowed checkpoint list now depends on the kind of audit:
--                     SEO audits keep the same 13 ids as before; Google Ads audits get
--                     their own 9 ids (all start with "ads_"). Keep both lists in step
--                     with src/lib/audit/sections.ts and src/lib/audit/ads.ts (a test checks).
-- * audit_settings.ads_plans – up to 4 Google Ads management plans (name, monthly fee,
--                     summary) for the Ads audit's Investment page. Owner edits, like the
--                     SEO plans; owner, managers and salespeople read.
-- Who can read or save audits is unchanged (0023 rules). Nothing here talks to
-- GoHighLevel, Google Ads or any outside service.

begin;

-- 1. Checkpoints by kind. The old rule (SEO ids only) is replaced by one that knows both.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.audits'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%sections <@%'
  loop
    execute format('alter table public.audits drop constraint %I', c);
  end loop;
end;
$$;

alter table public.audits add constraint audits_sections_by_kind check (
  cardinality(sections) <= 20
  and (
    (kind = 'seo' and sections <@ array['summary', 'rankings', 'heatmap', 'competitors', 'fixes', 'keywords',
                                        'revenue', 'timeline', 'investment', 'reviews', 'site_health',
                                        'ai_search', 'backlinks']::text[])
    or
    (kind = 'ads' and sections <@ array['ads_market', 'ads_cpc', 'ads_calculator', 'ads_bidders', 'ads_spend',
                                        'ads_running', 'ads_landing', 'ads_lsa', 'ads_plan']::text[])
  )
);

-- 2. Google Ads management plans (prices come only from here, never from code).
alter table public.audit_settings
  add column ads_plans jsonb not null default '[]'
    check (jsonb_typeof(ads_plans) = 'array' and jsonb_array_length(ads_plans) <= 4 and pg_column_size(ads_plans) <= 4000);
grant update (ads_plans) on public.audit_settings to authenticated;

commit;

-- Undo (only if asked; first archive or change any saved Google Ads audits, since the old
-- rule refuses their checkpoints):
--   begin;
--   alter table public.audits drop constraint audits_sections_by_kind;
--   alter table public.audits add constraint audits_sections_check check (
--     cardinality(sections) <= 20 and sections <@ array['summary', 'rankings', 'heatmap', 'competitors',
--     'fixes', 'keywords', 'revenue', 'timeline', 'investment', 'reviews', 'site_health', 'ai_search', 'backlinks']::text[]);
--   revoke update (ads_plans) on public.audit_settings from authenticated;
--   alter table public.audit_settings drop column ads_plans;
--   commit;
