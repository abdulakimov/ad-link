'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { formatCurrency } from '@adlink/core';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';
import { cn } from '@/lib/utils';

type Kind = 'click' | 'lead' | 'qualified' | 'won' | 'stage';
interface Step {
  time: string;
  title: string;
  detail?: string;
  kind: Kind;
}

const DOT: Record<Kind, string> = {
  click: 'bg-chart-3',
  lead: 'bg-primary',
  qualified: 'bg-chart-1',
  won: 'bg-success',
  stage: 'bg-muted-foreground',
};

export default function LeadJourneyPage() {
  const token = useAuthToken();
  const params = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['journey', params.id],
    enabled: !!token,
    queryFn: () => api.journey(token as string, params.id),
  });

  if (isLoading || !data) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-muted-foreground">Loading…</main>;
  }

  const steps: Step[] = [
    ...data.touchPoints.map((t) => ({ time: t.occurredAt, title: 'Clicked ad', kind: 'click' as const })),
    {
      time: data.lead.createdAt,
      title: `Lead created · ${data.lead.source}`,
      detail: data.ad ? `${data.ad.campaign} › ${data.ad.name}` : 'Unattributed',
      kind: 'lead' as const,
    },
    ...data.deals.flatMap((d): Step[] => {
      const money = formatCurrency(d.amount, d.currency ?? 'USD');
      if (d.canonical === 'WON') {
        return [{ time: d.wonAt ?? d.createdAt, title: `Won · ${money}`, kind: 'won' }];
      }
      const kind: Kind = d.canonical === 'QUALIFIED' ? 'qualified' : 'stage';
      return [{ time: d.createdAt, title: `Deal · ${d.canonical}`, detail: money, kind }];
    }),
  ].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lead journey</h1>
        <p className="text-sm text-muted-foreground">
          {data.contact?.name ?? 'Contact'} · first click → lead → qualified → won
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Attribution
            {data.lead.matchMethod && (
              <Badge variant="secondary">
                {data.lead.matchMethod} ·{' '}
                {data.lead.confidence != null ? `${Math.round(data.lead.confidence * 100)}%` : '—'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-2 border-l border-border">
            {steps.map((s, i) => (
              <li key={i} className="mb-6 ml-6 last:mb-0">
                <span
                  className={cn(
                    'absolute -left-[7px] mt-1 size-3 rounded-full ring-4 ring-card',
                    DOT[s.kind],
                  )}
                />
                <div className="text-sm font-medium">{s.title}</div>
                {s.detail && <div className="text-sm text-muted-foreground">{s.detail}</div>}
                <time className="text-xs text-muted-foreground">
                  {new Date(s.time).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </main>
  );
}
