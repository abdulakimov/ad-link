'use client';

import { useQuery } from '@tanstack/react-query';
import { useT } from '@/components/i18n-provider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  pause: 'bg-destructive text-white',
  scale: 'bg-success text-white',
  investigate: 'bg-warning text-white',
};

export default function OverviewPage() {
  const t = useT();
  const token = useAuthToken();
  const { data: user } = useQuery({
    queryKey: ['me'],
    enabled: !!token,
    queryFn: () => api.me(token as string),
  });
  const { data: recs } = useQuery({
    queryKey: ['recommendations'],
    enabled: !!token,
    queryFn: () => api.recommendations(token as string),
  });

  if (!user) return null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('overview.title')}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t('overview.welcome', { name: user.name ?? user.email })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <div>{user.email}</div>
          <div>
            {t('overview.role')}: {user.role}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What to do next</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!recs || recs.recommendations.length === 0) && (
            <p className="text-sm text-muted-foreground">
              No actions right now — connect Meta + a CRM and run a sync.
            </p>
          )}
          {recs?.recommendations.slice(0, 8).map((r) => (
            <div
              key={`${r.type}-${r.id}`}
              className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Badge className={cn('capitalize', TONE[r.type])}>{r.type}</Badge>
                  <span className="font-medium">{r.name}</span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {r.title} · {r.reason}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
