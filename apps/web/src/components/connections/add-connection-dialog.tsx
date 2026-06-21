'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Facebook, type LucideIcon, Plug, Workflow } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { useT } from '@/components/i18n-provider';
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
import { ApiError, api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Provider = 'META' | 'BITRIX24' | 'AMOCRM';

const PROVIDERS: Array<{ id: Provider; icon: LucideIcon; name: string; tag: string; color: string }> = [
  { id: 'META', icon: Facebook, name: 'metaName', tag: 'metaTag', color: 'text-[#1877F2]' },
  { id: 'BITRIX24', icon: Workflow, name: 'bitrixName', tag: 'bitrixTag', color: 'text-[#2FC7F7]' },
  { id: 'AMOCRM', icon: Plug, name: 'amoName', tag: 'amoTag', color: 'text-[#3CB371]' },
];

export function AddConnectionDialog({ token, trigger }: { token: string; trigger: ReactNode }) {
  const tr = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [bitrix, setBitrix] = useState({ portal: '', webhookUrl: '' });
  const [amo, setAmo] = useState({ baseUrl: '', accessToken: '' });

  function reset() {
    setProvider(null);
    setBitrix({ portal: '', webhookUrl: '' });
    setAmo({ baseUrl: '', accessToken: '' });
  }

  // Meta uses OAuth — full-page redirect carrying the user's JWT (no Authorization header on a nav).
  function startMetaOAuth() {
    window.location.href = `${API}/integrations/meta/oauth/start?token=${encodeURIComponent(token)}`;
  }

  const connect = useMutation({
    mutationFn: () =>
      provider === 'BITRIX24' ? api.connectBitrix(token, bitrix) : api.connectAmocrm(token, amo),
    onSuccess: () => {
      toast.success(tr(provider === 'BITRIX24' ? 'connections.bitrixConnected' : 'connections.amoConnected'));
      qc.invalidateQueries({ queryKey: ['crm'] });
      setOpen(false);
      reset();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const ready =
    provider === 'BITRIX24'
      ? !!bitrix.portal && bitrix.webhookUrl.length >= 20
      : provider === 'AMOCRM'
        ? !!amo.baseUrl && amo.accessToken.length >= 20
        : false;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) connect.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        {/* ---- Step 1: pick a platform ---- */}
        {!provider ? (
          <>
            <DialogHeader>
              <DialogTitle>{tr('connections.pickPlatform')}</DialogTitle>
              <DialogDescription>{tr('connections.pickPlatformDesc')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary">
                    <p.icon className={`size-5 ${p.color}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{tr(`connections.${p.name}`)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {tr(`connections.${p.tag}`)}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </>
        ) : (
          /* ---- Step 2: provider-specific form ---- */
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProvider(null)}
                  aria-label={tr('connections.back')}
                  className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <DialogTitle>{tr(`connections.${PROVIDERS.find((p) => p.id === provider)!.name}`)}</DialogTitle>
              </div>
            </DialogHeader>

            {/* Meta → OAuth (no form) */}
            {provider === 'META' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{tr('connections.metaOauthNote')}</p>
                <Button type="button" className="w-full gap-2 bg-[#1877F2] hover:bg-[#166fe0]" onClick={startMetaOAuth}>
                  <Facebook className="size-4" />
                  {tr('connections.continueFacebook')}
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
              {provider === 'BITRIX24' && (
                <>
                  <Field label={tr('connections.fPortal')}>
                    <Input
                      value={bitrix.portal}
                      onChange={(e) => setBitrix((b) => ({ ...b, portal: e.target.value }))}
                      placeholder="https://acme.bitrix24.ru"
                    />
                  </Field>
                  <Field label={tr('connections.fWebhook')}>
                    <Input
                      value={bitrix.webhookUrl}
                      onChange={(e) => setBitrix((b) => ({ ...b, webhookUrl: e.target.value }))}
                      placeholder="https://acme.bitrix24.ru/rest/1/xxxx/"
                    />
                  </Field>
                </>
              )}

              {provider === 'AMOCRM' && (
                <>
                  <Field label={tr('connections.fBaseUrl')}>
                    <Input
                      value={amo.baseUrl}
                      onChange={(e) => setAmo((a) => ({ ...a, baseUrl: e.target.value }))}
                      placeholder="https://acme.amocrm.ru"
                    />
                  </Field>
                  <Field label={tr('connections.fAccessToken')}>
                    <Input
                      type="password"
                      value={amo.accessToken}
                      onChange={(e) => setAmo((a) => ({ ...a, accessToken: e.target.value }))}
                    />
                  </Field>
                </>
              )}

              <DialogFooter>
                <Button type="submit" disabled={!ready || connect.isPending}>
                  {connect.isPending ? tr('connections.connecting') : tr('connections.connect')}
                </Button>
              </DialogFooter>
            </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
