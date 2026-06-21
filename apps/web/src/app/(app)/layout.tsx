'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { clearToken } from '@/lib/session';
import { cn } from '@/lib/utils';

const NAV: Array<[string, string]> = [
  ['/overview', 'Overview'],
  ['/performance', 'Performance'],
  ['/creatives', 'Creatives'],
  ['/data-trust', 'Data trust'],
  ['/settings', 'Settings'],
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <nav className="flex items-center gap-1">
            <span className="mr-3 font-semibold tracking-tight">AdLink</span>
            {NAV.map(([href, label]) => (
              <Button
                key={href}
                asChild
                variant="ghost"
                size="sm"
                className={cn(pathname === href && 'bg-accent text-foreground')}
              >
                <Link href={href}>{label}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearToken();
                router.replace('/login');
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
