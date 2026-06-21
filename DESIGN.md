# AdLink — Design System (DESIGN.md)

> Single source of truth for the UI language. Implemented as **shadcn/ui CSS variables + Tailwind + lucide** — we tune tokens, we do **not** build a parallel component framework. `PLAN.md §11` references this.
> **Locked anchors:** Calm minimal (Linear/Vercel) · Indigo accent · light+dark (system default) · radius 10px · airy chrome + compact tables · Geist + Geist Mono · separation via elevation (soft shadow), minimal borders.
> Finer rules below are the proposed defaults — **any rule is adjustable in review**; this doc is the agreement, not a decree.

---

## 1. Principles
1. **Calm over loud.** Neutral surfaces; color earns attention (accent = action/active/key data only).
2. **Fewer borders.** Separate surfaces with elevation (soft shadow) + background, not lines. Hairlines only inside tables/inputs where alignment needs them.
3. **Airy chrome, dense data.** Generous padding in nav/cards; compact rows in the data tables (that's where pros live).
4. **Trust is visual.** Match confidence, sync freshness, and methodology labels are always shown, never hidden.
5. **Numbers are first-class.** Tabular figures, right-aligned, rounded on display only, `—` for missing — never a fake `0`.
6. **Never raw HTML controls.** Every interactive element is a shadcn component or a best-in-class package — UI/UX quality is a feature, not a finish (see §1.1).

## 1.1 Hard rule — no native interactive elements
Never ship a bare browser control: they look different per browser/OS, ignore our tokens, and are ugly on mobile. Use shadcn; if shadcn lacks it, install the **best-in-class** package — never a raw element.

| Never (native) | Always use |
|---|---|
| `<select>` / `<option>` | shadcn **Select** (searchable → **Combobox**) |
| `<input type="date">` / native datepicker | shadcn **DatePicker** / **DateRangePicker** (react-day-picker) |
| `<input type="checkbox">` | shadcn **Checkbox** |
| `<input type="radio">` | shadcn **RadioGroup** |
| `<input type="range">` | shadcn **Slider** |
| `<input type="file">` | styled dropzone (react-dropzone) |
| raw `<textarea>` / `<input>` | shadcn **Textarea** / **Input** |
| number spinner / `type="number"` arrows | shadcn Input + formatted stepper |
| `alert()` / `confirm()` / `prompt()` | shadcn **Dialog** / **AlertDialog** |
| `title=""` tooltip | shadcn **Tooltip** |
| browser/console feedback | **Sonner** toast |
| `<table>` for data | **DataTable** (TanStack) |
| native autocomplete | **Command** / Combobox (cmdk) |
| phone input | libphonenumber-backed input |

If no shadcn primitive exists, install the best lib (dnd-kit, TanStack Virtual, react-day-picker, …) — vetoable per case, but **never a bare element**. Raw HTML is allowed only for non-interactive structure/semantics (`div`, `section`, headings, `p`, real `<a>` links). Enforced in every phase's DoD.

---

## 2. Color tokens (maps 1:1 to shadcn CSS variables)

Neutral ramp = **Zinc**. Accent = **Indigo**. Primary uses **indigo-600** (`#4F46E5`) so white text clears **WCAG AA** (indigo-500 `#6366F1` failed at 14px); indigo-500 stays as ring/active/chart-1.

### Light (`:root`)
| Token | Hex | Use |
|---|---|---|
| `--background` | `#FAFAFA` | page |
| `--foreground` | `#09090B` | text |
| `--card` / `--popover` | `#FFFFFF` | floating surfaces |
| `--card-foreground` | `#09090B` | |
| `--primary` | `#4F46E5` | primary action, active nav |
| `--primary-foreground` | `#FFFFFF` | |
| `--secondary` | `#F4F4F5` | secondary button/surface |
| `--secondary-foreground` | `#18181B` | |
| `--muted` | `#F4F4F5` | muted surface |
| `--muted-foreground` | `#71717A` | captions, labels |
| `--accent` | `#F4F4F5` | hover surface |
| `--accent-foreground` | `#18181B` | |
| `--selected` *(custom)* | `#EEF2FF` / text `#4F46E5` | selected row/nav |
| `--destructive` | `#DC2626` | delete/danger (white text AA) |
| `--success` *(custom)* | `#059669` | won, positive delta |
| `--warning` *(custom)* | `#D97706` | caution |
| `--info` *(custom)* | `#2563EB` | neutral info |
| `--border` / `--input` | `#E4E4E7` | sparse hairlines |
| `--ring` | `#6366F1` | focus ring |
| `--radius` | `0.625rem` (10px) | |

### Dark (`.dark`)
| Token | Hex |
|---|---|
| `--background` | `#09090B` |
| `--foreground` | `#FAFAFA` |
| `--card` / `--popover` | `#18181B` |
| `--primary` | `#4F46E5` (white text) |
| `--secondary` / `--muted` / `--accent` | `#27272A` |
| `--muted-foreground` | `#A1A1AA` |
| `--selected` | `rgba(99,102,241,.16)` / text `#A5B4FC` |
| `--destructive` | `#DC2626` |
| `--success` | `#10B981` · `--warning` `#F59E0B` · `--info` `#3B82F6` |
| `--border` / `--input` | `#27272A` |
| `--ring` | `#818CF8` |

### Chart series (`--chart-1..5`)
Light: `#6366F1` `#8B5CF6` `#0EA5E9` `#F59E0B` `#10B981`
Dark: `#818CF8` `#A78BFA` `#38BDF8` `#FBBF24` `#34D399`

### ROAS / quality heatmap (subtle cell tints — text stays `--foreground`, AA)
Thresholds are the **default**; per-tenant target ROAS overrides later.
| Band | Light bg | Meaning |
|---|---|---|
| `< 1.0` | `#FEE2E2` | losing money |
| `1.0–2.0` | `#FEF3C7` | thin |
| `2.0–4.0` | `#DCFCE7` | healthy |
| `> 4.0` | `#BBF7D0` | winner |
Dark = same hues as `rgba(...,0.14)` overlays. Cost-per-QL heatmap uses the inverse scale.

---

## 3. Typography — Geist Sans (UI) + Geist Mono (numbers/IDs)

| Role | Size/line | Weight |
|---|---|---|
| Display (hero metric) | 30/36 | 600 |
| H1 page title | 24/32 | 600 |
| H2 section | 20/28 | 600 |
| H3 / card title | 16/24 | 600 |
| Body (default) | 14/20 | 400 |
| Small | 13/18 | 400 |
| Label / caption | 12/16 | 500, `--muted-foreground` |
| Table cell | 13/18 | 400 |
| **Numbers (metrics, table, axes)** | inherit | **Geist Mono, tabular** |

Sentence case everywhere (no ALL-CAPS except tiny eyebrow labels with tracking). Max heading weight 600 — 700 reserved for the single hero number.

---

## 4. Spacing, layout, density
- 4px base scale (Tailwind `1=4px`). Common: 8/12/16/20/24/32.
- **Card padding:** 20–24px (airy). **Section gap:** 24–32px. **Page gutter:** 24px (sm: 16px).
- **Table rows:** 36px compact (default) / 32px ultra-compact toggle; header 40px sticky.
- App shell: left sidebar nav (collapsible) + top bar (global date-range + attribution toggle + account switcher) + content. Max content width 1440px, tables full-bleed within.

---

## 5. Radius
`--radius = 10px`. Derived: `sm 6px` (badges, small inputs, table chips) · `md 10px` (buttons, inputs, cards — default) · `lg 14px` (modals, large cards) · `full` (avatars, status dots, count chips). **Buttons = md (10px)** per the "not sharp" rule.

---

## 6. Elevation (soft, calm)
| Level | Light | Use |
|---|---|---|
| `xs` | `0 1px 2px rgba(0,0,0,.05)` | resting button, table |
| `sm` | `0 1px 3px rgba(0,0,0,.07)` | cards |
| `md` | `0 4px 12px rgba(0,0,0,.08)` | dropdown, popover |
| `lg` | `0 12px 32px rgba(0,0,0,.12)` | dialog, sheet |
Dark: halve opacity + add `--border` hairline (shadows read weakly on dark). No hard/black shadows.

---

## 7. Buttons (full spec — your rules locked)

**Shape:** radius 10px, weight 500, sentence case, **no border** except `outline` variant (favor fill/ghost — fewer borders). Soft `xs` shadow on solid variants only.

**Variants**
| Variant | Fill | Text | When |
|---|---|---|---|
| `primary` | `--primary` solid | white | the one main action per view (+ Connect, Save) |
| `secondary` | `--secondary` | `--secondary-foreground` | secondary actions |
| `ghost` | transparent → `--accent` on hover | `--foreground` | toolbars, table row actions, low emphasis |
| `outline` | transparent, 1px `--border` | `--foreground` | use sparingly — only on bare/colored surfaces |
| `destructive` | `--destructive` | white | delete/irreversible |
| `link` | none | `--primary`, underline on hover | inline nav |

**Sizes**
| Size | Height | Text | Pad | Use |
|---|---|---|---|---|
| `sm` | 32px | 13 | 12px | dense toolbars, table |
| `md` (default) | 36px | 14 | 16px | most |
| `lg` | 40px | 14 | 20px | primary CTAs, onboarding |
| `icon` | 36×36 | — | — | icon-only |

**Icon rules (your spec)**
- **Icon + text:** icon left, lucide 16px, `gap-2`. Use when the icon speeds scanning (+ Connect, Export, Filters).
- **Text-only:** when an icon adds noise (Cancel, Save, Apply).
- **Icon-only:** dense/repeated controls (table row actions, toolbar) — **mandatory** `aria-label` + Tooltip. Icon 16–18px.
- Never icon-only for a destructive/irreversible primary action without a confirm step.

States: hover = darken 1 step (solid) / `--accent` bg (ghost); active = darken 2 / scale .98; focus = `ring-2 ring-ring ring-offset-2`; disabled = opacity .5, no pointer; loading = inline spinner replaces leading icon, label stays, button disabled.

---

## 8. Component inventory

**shadcn (use as-is, themed):** Button, Input, Textarea, Select, Combobox, Checkbox, Radio, Switch, Slider, Label, Form (rhf+zod), Dialog, Sheet, Popover, DropdownMenu, Tooltip, Tabs, Card, Badge, Avatar, Separator *(sparingly)*, Skeleton, Sonner (toast), Command (⌘K), Calendar, ScrollArea, Progress, Alert, HoverCard, Breadcrumb.

**Custom (product primitives):**
- **DataTable** (TanStack Table + Virtual): sticky header, column chooser, saved views, server sort/pagination, **tree drill-down** (campaign→adset→ad expand), heatmap cells, sparkline cells, row select + **bulk creative tag**, density toggle.
- **MetricCard** — label + hero number (Geist Mono) + DeltaBadge + mini sparkline.
- **DeltaBadge** — `▲/▼ 24%`, success/destructive color, neutral if flat.
- **HeatmapCell** — bg tint by §2 scale; value in mono.
- **CurrencyValue** — locale + tenant currency, tabular; `—` if null.
- **MatchConfidenceBadge** — `📞 phone · 99%` style; color by confidence band.
- **CanonicalStatusBadge** — Lead/Qualified/Won/Lost (see §9).
- **SyncStatusIndicator** — live dot + "synced 3m ago"; states OK/running/failed.
- **FreshnessBadge** — green/amber/red by SLA.
- **JourneyTimeline** — vertical stepper: click → lead → qualified → won, with source/ad/amount/match.
- **AttributionToggle** — segmented First | Last (side-by-side).
- **DateRangePicker** — presets (Today, 7d, 30d, This month, Custom).
- **EmptyState** — icon + title + one-line + primary action.

---

## 9. Status & badge colors
| Concept | Color |
|---|---|
| Lead | neutral (`--muted`) |
| Qualified | indigo (`--primary` tint) |
| Won / positive | `--success` |
| Lost | `--destructive` (muted/outline, not loud) |
| Ignore | `--muted-foreground` |
| Sync OK | success dot · Running | amber pulsing dot · Failed | destructive dot |
| Match confidence | ≥0.95 success · 0.7–0.95 indigo · <0.7 / review amber |

Badges: `sm` radius, 12px medium, soft tinted bg (`color/10%`) + colored text — not solid blocks (calm).

---

## 10. States (every data view ships all four)
- **Loading:** skeletons matching final layout (table rows, card blocks); never a bare spinner for full pages. Inline spinner only inside buttons.
- **Empty:** EmptyState with a helpful action ("No ads yet — connect Meta").
- **Error:** Alert + retry; stale data shown labeled rather than blanked.
- **Focus:** always-visible 2px indigo ring (a11y, keyboard).
- Hover/active/disabled per §7.

---

## 11. Motion (subtle, calm)
- Durations: 150ms micro (hover/fade), 200ms popover/dropdown, 250–300ms sheet/dialog. Easing: ease-out enter, ease-in exit. **No bounce.**
- Tasteful number count-up on first metric load; sync dot pulse; row expand 200ms.
- Honor `prefers-reduced-motion` → cut to instant.

---

## 12. Iconography
**lucide-react** only (no mixing). 16px inline/in-button, 18–20px standalone, stroke 2 (1.75 ≥24px). Consistent metaphors (Meta=megaphone-ish, CRM=contact, sync=refresh, money=trending-up).

---

## 13. Data-viz
- Recharts via shadcn charts; series = `--chart-1..5`; gridlines very faint; themed tooltips; legends sentence case.
- Always label currency + attribution model (First/Last) on revenue charts.
- Sparklines: 1px accent line, no axis, in table cells.
- Heatmap per §2; keep tints subtle so text stays AA-readable.
- Reconcile-vs-Meta: two labeled series, never merged.

---

## 14. Number / currency / locale formatting (rules)
- `Intl.NumberFormat` with tenant report currency + active locale (uz/ru/en).
- **Tables:** whole units, grouped (`$1,240`) for density; **detail views:** 2 decimals.
- ROAS: 1 decimal + `×` (`4.0×`). Percent: 1 decimal + `%`. CPL/CPQL/CAC: currency, 0–2 dp.
- Large numbers compact only in cards/axes (`$4.98K`), full in tables.
- Missing/unmatched = `—` (em dash), never `0`. Round on display only; store full precision.
- Tabular figures (Geist Mono) so columns align.

---

## 15. Accessibility (WCAG AA)
- Contrast AA for all text (primary fixed to indigo-600 for this reason); focus ring always visible; full keyboard nav incl. table.
- Icon-only buttons: `aria-label` + Tooltip. Color never the sole signal (icon/label + color).
- Dialogs trap focus + ESC; live regions for toasts/sync updates; `prefers-reduced-motion` respected.
- Hit target ≥ 32px.

---

## 16. i18n
- uz / ru / en from day 1; all user strings via i18n keys (no hardcoded text — enforced in DoD).
- Locale-aware number/date/currency/timezone. LTR only (none of these are RTL) but copy never assumes width — layouts flex for longer ru/uz strings.
- Pluralization via the i18n lib; stage labels render in the tenant's CRM language as stored.

---

## 17. Implementation notes
- Tokens live in `apps/web` global CSS (`:root` + `.dark`) + `tailwind.config` extending shadcn. One file, no JS theme object.
- Install shadcn components on demand (CLI) — don't vendor the whole library upfront (ponytail).
- `next-themes` for light/dark/system. Geist via `next/font`.
- Custom primitives (§8) live in `apps/web/src/components/` and compose shadcn — they are the only bespoke UI we build.
