'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Facebook,
  Loader2,
  type LucideIcon,
  Plug,
  Plus,
  Trash2,
  Workflow,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AddConnectionDialog } from '@/components/connections/add-connection-dialog';
import { MetaImportDialog } from '@/components/connections/meta-import-dialog';
import { StageMappingDialog } from '@/components/connections/stage-mapping-dialog';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api, type AdAccountDto, type CrmConnectionDto } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';
import { cn } from '@/lib/utils';

type Provider = 'META' | 'BITRIX24' | 'AMOCRM';

const DOT: Record<string, string> = { OK: 'bg-success', FAILED: 'bg-destructive', RUNNING: 'bg-warning' };

/** While a sync is RUNNING (or just triggered) poll every 2s so the badge updates live. */
const anyRunning = (rows?: Array<{ syncState: string }>) =>
  rows?.some((r) => r.syncState === 'RUNNING') ?? false;
const PROVIDER_META: Record<Provider, { icon: LucideIcon; color: string; nameKey: string }> = {
  META: { icon: Facebook, color: 'text-[#1877F2]', nameKey: 'connections.metaName' },
  BITRIX24: { icon: Workflow, color: 'text-[#2FC7F7]', nameKey: 'connections.bitrixName' },
  AMOCRM: { icon: Plug, color: 'text-[#3CB371]', nameKey: 'connections.amoName' },
};

export default function ConnectionsPage() {
  const tr = useT();
  const token = useAuthToken();
  const t = token as string;
  const qc = useQueryClient();

  // Timestamp of the last sync we kicked off — keeps polling alive for a grace window
  // until the worker flips the row to RUNNING (covers the brief enqueue→pickup gap).
  const [syncingSince, setSyncingSince] = useState(0);
  const bumpSyncing = () => setSyncingSince(Date.now());
  const pollInterval = (rows?: Array<{ syncState: string }>) =>
    anyRunning(rows) || Date.now() - syncingSince < 15_000 ? 2000 : false;

  const adAccounts = useQuery({
    queryKey: ['ad-accounts'],
    enabled: !!token,
    queryFn: () => api.listAdAccounts(t),
    refetchInterval: (q) => pollInterval(q.state.data),
  });
  const crm = useQuery({
    queryKey: ['crm'],
    enabled: !!token,
    queryFn: () => api.listCrm(t),
    refetchInterval: (q) => pollInterval(q.state.data),
  });
  const accounts = adAccounts.data ?? [];
  const crmList = crm.data ?? [];
  const empty = !adAccounts.isLoading && !crm.isLoading && accounts.length === 0 && crmList.length === 0;

  const [selected, setSelected] = useState<Provider | null>(null);

  // After the Meta OAuth round-trip: ?meta_session=<id> opens the account picker; ?error=meta toasts.
  const [metaSession, setMetaSession] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const session = p.get('meta_session');
    if (session) setMetaSession(session);
    else if (p.get('error') === 'meta') toast.error(tr('connections.metaFailed'));
    if (p.has('meta_session') || p.has('error')) window.history.replaceState({}, '', '/connections');
  }, [tr]);

  // Group connections by platform.
  const bitrix = crmList.filter((c) => c.provider === 'BITRIX24');
  const amo = crmList.filter((c) => c.provider === 'AMOCRM');
  const platforms = (
    [
      { id: 'META', accounts, crm: [] as CrmConnectionDto[], count: accounts.length },
      { id: 'BITRIX24', accounts: [] as AdAccountDto[], crm: bitrix, count: bitrix.length },
      { id: 'AMOCRM', accounts: [] as AdAccountDto[], crm: amo, count: amo.length },
    ] satisfies Array<{ id: Provider; accounts: AdAccountDto[]; crm: CrmConnectionDto[]; count: number }>
  ).filter((p) => p.count > 0);

  const current = platforms.find((p) => p.id === selected) ?? null;

  // ---- mutations ----
  const syncAcc = useMutation({
    mutationFn: (id: string) => api.syncAdAccount(t, id),
    onMutate: bumpSyncing,
    onSuccess: () => {
      toast.success(tr('connections.metaQueued'));
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
    },
  });
  const syncCrm = useMutation({
    mutationFn: (id: string) => api.syncCrm(t, id),
    onMutate: bumpSyncing,
    onSuccess: () => {
      toast.success(tr('connections.crmQueued'));
      qc.invalidateQueries({ queryKey: ['crm'] });
    },
  });
  const feedback = useMutation({
    mutationFn: ({ id, optIn }: { id: string; optIn: boolean }) => api.setFeedback(t, id, optIn),
    onSuccess: () => {
      toast.success(tr('connections.feedbackUpdated'));
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeAcc = useMutation({
    mutationFn: (id: string) => api.deleteAdAccount(t, id),
    onSuccess: () => {
      toast.success(tr('connections.removed'));
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const removeCrmConn = useMutation({
    mutationFn: (id: string) => api.deleteCrm(t, id),
    onSuccess: () => {
      toast.success(tr('connections.removed'));
      qc.invalidateQueries({ queryKey: ['crm'] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tr('connections.title')}</h1>
          <p className="text-sm text-muted-foreground">{tr('connections.subtitle')}</p>
        </div>
        <AddConnectionDialog
          token={t}
          onConnected={bumpSyncing}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              {tr('connections.addConnection')}
            </Button>
          }
        />
      </div>

      <div className="mt-8">
        {empty ? (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            {tr('connections.noConnections')}
          </p>
        ) : current ? (
          // ---- Platform detail ----
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              {tr(PROVIDER_META[current.id].nameKey)}
            </button>
            <div className="divide-y divide-border">
              {current.accounts.map((a) => (
                <Row
                  key={a.id}
                  provider={current.id}
                  title={a.name ?? a.externalId}
                  state={a.syncState}
                  subtitle={`${a.externalId} · ${a.currency} · ${
                    a.lastSyncAt
                      ? tr('connections.syncedAt', { time: new Date(a.lastSyncAt).toLocaleString() })
                      : tr('connections.neverSynced')
                  }`}
                >
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={a.feedbackOptIn} onCheckedChange={(v) => feedback.mutate({ id: a.id, optIn: v })} />
                    {tr('connections.feedback')}
                  </label>
                  <Button size="sm" variant="outline" onClick={() => syncAcc.mutate(a.id)}>
                    {tr('connections.syncNow')}
                  </Button>
                  <RemoveButton label={tr('connections.remove')} onClick={() => removeAcc.mutate(a.id)} />
                </Row>
              ))}
              {current.crm.map((c) => (
                <Row key={c.id} provider={current.id} title={c.provider} state={c.syncState} subtitle={c.externalRef}>
                  <StageMappingDialog
                    token={t}
                    crmId={c.id}
                    trigger={<Button size="sm" variant="ghost">{tr('connections.mapStages')}</Button>}
                  />
                  <Button size="sm" variant="outline" onClick={() => syncCrm.mutate(c.id)}>
                    {tr('connections.syncNow')}
                  </Button>
                  <RemoveButton label={tr('connections.remove')} onClick={() => removeCrmConn.mutate(c.id)} />
                </Row>
              ))}
            </div>
          </div>
        ) : (
          // ---- Platform list ----
          <div className="grid gap-3 sm:grid-cols-2">
            {platforms.map((p) => {
              const items = [...p.accounts, ...p.crm];
              const state = items.some((i) => i.syncState === 'RUNNING')
                ? 'RUNNING'
                : items.some((i) => i.syncState === 'FAILED')
                  ? 'FAILED'
                  : 'OK';
              const meta = PROVIDER_META[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
                      <meta.icon className={cn('size-5', meta.color)} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tr(meta.nameKey)}</span>
                        <StatusBadge state={state} />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tr('connections.linkedCount', { n: String(p.count) })}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {metaSession && (
        <MetaImportDialog
          token={t}
          sessionId={metaSession}
          onImported={bumpSyncing}
          onClose={() => setMetaSession(null)}
        />
      )}
    </main>
  );
}

function Row({
  provider,
  title,
  subtitle,
  state,
  children,
}: {
  provider: Provider;
  title: string;
  subtitle: string;
  state: string;
  children: ReactNode;
}) {
  const meta = PROVIDER_META[provider];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
          <meta.icon className={cn('size-5', meta.color)} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{title}</span>
            <StatusBadge state={state} />
          </div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">{children}</div>
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function StatusBadge({ state }: { state: string }) {
  const tr = useT();
  if (state === 'RUNNING') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
        <Loader2 className="size-3 animate-spin text-warning" />
        {tr('connections.syncing')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      <span className={cn('size-1.5 rounded-full', DOT[state] ?? 'bg-warning')} />
      {state}
    </span>
  );
}
