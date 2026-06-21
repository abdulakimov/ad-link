'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatPercent } from '@adlink/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';

export default function DataTrustPage() {
  const token = useAuthToken();
  const qc = useQueryClient();
  const rate = useQuery({ queryKey: ['data-trust'], enabled: !!token, queryFn: () => api.dataTrust(token as string) });
  const queue = useQuery({ queryKey: ['review-queue'], enabled: !!token, queryFn: () => api.reviewQueue(token as string) });
  const ads = useQuery({ queryKey: ['ads'], enabled: !!token, queryFn: () => api.listAds(token as string) });

  const [picks, setPicks] = useState<Record<string, string>>({});
  const resolve = useMutation({
    mutationFn: ({ leadId, adId }: { leadId: string; adId: string }) =>
      api.resolveMatch(token as string, leadId, adId),
    onSuccess: () => {
      toast.success('Lead attributed.');
      qc.invalidateQueries({ queryKey: ['review-queue'] });
      qc.invalidateQueries({ queryKey: ['data-trust'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const r = rate.data;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Data trust</h1>
        <p className="text-sm text-muted-foreground">
          How much of your CRM is attributable to an ad — and what still needs review.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Match rate" value={formatPercent(r?.rate ?? null)} />
        <Stat label="Matched" value={String(r?.matched ?? '—')} />
        <Stat label="In review" value={String(r?.review ?? '—')} />
        <Stat label="Unmatched" value={String(r?.unmatched ?? '—')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review queue</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead className="w-[320px]">Attribute to ad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing to review — every lead is attributed.
                  </TableCell>
                </TableRow>
              )}
              {queue.data?.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium">{lead.source}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lead.utmContent ?? lead.fbclid ?? '—'}
                  </TableCell>
                  <TableCell className="font-mono">{formatPercent(lead.confidence)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select value={picks[lead.id] ?? ''} onValueChange={(v) => setPicks((p) => ({ ...p, [lead.id]: v }))}>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Pick an ad…" />
                        </SelectTrigger>
                        <SelectContent>
                          {ads.data?.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.campaign} › {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!picks[lead.id] || resolve.isPending}
                        onClick={() => resolve.mutate({ leadId: lead.id, adId: picks[lead.id]! })}
                      >
                        Resolve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
