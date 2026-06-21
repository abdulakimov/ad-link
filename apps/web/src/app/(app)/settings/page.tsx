'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { ConnectCrmDialog } from '@/components/connections/connect-crm-dialog';
import { ConnectMetaDialog } from '@/components/connections/connect-meta-dialog';
import { StageMappingDialog } from '@/components/connections/stage-mapping-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';

function stateTone(state: string) {
  if (state === 'OK') return 'bg-success text-white';
  if (state === 'FAILED') return 'bg-destructive text-white';
  return 'bg-warning text-white';
}

export default function SettingsPage() {
  const token = useAuthToken();
  const t = token as string;
  const qc = useQueryClient();

  const clients = useQuery({ queryKey: ['clients'], enabled: !!token, queryFn: () => api.listClients(t) });
  const adAccounts = useQuery({ queryKey: ['ad-accounts'], enabled: !!token, queryFn: () => api.listAdAccounts(t) });
  const crm = useQuery({ queryKey: ['crm'], enabled: !!token, queryFn: () => api.listCrm(t) });
  const clientList = clients.data ?? [];
  const noClients = !clients.isLoading && clientList.length === 0;

  const [clientName, setClientName] = useState('');
  const createClient = useMutation({
    mutationFn: () => api.createClient(t, clientName.trim()),
    onSuccess: () => {
      setClientName('');
      toast.success('Client added');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const syncAcc = useMutation({ mutationFn: (id: string) => api.syncAdAccount(t, id), onSuccess: () => toast.success('Meta sync queued') });
  const syncCrm = useMutation({ mutationFn: (id: string) => api.syncCrm(t, id), onSuccess: () => toast.success('CRM sync queued') });
  const feedback = useMutation({
    mutationFn: ({ id, optIn }: { id: string; optIn: boolean }) => api.setFeedback(t, id, optIn),
    onSuccess: () => {
      toast.success('Feedback setting updated');
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addClient = (e: FormEvent) => {
    e.preventDefault();
    if (clientName.trim()) createClient.mutate();
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect Meta and your CRM, map stages, then run a sync.
        </p>
      </div>

      {/* Step 1 — Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1 · Clients</CardTitle>
          <CardDescription>Every ad account & CRM is attached to a client (a brand you run ads for).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addClient} className="flex items-center gap-2">
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client / brand name"
              className="max-w-xs"
            />
            <Button type="submit" disabled={!clientName.trim() || createClient.isPending}>
              Add client
            </Button>
          </form>
          {noClients ? (
            <p className="text-sm text-muted-foreground">No clients yet — add one to start connecting.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clientList.map((c) => (
                <Badge key={c.id} variant="secondary">
                  {c.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Meta */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">2 · Meta ad accounts</CardTitle>
            <CardDescription>Pulls spend, ads and lead forms.</CardDescription>
          </div>
          <ConnectMetaDialog
            token={t}
            clients={clientList}
            trigger={<Button size="sm" disabled={noClients}>Connect Meta</Button>}
          />
        </CardHeader>
        <CardContent>
          {noClients && <Hint>Add a client first.</Hint>}
          {!noClients && (adAccounts.data?.length ?? 0) === 0 && <Hint>No ad accounts connected yet.</Hint>}
          <div className="divide-y divide-border">
            {adAccounts.data?.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name ?? a.externalId}</span>
                    <Badge className={stateTone(a.syncState)}>{a.syncState}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {a.externalId} · {a.currency}
                    {a.lastSyncAt ? ` · synced ${new Date(a.lastSyncAt).toLocaleString()}` : ' · never synced'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={a.feedbackOptIn}
                      onCheckedChange={(v) => feedback.mutate({ id: a.id, optIn: v })}
                    />
                    Feedback to Meta
                  </label>
                  <Button size="sm" variant="outline" onClick={() => syncAcc.mutate(a.id)}>
                    Sync now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — CRM */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">3 · CRM</CardTitle>
            <CardDescription>Bitrix24 or amoCRM — leads, deals, stages.</CardDescription>
          </div>
          <ConnectCrmDialog
            token={t}
            clients={clientList}
            trigger={<Button size="sm" disabled={noClients}>Connect CRM</Button>}
          />
        </CardHeader>
        <CardContent>
          {noClients && <Hint>Add a client first.</Hint>}
          {!noClients && (crm.data?.length ?? 0) === 0 && <Hint>No CRM connected yet.</Hint>}
          <div className="divide-y divide-border">
            {crm.data?.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.provider}</span>
                    <Badge className={stateTone(c.syncState)}>{c.syncState}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{c.externalRef}</div>
                </div>
                <div className="flex items-center gap-2">
                  <StageMappingDialog
                    token={t}
                    crmId={c.id}
                    trigger={<Button size="sm" variant="ghost">Map stages</Button>}
                  />
                  <Button size="sm" variant="outline" onClick={() => syncCrm.mutate(c.id)}>
                    Sync now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
