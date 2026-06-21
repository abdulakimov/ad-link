import { roasBand } from '@adlink/core';

/** ROAS quality → subtle cell tint (DESIGN.md §2). Text stays readable (AA). */
export function roasCellClass(roas: number | null | undefined): string {
  switch (roasBand(roas)) {
    case 'loss':
      return 'bg-[#FEE2E2] text-[#7f1d1d] dark:bg-red-500/15 dark:text-red-300';
    case 'thin':
      return 'bg-[#FEF3C7] text-[#78350f] dark:bg-amber-500/15 dark:text-amber-300';
    case 'healthy':
      return 'bg-[#DCFCE7] text-[#14532d] dark:bg-emerald-500/15 dark:text-emerald-300';
    case 'winner':
      return 'bg-[#BBF7D0] text-[#14532d] dark:bg-emerald-500/20 dark:text-emerald-300';
    default:
      return 'text-muted-foreground';
  }
}
