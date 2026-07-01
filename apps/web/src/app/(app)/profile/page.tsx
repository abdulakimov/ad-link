'use client';

import { useQuery } from '@tanstack/react-query';
import { useT } from '@/components/i18n-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthToken } from '@/lib/use-auth-token';

export default function ProfilePage() {
  const t = useT();
  const token = useAuthToken();
  const { data: user } = useQuery({
    queryKey: ['me'],
    enabled: !!token,
    queryFn: () => api.me(token as string),
  });

  if (!user) return null;
  const name = user.name ?? user.username ?? user.email;
  const initial = name.charAt(0).toUpperCase();
  // prefer the @handle; fall back to email for password/Google accounts (hides synthetic tg emails)
  const handle = user.username ? `@${user.username}` : user.email;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">{t('userMenu.profile')}</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external avatar CDN
              <img
                src={user.avatarUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="size-16 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xl font-semibold text-white">
                {initial}
              </span>
            )}
            <div className="min-w-0">
              <CardTitle className="truncate">{name}</CardTitle>
              <div className="truncate text-sm text-muted-foreground">{handle}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <div>
            {t('overview.role')}: {user.role}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
