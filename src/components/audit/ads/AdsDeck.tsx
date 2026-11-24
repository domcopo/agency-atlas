// Google Ads audit pages (docs/AUDITS_HUB_ADS_LEADERBOARD_PLAN.md Phase 3): 1280×720 each, in
// the same style as the SEO audit, only the checkpoints picked. Every number goes through
// FigValue (missing = "not found"); money is a labeled model with its inputs printed;
// competitor spend is labeled "estimate". Prices come only from the owner's settings.

import type { ReactNode } from "react";
import { FigValue, ModelTag } from "@/components/audit/Bits";
import { KpiCards } from "@/components/audit/KpiCards";
import { ScaledSlide } from "@/components/audit/ScaledSlide";
import { ADS_SECTION_IDS, adsDeckPages, adsMarket, budgetRows, headlineBudget, midCpc, type AdsBundle, type AdsPageKey, type AdsSectionId, type BudgetRow } from "@/lib/audit/ads";
import { SOURCE_LABELS, type Fig } from "@/lib/audit/data";
import { fmtDate, fmtNum, fmtPct, fmtUsd, NOT_FOUND } from "@/lib/audit/format";

interface PageProps {
  bundle: AdsBundle;
  pageNo: number;
  pageCount: number;
  on: Set<AdsSectionId>;
}

function AdsSlide({ bundle, page, pageCount, title, aside, subtitle, children }: { bundle: AdsBundle; page: number; pageCount: number; title: string; aside?: string; subtitle?: string; children: ReactNode }) {
  const sources = bundle.data.sourcesUsed.map((s) => SOURCE_LABELS[s]).join(" · ") || "not pulled yet";
  return (
    <section className="audit-slide" aria-label={`Page ${page}: ${title}`}>
      {bundle.sample && <span className="audit-sample-chip">SAMPLE · FICTIONAL BUSINESS · DRY RUN $0</span>}
      <p className="audit-kicker">GOOGLE ADS AUDIT · {bundle.intake.company.toUpperCase()}</p>
      <h2 className="audit-title">
        {title}
        {aside && <small>/ {aside}</small>}
      </h2>
      {subtitle && <p className="audit-sub">{subtitle}</p>}
      <div className="audit-body">{children}</div>
      <footer className="audit-footer">
        <b>{bundle.agencyName.toUpperCase()}</b>
        <span>
          Custom Google Ads Audit · {bundle.intake.domain} · Data retrieved {fmtDate(bundle.data.retrieved)} ({sources})
        </span>
        <span>
          Page {page} / {pageCount}
        </span>
      </footer>
    </section>
  );
}

const cpc = (v: number) => fmtUsd(v, { cents: true });
const yes = (f: Fig<boolean>, y: string, n: string) => (f.value === null ? <span className="audit-nf">{NOT_FOUND}</span> : f.value ? y : n);
const assumption = (confirmed: boolean) => (confirmed ? <span className="audit-tag good">client figure</span> : <span className="audit-tag assumption">assumption</span>);

function Inputs({ bundle }: { bundle: AdsBundle }) {
  const i = bundle.intake;
  return (
    <p className="audit-note" style={{ margin: 0 }}>
      Inputs: average job {fmtUsd(i.avgJobUsd, { exact: true })} {assumption(i.avgJobConfirmed)} · clicks → leads {fmtPct(i.clickToLeadRate, 1)} <span className="audit-tag assumption">assumption</span> · leads → jobs {fmtPct(i.leadToJobRate, 1)}{" "}
      <span className="audit-tag assumption">assumption</span>. Revenue is job revenue before costs, not profit.
    </p>
  );
}

function MarketPage({ bundle, pageNo, pageCount }: PageProps) {
  const market = adsMarket(bundle.data);
  const rows = budgetRows(bundle.intake, market);
  const head = headlineBudget(rows);
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="What Google Ads could bring in" aside={`${bundle.intake.hqTown} and nearby`} subtitle={`${bundle.intake.company} · ${bundle.intake.niche}`}>
      <KpiCards
        items={[
          { value: fmtNum(market.searches), label: "Searches a month", detail: `${bundle.data.keywords.length} money keywords` },
          { value: market.cpcUsd === null ? NOT_FOUND : cpc(market.cpcUsd), label: "Typical cost per click", detail: "middle of Google's bid range, search-weighted" },
          { value: head ? fmtNum(head.leads, 1) : NOT_FOUND, label: "Leads a month", detail: head ? `at ${fmtUsd(head.budgetUsd, { exact: true })}/mo budget (model)` : "add a budget" },
          { value: head ? fmtUsd(head.revenueUsd) : NOT_FOUND, label: "Job revenue a month", detail: head?.returnPerDollar !== null && head?.returnPerDollar !== undefined ? `about $${head.returnPerDollar.toFixed(2)} per $1 of ads (model)` : "model" },
        ]}
      />
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.2 }}>
          <h3 style={{ marginTop: 0 }}>
            How the numbers work <ModelTag />
          </h3>
          <p style={{ margin: "6px 0 10px" }}>
            Ad budget ÷ cost per click = clicks. About {fmtPct(bundle.intake.clickToLeadRate)} of clicks call or fill in a form (1 in {Math.round(1 / bundle.intake.clickToLeadRate)}), about {fmtPct(bundle.intake.leadToJobRate)} of those become jobs, and each job is worth about {fmtUsd(bundle.intake.avgJobUsd, { exact: true })}.
          </p>
          <BudgetTable rows={rows} compact />
        </div>
        <div className="audit-card" style={{ flex: 0.8, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <h3 style={{ marginTop: 0 }}>The opportunity</h3>
            <p style={{ margin: "6px 0" }}>
              {market.searches === null
                ? "Search numbers aren't pulled yet. Once they are, this shows how many people look for these services every month and what reaching them costs."
                : `${fmtNum(market.searches)} searches a month for these services in ${bundle.intake.hqTown} and nearby. Ads put the business at the top of those searches from day one, while SEO builds.`}
            </p>
          </div>
          <Inputs bundle={bundle} />
        </div>
      </div>
    </AdsSlide>
  );
}

function BudgetTable({ rows, compact = false }: { rows: BudgetRow[]; compact?: boolean }) {
  return (
    <table className="audit-table">
      <thead>
        <tr>
          <th>Monthly ad budget</th>
          <th className="num">Clicks</th>
          <th className="num">Leads</th>
          <th className="num">Jobs</th>
          {!compact && <th className="num">Cost per lead</th>}
          <th className="num">Job revenue</th>
          <th className="num">Per $1 of ads</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, n) => (
          <tr key={r.budgetUsd} className={n === Math.floor((rows.length - 1) / 2) ? "you" : undefined}>
            <td style={{ fontWeight: 700 }}>
              {fmtUsd(r.budgetUsd, { exact: true })}
              {r.overMarket && <span className="audit-unverified">more than the market&apos;s searches</span>}
            </td>
            <td className="num">{fmtNum(r.clicks)}</td>
            <td className="num">{fmtNum(r.leads, 1)}</td>
            <td className="num">{fmtNum(r.jobs, 1)}</td>
            {!compact && <td className="num">{fmtUsd(r.costPerLeadUsd, { exact: true })}</td>}
            <td className="num">
              <b>{fmtUsd(r.revenueUsd)}</b>
            </td>
            <td className="num">{r.returnPerDollar === null ? NOT_FOUND : `$${r.returnPerDollar.toFixed(2)}`}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CpcPage({ bundle, pageNo, pageCount }: PageProps) {
  const kws = [...bundle.data.keywords].sort((a, b) => (b.searches.value ?? -1) - (a.searches.value ?? -1)).slice(0, 14);
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="What a click costs" aside="money keywords" subtitle="Google's own bid ranges for the top of the page. Cheaper, busier keywords are where a budget goes furthest.">
      <div className="audit-card" style={{ flex: 1 }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th className="num">Searches/mo</th>
              <th className="num">Low bid</th>
              <th className="num">High bid</th>
              <th className="num">Typical</th>
              <th className="num">Competition</th>
            </tr>
          </thead>
          <tbody>
            {kws.map((k) => {
              const mid = midCpc(k);
              return (
                <tr key={k.keyword}>
                  <td style={{ fontWeight: 600 }}>{k.keyword}</td>
                  <td className="num">
                    <FigValue fig={k.searches} />
                  </td>
                  <td className="num">
                    <FigValue fig={k.cpcLowUsd} format={cpc} />
                  </td>
                  <td className="num">
                    <FigValue fig={k.cpcHighUsd} format={cpc} />
                  </td>
                  <td className="num">{mid === null ? <span className="audit-nf">{NOT_FOUND}</span> : <b>{cpc(mid)}</b>}</td>
                  <td className="num">
                    <FigValue fig={k.competition} format={(v) => `${Math.round(v)}/100`} />
                  </td>
                </tr>
              );
            })}
            {!kws.length && (
              <tr>
                <td colSpan={6} className="audit-nf">
                  No keywords yet: add services to the audit.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdsSlide>
  );
}

function CalculatorPage({ bundle, pageNo, pageCount }: PageProps) {
  const market = adsMarket(bundle.data);
  const rows = budgetRows(bundle.intake, market);
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="Budget calculator" aside="what each budget could bring in" subtitle="Every row is a model from the inputs below, not a promise. Real results depend on the ads, the landing page and how fast calls are answered.">
      <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
        <h3 style={{ margin: 0 }}>
          Clicks → leads → jobs → revenue <ModelTag />
        </h3>
        <BudgetTable rows={rows} />
        <p style={{ margin: 0 }}>
          Typical cost per click: <b>{market.cpcUsd === null ? NOT_FOUND : cpc(market.cpcUsd)}</b> (search-weighted middle of the bid range across {market.keywordsPriced} priced keyword{market.keywordsPriced === 1 ? "" : "s"}). Searches a month: <b>{fmtNum(market.searches)}</b>.
        </p>
        <Inputs bundle={bundle} />
        <p className="audit-note" style={{ margin: 0 }}>
          Our management fee is separate from the ad budget (see the plan page). Per $1 of ads = modeled job revenue ÷ ad budget.
        </p>
      </div>
    </AdsSlide>
  );
}

function CompetitorsPage({ bundle, pageNo, pageCount, on }: PageProps) {
  const showSeen = on.has("ads_bidders");
  const showSpend = on.has("ads_spend");
  const checked = bundle.data.searchesChecked;
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="Who's bidding" aside="competitors in their ads" subtitle={showSeen ? `Ads seen on ${checked ? `${checked} money searches` : "the money searches"} from ${bundle.intake.hqTown}.` : undefined}>
      <div className="audit-card" style={{ flex: 1 }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th>Competitor</th>
              {showSeen && <th className="num">Searches showing their ad</th>}
              {showSpend && <th className="num">Paid clicks/mo (estimate)</th>}
              {showSpend && <th className="num">Ad spend/mo (estimate)</th>}
            </tr>
          </thead>
          <tbody>
            {bundle.data.bidders.map((b) => (
              <tr key={b.domain}>
                <td>
                  <b>{b.name}</b>
                  <span className="sub"> {b.domain}</span>
                </td>
                {showSeen && (
                  <td className="num">
                    <FigValue fig={b.adsSeen} format={(v) => (checked ? `${v} of ${checked}` : fmtNum(v))} />
                  </td>
                )}
                {showSpend && (
                  <td className="num">
                    <FigValue fig={b.paidClicks} />
                  </td>
                )}
                {showSpend && (
                  <td className="num">
                    <FigValue fig={b.spendUsd} format={(v) => fmtUsd(v)} />
                  </td>
                )}
              </tr>
            ))}
            {!bundle.data.bidders.length && (
              <tr>
                <td colSpan={4} className="audit-nf">
                  Competitors not pulled yet: the audit run finds who shows ads on the money searches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {showSpend && <p className="audit-note">Spend and paid clicks are third-party estimates of what each website pays Google, not their real invoices.</p>}
      </div>
    </AdsSlide>
  );
}

function TodayPage({ bundle, pageNo, pageCount, on }: PageProps) {
  const c = bundle.data.client;
  const rows: [string, ReactNode, string][] = [];
  if (on.has("ads_running")) {
    rows.push(["Showing up in Google Ads today", yes(c.runningAds, "Yes", "No ads seen"), "Live Google results"]);
    rows.push(["Page their ad opens", c.adPage.value === null ? <span className="audit-nf">{NOT_FOUND}</span> : c.adPage.value, "Live Google results"]);
  }
  if (on.has("ads_landing")) {
    rows.push(["Mobile speed score (0–100)", <FigValue key="s" fig={c.mobileSpeed} />, "Google Lighthouse"]);
    rows.push(["Tap-to-call button near the top", yes(c.callButton, "Yes", "Missing"), "Page check"]);
    rows.push(["Contact form near the top", yes(c.form, "Yes", "Missing"), "Page check"]);
  }
  if (on.has("ads_lsa")) rows.push(['"Google Guaranteed" spots on their searches', yes(c.lsaShown, "Shown", "Not shown"), "Live Google results"]);
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="Their ads today" aside={bundle.intake.domain} subtitle="Where the business stands now, before any changes.">
      <div className="audit-card" style={{ flex: 1 }}>
        <table className="audit-table">
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
              <th>How we checked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value, how]) => (
              <tr key={label}>
                <td style={{ fontWeight: 600 }}>{label}</td>
                <td>{value}</td>
                <td className="sub">{how}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {on.has("ads_lsa") && <p className="audit-note">Local Services Ads charge per lead instead of per click, and show above normal ads for many home-service trades.</p>}
      </div>
    </AdsSlide>
  );
}

const RAMP = [
  { label: "Month 1", name: "Set up and learn", tasks: "Call and form tracking, campaigns for the money keywords, negative keywords, ads written for each service." },
  { label: "Months 2–3", name: "Tune", tasks: "Move budget to the keywords that bring calls, test new ads and landing-page changes, trim wasted clicks." },
  { label: "Months 4+", name: "Scale", tasks: "Add budget where cost per lead is lowest, add nearby towns and services, report leads and jobs monthly." },
];

function PlanPage({ bundle, pageNo, pageCount }: PageProps) {
  const plans = bundle.plans;
  const contact = [bundle.agencyName, bundle.agencyWebsite].filter(Boolean).join(" · ");
  return (
    <AdsSlide bundle={bundle} page={pageNo} pageCount={pageCount} title="Plan & investment" aside="ad budget + management">
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.1 }}>
          <h3 style={{ marginTop: 0 }}>The first months</h3>
          <table className="audit-table">
            <tbody>
              {RAMP.map((r) => (
                <tr key={r.label}>
                  <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.label}</td>
                  <td>
                    <b>{r.name}</b>
                    <div className="sub">{r.tasks}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="audit-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <h3 style={{ margin: 0 }}>Monthly investment</h3>
          {plans.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {plans.map((p) => (
                <div key={p.name} className={`audit-price${p.recommended ? " rec" : ""}`}>
                  {p.recommended && <span className="badge">RECOMMENDED</span>}
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "var(--a-body)", marginTop: 2 }}>{p.summary}</div>
                  </div>
                  <div className="p">
                    {fmtUsd(p.feeUsd, { exact: true })}
                    <small>/month</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="audit-nf">Management prices aren&apos;t set yet. The owner adds them in Audits → Settings.</p>
          )}
          <div className="audit-dark">
            <em>Ad budget is separate</em> and paid straight to Google: {bundle.intake.budgetsUsd.map((b) => fmtUsd(b, { exact: true })).join(", ")} a month were modeled in this audit.
            <div style={{ fontSize: 11.5, opacity: 0.8, marginTop: 8 }}>
              <em>Next step:</em> a 20-minute call to walk through these numbers. {contact}
            </div>
          </div>
        </div>
      </div>
    </AdsSlide>
  );
}

const PAGES: Record<AdsPageKey, (p: PageProps) => ReactNode> = {
  market: MarketPage,
  cpc: CpcPage,
  calculator: CalculatorPage,
  competitors: CompetitorsPage,
  today: TodayPage,
  plan: PlanPage,
};

/** The chosen pages (all of them when `sections` is left out), numbered 1…N. */
export function AdsDeck({ bundle, sections }: { bundle: AdsBundle; sections?: readonly AdsSectionId[] }) {
  const list = sections ?? ADS_SECTION_IDS;
  const keys = adsDeckPages(list);
  const on = new Set(list);
  return (
    <>
      {keys.map((key, i) => {
        const Page = PAGES[key];
        return (
          <ScaledSlide key={key}>
            <Page bundle={bundle} pageNo={i + 1} pageCount={keys.length} on={on} />
          </ScaledSlide>
        );
      })}
    </>
  );
}

