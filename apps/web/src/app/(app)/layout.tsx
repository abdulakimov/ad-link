'use client';

import {
  BarChart3,
  Cable,
  Images,
  LayoutDashboard,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import { LocaleThemeControls } from '@/components/locale-theme-controls';
import { UserMenu } from '@/components/user-menu';
import { cn } from '@/lib/utils';

const NAV: Array<{ href: string; icon: LucideIcon; key: string }> = [
  { href: '/overview', icon: LayoutDashboard, key: 'overview' },
  { href: '/performance', icon: BarChart3, key: 'performance' },
  { href: '/creatives', icon: Images, key: 'creatives' },
  { href: '/data-trust', icon: ShieldCheck, key: 'dataTrust' },
  { href: '/connections', icon: Cable, key: 'connections' },
];

const STORAGE_KEY = 'adlink_sidebar_collapsed';

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const t = useT();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="flex min-h-dvh">
      <aside
        className={cn(
          'sticky top-0 z-20 flex h-dvh shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {/* brand + collapse toggle */}
        <div
          className={cn(
            'flex h-14 items-center border-b border-border px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed && (
            <span className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
                <Sparkles className="size-4" />
              </span>
              AdLink
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>

        {/* nav */}
        <nav className="flex flex-1 flex-col gap-1 p-2">
          {NAV.map(({ href, icon: Icon, key }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? t(`nav.${key}`) : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  collapsed && 'justify-center px-0',
                  active
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{t(`nav.${key}`)}</span>}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b border-border bg-background/80 px-6 backdrop-blur">
          <LocaleThemeControls />
          <UserMenu />
        </header>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
