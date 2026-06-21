'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Facebook, type LucideIcon, Plug, Plus, Trash2, Workflow } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AddConnectionDialog } from '@/components/connections/add-connection-dialog';
import { MetaImportDialog } from '@/components/connections/meta-import-dialog';
import { StageMappingDialog } from '@/components/connections/stage-mapping-dialog';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';
import { cn } from '@/lib/utils';

const DOT: Record<string, string> = { OK: 'bg-success', FAILED: 'bg-destructive' };
const CRM_ICON: Record<string, LucideIcon> = { BITRIX24: Workflow, AMOCRM: Plug };

export default function ConnectionsPage() {
  const tr = useT();
  const token = useAuthToken();
  const t = token as string;
  const qc = useQueryClient();

  const adAccounts = useQuery({ queryKey: ['ad-accounts'], enabled: !!token, queryFn: () => api.listAdAccounts(t) });
  const crm = useQuery({ queryKey: ['crm'], enabled: !!token, queryFn: () => api.listCrm(t) });
  const accounts = adAccounts.data ?? [];
  const crmList = crm.data ?? [];
  const empty = !adAccounts.isLoading && !crm.isLoading && accounts.length === 0 && crmList.length === 0;

  // After the Meta OAuth round-trip: ?meta_session=<id> opens the account picker; ?error=meta toasts.
  const [metaSession, setMetaSession] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const session = p.get('meta_session');
    if (session) setMetaSession(session);
    else if (p.get('error') === 'meta') toast.error(tr('connections.metaFailed'));
    if (p.has('meta_session') || p.has('error')) {
      window.history.replaceState({}, '', '/connections');
    }
  }, [tr]);

  const syncAcc = useMutation({ mutationFn: (id: string) => api.syncAdAccount(t, id), onSuccess: () => toast.success(tr('connections.metaQueued')) });
  const syncCrm = useMutation({ mutationFn: (id: string) => api.syncCrm(t, id), onSuccess: () => toast.success(tr('connections.crmQueued')) });
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
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((a) => (
              <Row
                key={a.id}
                icon={Facebook}
                iconColor="text-[#1877F2]"
                title={a.name ?? a.externalId}
                state={a.syncState}
                subtitle={`${a.externalId} · ${a.currency} · ${
                  a.lastSyncAt
                    ? tr('connections.syncedAt', { time: new Date(a.lastSyncAt).toLocaleString() })
                    : tr('connections.neverSynced')
                }`}
              >
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch
                    checked={a.feedbackOptIn}
                    onCheckedChange={(v) => feedback.mutate({ id: a.id, optIn: v })}
                  />
                  {tr('connections.feedback')}
                </label>
                <Button size="sm" variant="outline" onClick={() => syncAcc.mutate(a.id)}>
                  {tr('connections.syncNow')}
                </Button>
                <RemoveButton label={tr('connections.remove')} onClick={() => removeAcc.mutate(a.id)} />
              </Row>
            ))}

            {crmList.map((c) => (
              <Row
                key={c.id}
                icon={CRM_ICON[c.provider] ?? Plug}
                iconColor="text-[#2FC7F7]"
                title={c.provider}
                state={c.syncState}
                subtitle={c.externalRef}
              >
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
        )}
      </div>

      {metaSession && (
        <MetaImportDialog token={t} sessionId={metaSession} onClose={() => setMetaSession(null)} />
      )}
    </main>
  );
}

function Row({
  icon: Icon,
  iconColor,
  title,
  subtitle,
  state,
  children,
}: {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  state: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary">
          <Icon className={cn('size-5', iconColor)} />
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
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      <span className={cn('size-1.5 rounded-full', DOT[state] ?? 'bg-warning')} />
      {state}
    </span>
  );
}
