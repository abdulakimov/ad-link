'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Facebook, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Post-OAuth picker: choose which Meta ad accounts to import from a session. */
export function MetaImportDialog({
  token,
  sessionId,
  onClose,
  onImported,
}: {
  token: string;
  sessionId: string;
  onClose: () => void;
  onImported?: () => void;
}) {
  const tr = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['meta-session', sessionId],
    queryFn: () => api.metaSessionAccounts(token, sessionId),
  });
  const accounts = data?.accounts ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        (a.name ?? '').toLowerCase().includes(q) || a.externalId.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((a) => selected.has(a.externalId));

  const toggleAllFiltered = () =>
    setSelected((s) => {
      const next = new Set(s);
      for (const a of filtered) allFilteredSelected ? next.delete(a.externalId) : next.add(a.externalId);
      return next;
    });

  // Default to all selected once the candidates load.
  useEffect(() => {
    if (accounts.length) setSelected(new Set(accounts.map((a) => a.externalId)));
  }, [data]);

  const importM = useMutation({
    mutationFn: () => api.importMeta(token, sessionId, [...selected]),
    onSuccess: (r) => {
      toast.success(tr('connections.metaImported', { n: String(r.imported) }));
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
      onImported?.(); // import auto-enqueues a sync → start live polling
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('connections.metaPickTitle')}</DialogTitle>
          <DialogDescription>{tr('connections.metaPickDesc')}</DialogDescription>
        </DialogHeader>

        {!isLoading && accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {tr('connections.metaNoAccounts')}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr('connections.searchAccounts')}
                  className="pl-8"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={toggleAllFiltered}
                disabled={filtered.length === 0}
              >
                {allFilteredSelected
                  ? tr('connections.clearSelection')
                  : tr('connections.selectAll')}
              </Button>
            </div>

            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {tr('connections.noMatches')}
              </p>
            ) : (
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {filtered.map((a) => {
              const on = selected.has(a.externalId);
              return (
                <button
                  key={a.externalId}
                  type="button"
                  onClick={() => toggle(a.externalId)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                    on ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                  )}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary">
                    <Facebook className="size-4 text-[#1877F2]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name ?? a.externalId}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.externalId} · {a.currency}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-md border',
                      on ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                    )}
                  >
                    {on && <Check className="size-3.5" />}
                  </span>
                </button>
              );
                })}
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button onClick={() => importM.mutate()} disabled={selected.size === 0 || importM.isPending}>
            {tr('connections.importSelected')}
            {selected.size > 0 ? ` (${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
