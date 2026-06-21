'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type CanonicalStatus, api } from '@/lib/api';

const CANONICAL: CanonicalStatus[] = ['LEAD', 'QUALIFIED', 'WON', 'LOST', 'IGNORE'];

export function StageMappingDialog({
  token,
  crmId,
  trigger,
}: {
  token: string;
  crmId: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const stages = useQuery({
    queryKey: ['crm-stages', crmId],
    enabled: open,
    queryFn: () => api.crmStages(token, crmId),
    retry: false,
  });
  const existing = useQuery({
    queryKey: ['crm-mappings', crmId],
    enabled: open,
    queryFn: () => api.crmMappings(token, crmId),
  });

  const [map, setMap] = useState<Record<string, CanonicalStatus>>({});
  useEffect(() => {
    if (existing.data) {
      setMap(Object.fromEntries(existing.data.map((m) => [m.externalStageId, m.canonical])));
    }
  }, [existing.data]);

  const save = useMutation({
    mutationFn: () =>
      api.setCrmMappings(
        token,
        crmId,
        (stages.data ?? []).map((s) => ({
          externalStageId: s.externalId,
          externalStageName: s.name,
          canonical: map[s.externalId] ?? 'IGNORE',
        })),
      ),
    onSuccess: () => {
      toast.success('Stage mapping saved');
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Map CRM stages</DialogTitle>
          <DialogDescription>
            Tell AdLink which stages mean Qualified, Won, etc. — this drives every metric.
          </DialogDescription>
        </DialogHeader>

        {stages.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading stages…</p>}
        {stages.isError && (
          <p className="py-6 text-center text-sm text-destructive">
            Couldn’t fetch stages — check the CRM credentials, then reopen.
          </p>
        )}
        {stages.data?.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No stages returned by the CRM.</p>
        )}

        {stages.data && stages.data.length > 0 && (
          <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
            {stages.data.map((s) => (
              <div key={s.externalId} className="flex items-center justify-between gap-3">
                <span className="text-sm">{s.name}</span>
                <Select
                  value={map[s.externalId] ?? 'IGNORE'}
                  onValueChange={(v) => setMap((m) => ({ ...m, [s.externalId]: v as CanonicalStatus }))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANONICAL.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!stages.data?.length || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save mapping'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
