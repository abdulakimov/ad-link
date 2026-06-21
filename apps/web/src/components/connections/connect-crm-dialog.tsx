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

type Provider = 'BITRIX24' | 'AMOCRM';

export function ConnectCrmDialog({
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
  const [provider, setProvider] = useState<Provider>('BITRIX24');
  const [clientId, setClientId] = useState('');
  // Bitrix
  const [portal, setPortal] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  // amoCRM
  const [baseUrl, setBaseUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');

  const connect = useMutation({
    mutationFn: () =>
      provider === 'BITRIX24'
        ? api.connectBitrix(token, { clientId, portal, webhookUrl })
        : api.connectAmocrm(token, { clientId, baseUrl, accessToken }),
    onSuccess: () => {
      toast.success(`${provider === 'BITRIX24' ? 'Bitrix24' : 'amoCRM'} connected`);
      qc.invalidateQueries({ queryKey: ['crm'] });
      setOpen(false);
      setPortal('');
      setWebhookUrl('');
      setBaseUrl('');
      setAccessToken('');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    connect.mutate();
  };
  const ready =
    !!clientId &&
    (provider === 'BITRIX24' ? !!portal && webhookUrl.length >= 20 : !!baseUrl && accessToken.length >= 20);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect a CRM</DialogTitle>
          <DialogDescription>Credentials are encrypted at rest.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="CRM">
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BITRIX24">Bitrix24</SelectItem>
                  <SelectItem value="AMOCRM">amoCRM / Kommo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Client">
              <Select value={clientId} onValueChange={setClientId}>
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
            </Field>
          </div>

          {provider === 'BITRIX24' ? (
            <>
              <Field label="Portal URL">
                <Input value={portal} onChange={(e) => setPortal(e.target.value)} placeholder="https://acme.bitrix24.ru" />
              </Field>
              <Field label="Inbound webhook URL">
                <Input
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://acme.bitrix24.ru/rest/1/xxxx/"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Base URL">
                <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://acme.amocrm.ru" />
              </Field>
              <Field label="OAuth access token">
                <Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
              </Field>
            </>
          )}

          <DialogFooter>
            <Button type="submit" disabled={!ready || connect.isPending}>
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
