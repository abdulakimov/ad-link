'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError, api, type Client } from '@/lib/api';

const EMPTY = { clientId: '', externalId: '', name: '', currency: 'USD', timezone: 'UTC', token: '' };

export function ConnectMetaDialog({
  token,
  clients,
  trigger,
}: {
  token: string;
  clients: Client[];
  trigger: ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const connect = useMutation({
    mutationFn: () => api.connectMeta(token, form),
    onSuccess: () => {
      toast.success('Meta ad account connected');
      qc.invalidateQueries({ queryKey: ['ad-accounts'] });
      setForm(EMPTY);
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Meta ad account</DialogTitle>
          <DialogDescription>
            Paste a System User token with <code>ads_read</code>. It is encrypted at rest.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select value={form.clientId} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select client…" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Account id (act_…)">
              <Input required value={form.externalId} onChange={set('externalId')} placeholder="act_1234567890" />
            </Field>
            <Field label="Display name">
              <Input value={form.name} onChange={set('name')} placeholder="Main ad account" />
            </Field>
            <Field label="Currency">
              <Input value={form.currency} onChange={set('currency')} />
            </Field>
            <Field label="Timezone">
              <Input value={form.timezone} onChange={set('timezone')} />
            </Field>
          </div>
          <Field label="System User token">
            <Input type="password" required value={form.token} onChange={set('token')} placeholder="EAAB…" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!form.clientId || !form.externalId || connect.isPending}>
              {connect.isPending ? 'Connecting…' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
