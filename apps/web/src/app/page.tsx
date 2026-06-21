import Link from 'next/link';
import { formatCurrency, formatRoas, roasBand } from '@adlink/core';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SAMPLE = { spend: 1240, revenue: 4980, roas: 4980 / 1240 };

// ROAS heatmap tints (DESIGN.md §2) — sample colors; the real cells live in the table phase.
const BAND_BG: Record<string, string> = {
  loss: 'bg-[#FEE2E2] text-[#7f1d1d] dark:bg-red-500/15 dark:text-red-300',
  thin: 'bg-[#FEF3C7] text-[#78350f] dark:bg-amber-500/15 dark:text-amber-300',
  healthy: 'bg-[#DCFCE7] text-[#14532d] dark:bg-emerald-500/15 dark:text-emerald-300',
  winner: 'bg-[#BBF7D0] text-[#14532d] dark:bg-emerald-500/20 dark:text-emerald-300',
};

export default function Home() {
  const band = roasBand(SAMPLE.roas) ?? 'healthy';
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 px-6">
      <div className="flex w-full items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">AdLink</span>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Ad spend, meet real revenue.</h1>
        <p className="text-muted-foreground">
          Join Meta Ads to your CRM and see which creative actually makes money — down to the ad.
        </p>
      </div>

      <div className="w-full rounded-lg bg-card p-6 shadow-sm">
        <div className="grid grid-cols-3 gap-6">
          <Stat label="Spend" value={formatCurrency(SAMPLE.spend, 'USD')} />
          <Stat label="Revenue" value={formatCurrency(SAMPLE.revenue, 'USD')} />
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">ROAS</div>
            <div
              className={cn(
                'inline-flex rounded-sm px-2 py-0.5 font-mono text-lg font-medium',
                BAND_BG[band],
              )}
            >
              {formatRoas(SAMPLE.roas)}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Phase 0 scaffold · design tokens + Geist + dark mode live
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}
