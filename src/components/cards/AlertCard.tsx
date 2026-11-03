import { AlertTriangle, Info, Siren } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/format";
import type { Alert } from "@/lib/types";

const styles = {
  critical: { icon: Siren, ring: "border-rose/40 bg-rose/10", iconColor: "text-rose", word: "Critical" },
  warning: { icon: AlertTriangle, ring: "border-amber/35 bg-amber/8", iconColor: "text-amber", word: "Warning" },
  info: { icon: Info, ring: "border-sky/30 bg-sky/8", iconColor: "text-sky", word: "Info" },
} as const;

export function AlertCard({ alert }: { alert: Alert }) {
  const s = styles[alert.severity];
  const Icon = s.icon;
  const body = (
    <>
      <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", s.iconColor)} />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          <span className="sr-only">{s.word}: </span>
          {alert.title}
        </p>
        <p className="mt-0.5 text-xs text-muted">{alert.detail}</p>
      </div>
    </>
  );
  const classes = cn("flex gap-3 rounded-2xl border p-3.5", s.ring);

  return alert.clientId ? (
    <Link href={`/clients/${alert.clientId}`} className={cn(classes, "pressable")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}
