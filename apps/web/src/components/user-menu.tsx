'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, LogOut, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useT } from '@/components/i18n-provider';
import { Menu } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { clearToken } from '@/lib/session';
import { useAuthToken } from '@/lib/use-auth-token';

export function UserMenu() {
  const t = useT();
  const router = useRouter();
  const token = useAuthToken();
  const { data: user } = useQuery({
    queryKey: ['me'],
    enabled: !!token,
    queryFn: () => api.me(token as string),
  });

  const name = user?.name ?? user?.username ?? user?.email ?? '';
  const initial = (name || '?').charAt(0).toUpperCase();
  const avatar = user?.avatarUrl ?? null;
  // prefer the @handle; fall back to email (hides synthetic Telegram emails)
  const handle = user?.username ? `@${user.username}` : user?.email;

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <Menu
      ariaLabel={t('userMenu.account')}
      align="end"
      contentClassName="w-72"
      triggerClassName="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background pl-1 pr-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      trigger={
        <>
          <Avatar src={avatar} initial={initial} />
          <span className="max-w-[10rem] truncate">{name || '…'}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </>
      }
    >
      {(close) => (
        <>
          {/* identity header */}
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar src={avatar} initial={initial} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{name || '…'}</div>
              {handle && <div className="truncate text-xs text-muted-foreground">{handle}</div>}
            </div>
          </div>

          <Divider />

          <Row href="/profile" icon={User} onClick={close}>
            {t('userMenu.profile')}
          </Row>

          <Divider />

          <Row icon={LogOut} onClick={logout}>
            {t('auth.logout')}
          </Row>
        </>
      )}
    </Menu>
  );
}

function Avatar({
  src,
  initial,
  size = 'sm',
}: {
  src: string | null;
  initial: string;
  size?: 'sm' | 'lg';
}) {
  const dim = size === 'lg' ? 'size-10 text-base' : 'size-7 text-xs';
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- external avatar (Google/Telegram CDN)
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        className={`${dim} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${dim} grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 font-semibold text-white`}
    >
      {initial}
    </span>
  );
}

function Divider() {
  return <div className="my-1 h-px bg-border" />;
}

function Row({
  icon: Icon,
  children,
  href,
  external,
  onClick,
}: {
  icon: LucideIcon;
  children: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const cls =
    'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent';
  const inner = (
    <>
      <Icon className="size-4 text-indigo-500 dark:text-indigo-300" />
      <span className="flex-1">{children}</span>
    </>
  );
  if (href) {
    return external ? (
      <a href={href} target="_blank" rel="noreferrer" className={cls} onClick={onClick}>
        {inner}
      </a>
    ) : (
      <Link href={href} className={cls} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}
