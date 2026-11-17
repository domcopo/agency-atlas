// Keyword × site matrix of Google organic positions. Client column first.

import type { KeywordRow } from "@/lib/audit/data";
import { FigValue, Pos } from "./Bits";

export interface MatrixColumn {
  domain: string;
  label: string;
  isClient?: boolean;
}

export function PositionMatrix({ keywords, columns, showVolume = true }: { keywords: KeywordRow[]; columns: MatrixColumn[]; showVolume?: boolean }) {
  return (
    <table className="audit-table compact">
      <thead>
        <tr>
          <th>Keyword</th>
          {showVolume && <th className="num">Vol/mo</th>}
          {columns.map((c) => (
            <th key={c.domain} className="num" style={c.isClient ? { color: "var(--a-pink)" } : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keywords.map((k) => (
          <tr key={k.keyword}>
            <td>{k.keyword}</td>
            {showVolume && (
              <td className="num">
                <FigValue fig={k.volume} />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.domain} className="num">
                <Pos p={k.positions[c.domain]} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
