// Page 5: why competitors rank higher, and the fixes that matter.

import type { AuditPageProps } from "../Slide";
import { FixesList } from "../FixesList";
import { Scorecard } from "../Scorecard";
import { Slide } from "../Slide";

export function FixesPage({ bundle, pageNo, pageCount }: AuditPageProps) {
  const { config, data } = bundle;
  const short = config.company.name.replace(/\s*\(.*\)$/, "");
  return (
    <Slide bundle={bundle} page={pageNo ?? 5} pageCount={pageCount} title="Why competitors rank higher" aside={`and the ${data.narrative.fixes.length} fixes that matter`}>
      <div className="audit-row" style={{ flex: 1 }}>
        <div className="audit-card" style={{ flex: 1.1 }}>
          <h3>Side by side: what they have that {short} doesn&apos;t</h3>
          <Scorecard rows={data.scorecard} clientLabel={short} />
        </div>
        <div className="audit-card" style={{ flex: 1 }}>
          <h3>Priorities</h3>
          <FixesList fixes={data.narrative.fixes} />
        </div>
      </div>
    </Slide>
  );
}
