'use client';

import {
  Check,
  ChevronDown,
  Languages,
  type LucideIcon,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useI18n, useT } from '@/components/i18n-provider';
import { Menu } from '@/components/ui/menu';
import type { Locale } from '@/i18n';
import { cn } from '@/lib/utils';

const LANGS: Array<{ value: Locale; label: string; short: string }> = [
  { value: 'uz', label: "O'zbekcha", short: 'UZ' },
  { value: 'ru', label: 'Русский', short: 'RU' },
  { value: 'en', label: 'English', short: 'EN' },
];

/** Theme + language dropdowns, side by side. Custom (not radix) for reliability. */
export function LocaleThemeControls() {
  return (
    <div className="flex items-center gap-2">
      <LanguageMenu />
      <ThemeMenu />
    </div>
  );
}

const triggerCls =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

function ThemeMenu() {
  const t = useT();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? 'system') : 'system';
  const effective = current === 'system' ? resolvedTheme : current;
  const TriggerIcon = !mounted ? Sun : effective === 'dark' ? Moon : Sun;

  const items: Array<{ value: string; icon: LucideIcon; label: string }> = [
    { value: 'system', icon: Monitor, label: t('theme.system') },
    { value: 'light', icon: Sun, label: t('theme.light') },
    { value: 'dark', icon: Moon, label: t('theme.dark') },
  ];

  return (
    <Menu
      ariaLabel={t('theme.label')}
      triggerClassName={triggerCls}
      contentClassName="min-w-44"
      trigger={
        <>
          <TriggerIcon className="size-4" />
          <ChevronDown className="size-3.5 opacity-60" />
        </>
      }
    >
      {(close) =>
        items.map((it) => (
          <MenuItem
            key={it.value}
            icon={it.icon}
            label={it.label}
            active={current === it.value}
            onSelect={() => {
              setTheme(it.value);
              close();
            }}
          />
        ))
      }
    </Menu>
  );
}

function LanguageMenu() {
  const { locale, setLocale } = useI18n();
  const short = LANGS.find((l) => l.value === locale)?.short ?? 'EN';

  return (
    <Menu
      ariaLabel="Language"
      triggerClassName={triggerCls}
      contentClassName="min-w-44"
      trigger={
        <>
          <Languages className="size-4" />
          <span className="text-xs">{short}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </>
      }
    >
      {(close) =>
        LANGS.map((l) => (
          <MenuItem
            key={l.value}
            icon={Languages}
            label={l.label}
            active={locale === l.value}
            onSelect={() => {
              setLocale(l.value);
              close();
            }}
          />
        ))
      }
    </Menu>
  );
}

/** Minimal accessible dropdown: button trigger + click-outside/Esc to close. */
function MenuItem({
  icon: Icon,
  label,
  active,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent',
        active ? 'font-medium text-primary' : 'text-foreground',
      )}
    >
      <Icon className="size-4" />
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="size-4" />}
    </button>
  );
}
