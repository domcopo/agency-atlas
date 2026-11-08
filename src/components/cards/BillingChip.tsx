// Billing status chip (owner only; screens pass it only when the owner is signed in).
import { CHIP_LABEL, type BillingChip as Chip } from "@/lib/billing";

const tone: Record<Chip, string> = {
  paid: "border-lime/40 bg-lime/10 text-lime",
  due_soon: "border-amber/40 bg-amber/10 text-amber",
  overdue: "border-rose/40 bg-rose/10 text-rose",
  failed: "border-rose/60 bg-rose/20 text-rose",
};

export function BillingChip({ chip, title }: { chip: Chip; title?: string }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone[chip]}`}>
      {CHIP_LABEL[chip]}
    </span>
  );
}
