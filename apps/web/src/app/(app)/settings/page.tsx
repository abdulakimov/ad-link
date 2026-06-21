'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';

export default function SettingsPage() {
  const token = useAuthToken();
  const t = token as string;
  const qc = useQueryClient();

  const clients = useQuery({ queryKey: ['clients'], enabled: !!token, queryFn: () => api.listClients(t) });
  const adAccounts = useQuery({ queryKey: ['ad-accounts'], enabled: !!token, queryFn: () => api.listAdAccounts(t) });
  const crm = useQuery({ queryKey: ['crm'], enabled: !!token, queryFn: () => api.listCrm(t) });
  const opts = clients.data ?? [];

  const [clientName, setClientName] = useState('');
  const createClient = useMutation({
    mutationFn: () => api.createClient(t, clientName),
    onSuccess: () => {
      setClientName('');
      toast.success('Client created');
      qc.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [meta, setMeta] = useState({ clientId: '', externalId: '', name: '', currency: 'USD', timezone: 'UTC', token: '' });
  const connectMeta = useMutation({
    mutationFn: () => api.connectMeta(t, meta),
    onSuccess: () => {
      toast.success('Meta ad account connected');
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [bx, setBx] = useState({ clientId: '', portal: '', webhookUrl: '' });
  const connectBitrix = useMutation({
    mutationFn: () => api.connectBitrix(t, bx),
    onSuccess: () => {
      toast.success('Bitrix24 connected');
      qc.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const syncAcc = useMutation({ mutationFn: (id: string) => api.syncAdAccount(t, id), onSuccess: () => toast.success('Sync queued') });
  const syncCrm = useMutation({ mutationFn: (id: string) => api.syncCrm(t, id), onSuccess: () => toast.success('Sync queued') });

  const submit = (fn: () => void) => (e: FormEvent) => {
    e.preventDefault();
    fn();
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings & integrations</h1>
        <p className="text-sm text-muted-foreground">Connect Meta and your CRM, then run a sync.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clients</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit(() => clientName && createClient.mutate())} className="flex items-end gap-2">
            <Field label="New client" className="flex-1">
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Co." />
            </Field>
            <Button type="submit" disabled={!clientName || createClient.isPending}>
              Add
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {opts.map((c) => (
              <Badge key={c.id} variant="secondary">
                {c.name}
              </Badge>
            ))}
            {opts.length === 0 && <p className="text-sm text-muted-foreground">No clients yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meta ad accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit(() => meta.clientId && connectMeta.mutate())} className="grid grid-cols-2 gap-3">
            <ClientPicker value={meta.clientId} onChange={(v) => setMeta((m) => ({ ...m, clientId: v }))} options={opts} />
            <Field label="Account id (act_…)">
              <Input value={meta.externalId} onChange={(e) => setMeta((m) => ({ ...m, externalId: e.target.value }))} />
            </Field>
            <Field label="Name">
              <Input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
            </Field>
            <Field label="Currency">
              <Input value={meta.currency} onChange={(e) => setMeta((m) => ({ ...m, currency: e.target.value }))} />
            </Field>
            <Field label="Timezone">
              <Input value={meta.timezone} onChange={(e) => setMeta((m) => ({ ...m, timezone: e.target.value }))} />
            </Field>
            <Field label="System-user token">
              <Input type="password" value={meta.token} onChange={(e) => setMeta((m) => ({ ...m, token: e.target.value }))} />
            </Field>
            <div className="col-span-2">
              <Button type="submit" disabled={!meta.clientId || connectMeta.isPending}>
                Connect Meta
              </Button>
            </div>
          </form>
          <ConnList
            rows={(adAccounts.data ?? []).map((a) => ({ id: a.id, label: a.name ?? a.externalId, state: a.syncState }))}
            onSync={(id) => syncAcc.mutate(id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CRM (Bitrix24)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit(() => bx.clientId && connectBitrix.mutate())} className="grid grid-cols-2 gap-3">
            <ClientPicker value={bx.clientId} onChange={(v) => setBx((b) => ({ ...b, clientId: v }))} options={opts} />
            <Field label="Portal (https://…bitrix24.ru)">
              <Input value={bx.portal} onChange={(e) => setBx((b) => ({ ...b, portal: e.target.value }))} />
            </Field>
            <Field label="Inbound webhook URL" className="col-span-2">
              <Input value={bx.webhookUrl} onChange={(e) => setBx((b) => ({ ...b, webhookUrl: e.target.value }))} />
            </Field>
            <div className="col-span-2">
              <Button type="submit" disabled={!bx.clientId || connectBitrix.isPending}>
                Connect Bitrix24
              </Button>
            </div>
          </form>
          <ConnList
            rows={(crm.data ?? []).map((c) => ({ id: c.id, label: `${c.provider} · ${c.externalRef}`, state: c.syncState }))}
            onSync={(id) => syncCrm.mutate(id)}
          />
        </CardContent>
      </Card>
    </main>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ClientPicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
}) {
  return (
    <Field label="Client">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select client…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function ConnList({
  rows,
  onSync,
}: {
  rows: Array<{ id: string; label: string; state: string }>;
  onSync: (id: string) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing connected yet.</p>;
  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{r.label}</span>
            <Badge variant="secondary">{r.state}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={() => onSync(r.id)}>
            Sync now
          </Button>
        </div>
      ))}
    </div>
  );
}
