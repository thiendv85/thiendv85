---
version: alpha
name: ATP Backorder — Bento Light Luxury
description: >-
  Page-level design override for "Phân tích Nợ hàng" (BackorderAnalytics).
  Bento composition on a warm-light surface, with editorial typography and
  semantic color usage for aging tiers, anomaly tiers, and coverage status.
  Overrides design-system/atp-dashboard/MASTER.md for this page only.
colors:
  # ─── 4-HUE PALETTE — onyx · bronze · clay · sage ──────────────
  # Hue 1 — ONYX (workhorse: text, dark surface, neutral signal)
  surface-ink: "#0E1116"
  ink: "#15181E"
  ink-muted: "#5B6470"
  ink-soft: "#8A93A0"
  # Neutral surfaces (counted as part of onyx ladder, not a separate hue)
  surface: "#F4F1EB"
  surface-raised: "#FFFFFF"
  surface-sunken: "#ECE7DD"
  hairline: "#E6E1D8"
  # Hue 2 — BRONZE (premium accent + warning ladder via tonality)
  bronze: "#A8854B"
  bronze-strong: "#8E6E2F"
  bronze-soft: "#E9DDBE"
  bronze-deep: "#5C4720"
  # Hue 3 — CLAY (critical only: overdue, severe anomaly, AGING eyebrow)
  accent: "#B8422E"
  accent-soft: "#F2D9CF"
  accent-deep: "#7A2A1B"
  on-accent: "#FFFFFF"
  # Hue 4 — SAGE (positive only: data fresh, transfer opportunity)
  ok: "#146346"
  ok-soft: "#D6ECDF"
  # ─── Semantic remaps (no new hues — every alias points into the 4 above)
  primary: "{colors.surface-ink}"
  warn: "{colors.bronze-strong}"
  warn-soft: "{colors.bronze-soft}"
  danger: "{colors.accent}"
  danger-soft: "{colors.accent-soft}"
  data-blue: "{colors.ink-muted}"
  data-blue-soft: "{colors.surface-sunken}"
  aging-30: "{colors.ink-muted}"
  aging-60: "{colors.bronze-strong}"
  aging-90: "{colors.accent}"
  aging-over90: "{colors.accent-deep}"
typography:
  display:
    fontFamily: "Fraunces"
    fontSize: 2.25rem
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  h1:
    fontFamily: "Fraunces"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  h2:
    fontFamily: "Fraunces"
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body-md:
    fontFamily: "Inter"
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "Inter"
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.45
  label-caps:
    fontFamily: "Inter"
    fontSize: 0.6875rem
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.18em"
  metric-xl:
    fontFamily: "Fraunces"
    fontSize: 2.75rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.025em"
  metric-md:
    fontFamily: "Fraunces"
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.015em"
  mono:
    fontFamily: "JetBrains Mono"
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
rounded:
  xs: 6px
  sm: 10px
  md: 14px
  lg: 20px
  xl: 28px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
components:
  bento-tile:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.lg}"
    padding: 20px
  bento-tile-feature:
    backgroundColor: "{colors.surface-ink}"
    textColor: "#F7F5F2"
    rounded: "{rounded.xl}"
    padding: 28px
  filter-chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    padding: 8px
  filter-chip-active:
    backgroundColor: "{colors.surface-ink}"
    textColor: "#F7F5F2"
    rounded: "{rounded.sm}"
    padding: 8px
  metric-card:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: 16px
  data-table-shell:
    backgroundColor: "{colors.surface-raised}"
    rounded: "{rounded.lg}"
    padding: 0px
  badge-aging-30:
    backgroundColor: "#EEF0F4"
    textColor: "{colors.aging-30}"
    rounded: "{rounded.xs}"
    padding: 6px
  badge-aging-60:
    backgroundColor: "{colors.bronze-soft}"
    textColor: "{colors.bronze-deep}"
    rounded: "{rounded.xs}"
    padding: 6px
  badge-aging-90:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.xs}"
    padding: 6px
  badge-aging-over90:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.xs}"
    padding: 6px
  status-stock:
    backgroundColor: "{colors.ok-soft}"
    textColor: "{colors.ok}"
    rounded: "{rounded.xs}"
    padding: 6px
  status-po:
    backgroundColor: "{colors.bronze-soft}"
    textColor: "{colors.bronze-deep}"
    rounded: "{rounded.xs}"
    padding: 6px
  status-gap:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-deep}"
    rounded: "{rounded.xs}"
    padding: 6px
  cta-primary:
    backgroundColor: "{colors.surface-ink}"
    textColor: "#F7F5F2"
    rounded: "{rounded.sm}"
    padding: 12px
  cta-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview

**Editorial Bento meets Operations Console.** The page reads like a financial
broadsheet stitched together from offset tiles: a dark feature tile carries the
identity and headline metric, while adjacent light tiles host filters, KPI
groups, and the matrix tables. Density stays high — this is an operations
surface, not a marketing page — but the rhythm comes from intentional tile-size
contrast, not uniform cards.

Use this file as the source of truth for the Backorder page only. It overrides
the general ATP Dashboard MASTER tokens (blue + amber, Fira Code/Sans) with a
warmer, more typographic palette suited to long sessions of reading dense
financial data.

## Colors

**Strict 4-hue palette.** Every chromatic value on the page resolves to one of
four hues. Greys, whites, and warm neutrals belong to the onyx family and are
not counted as additional hues. Semantic aliases (`warn`, `danger`, `data-blue`,
`aging-*`) re-point into the 4-hue ladder — they do not introduce new colors.

1. **Onyx (`#0E1116` + ink ladder)** — workhorse. Carries text, dark surfaces,
   axis lines, neutral signals (NCC trễ, CẦN XỬ LÝ chips). Includes
   `ink` / `ink-muted` / `ink-soft` for text emphasis, plus surface neutrals
   (`surface`, `surface-raised`, `surface-sunken`, `hairline`).
2. **Bronze (`#A8854B`)** — premium accent + warning ladder. Used for the
   hero metric gold gradient, eyebrow accents, "ĐƠN LÂU NHẤT" callout,
   warn-tier signals (TRỄ NẶNG / TRỄ NHẸ tones), aging-60 tier, "PO" status
   pill. Bronze tonality (`bronze-strong`, `bronze-soft`, `bronze-deep`)
   replaces the previous orange/amber palette.
3. **Clay (`#B8422E`)** — critical only. Reserved for: TRỄ N.TRỌNG, GAP /
   "Quá hạn ETA", aging-90 + aging-over90 tiers, AGING eyebrow, primary
   action CTAs (Xuất Excel) when the action is consequential. Never
   decorative. Replaces both the old `danger` red and "rose" inline classes.
4. **Sage (`#146346`)** — positive only. Reserved for: data-fresh badges
   (DỮ LIỆU THÁNG), STOCK status pill, ĐIỀU CHUYỂN opportunities. The
   single "good news" hue.

Aging tiers map: `30D → ink-muted`, `60D → bronze-strong`, `90D → clay`,
`>90D → clay-deep`. Saturation increases monotonically as the bucket worsens.

The previous `data-blue` (#2F5BD6) is removed; informational signals collapse
to onyx/ink-muted because blue carried no operational distinction beyond
"different shade than warn/danger" — that distinction is now the bronze ladder.

## Typography

Two-family pairing: **Fraunces** for headings and metrics gives the page an
editorial, almost newsprint character. **Inter** carries the workhorse body
text and labels. Mono numerics use **JetBrains Mono** for tabular alignment in
tables and tile metrics.

- **Display / metric-xl:** The single hero number per layout (TỔNG NỢ value).
- **h1:** Page title and bento section titles.
- **h2:** Matrix table titles ("Phân bổ theo Tuổi nợ", "Phân bổ theo LOIS").
- **label-caps:** Tile eyebrow labels and column headers — always uppercase,
  always with `0.18em` letter-spacing.
- **mono:** Every numeric cell in tables. Never use proportional digits for
  data.

Rationale: serif metrics on a warm surface signals "considered" rather than
"alarm dashboard." Operators read these numbers all day; the typography should
slow the eye, not flicker at it.

## Layout

The page is a vertical stack of three zones, each built from a 12-column bento
grid:

1. **Header bento (≈ 220–260px tall, single zone replacing the previous 3-row
   navy stack)**
   - **Feature tile** (col-span-7): `bento-tile-feature` (dark ink). Contains
     page title, eyebrow, total backorder hero metric (`metric-xl`),
     subline (SKU count + value), and primary CTA (Xuất Excel).
   - **KPI cluster tile** (col-span-5): `bento-tile`. 2×2 mini-KPI grid
     (Tuổi nợ TB, % Trễ LT, Đơn lâu nhất, PO Coverage) with `metric-md` numbers
     and label-caps eyebrows.
   - **Filter chip rail** (col-span-12): `filter-chip` row beneath the two
     tiles. Hosts Tổng quan reset, anomaly tier chips, NCC chip, transfer chip,
     and warehouse scope (NB/BB).

2. **Filter strip (sticky, ≈ 56px tall)**
   - Single sticky surface holding search, coverage segments, aging segments,
     dimension dropdowns, and matrix unit toggle. Unchanged structure from
     the existing layout — just retoned to the new palette.

3. **Matrix and table zone**
   - **Matrix tiles** (col-span-12, two stacked or side-by-side at ≥ xl):
     `data-table-shell` per matrix (Aging matrix + LOIS matrix).
   - **SKU detail table:** Full-width `data-table-shell`. Sticky header,
     zebra rows on `surface-sunken`, no inner shadow.
   - **Pagination:** Right-aligned, `body-sm`, page-size segmented control.

Section spacing uses `--space-2xl` (48px) between zones, `--space-lg` (24px)
within a zone.

## Elevation & Depth

Light luxury depth. No drop-shadow stacking, no neon glow. Tiles get a single
soft shadow plus a hairline border:

```
--shadow-tile: 0 1px 2px oklch(15% 0 0 / 0.05),
               0 12px 32px -16px oklch(15% 0 0 / 0.10);
--shadow-tile-feature: 0 4px 8px oklch(8% 0 0 / 0.18),
                       0 32px 64px -24px oklch(8% 0 0 / 0.22);
```

Hover lifts (≤ 2px translate, ≤ 1.02 scale) only on interactive tiles
(filter chips, CTA). Matrix tiles do not lift on hover — they are reading
surfaces, not buttons.

## Shapes

Tile radii follow a clear scale:

- `rounded.xs` (6px) — badges, dense pills
- `rounded.sm` (10px) — chips, segmented controls, buttons
- `rounded.md` (14px) — small KPI sub-tiles
- `rounded.lg` (20px) — bento tiles and table shells
- `rounded.xl` (28px) — the dark feature tile only

Avoid mixing radii within a tile. The eye reads radius as material; mixing it
makes the surface feel cheap.

## Components

### Bento tile (`bento-tile`, `bento-tile-feature`)

- `bento-tile` is the default light tile: white surface, hairline border,
  `--shadow-tile`.
- `bento-tile-feature` is the dark anchor: `surface-ink` background with
  `#F7F5F2` text. Use exactly **one** per top-level header bento.

### Filter chip (`filter-chip`, `filter-chip-active`)

Pill at h-32 with `label-caps` text. Inactive chips use `surface-raised` on
hairline; active chips invert to `surface-ink`. Anomaly chips keep their
semantic color via a 1.5px left border instead of a full background swap, so
the row stays calm.

### Metric card (`metric-card`)

Small KPI sub-tile inside the cluster tile. Uses `metric-md` for the value,
`label-caps` for the eyebrow, and a thin baseline rule above the sub-text.

### Aging badges (`badge-aging-30/60/90/over90`)

Compact pills with semantic surface + ink. >90D pills use a deeper crimson on
the same soft surface as 90D so the bucket reads as "worse" without becoming
visually screaming.

### Status badges (`status-stock`, `status-po`, `status-gap`)

Inline pills inside the SKU table for coverage status. Use `body-sm` weight,
not bold uppercase — these appear hundreds of times per page and need to stay
calm.

### Data table shell (`data-table-shell`)

Wraps every dense table. No inner card padding (the table draws its own
padding). Sticky `thead` uses `surface-sunken`. Zebra rows alternate
`surface-raised` and `surface-sunken` at 60% opacity.

### CTAs

- `cta-primary` (`surface-ink`) — Xuất Excel and other top-level actions.
- `cta-accent` (clay) — Reserved. Use for the single most consequential CTA
  per screen. The Backorder page may not need any clay CTA at all.

## Do's and Don'ts

- ✅ Use **one** `bento-tile-feature` per top-level grid. Two dark tiles flatten
  the hierarchy and the page reads as "dark dashboard" again.
- ✅ Numerics in tables and tile values use `mono` typography for tabular
  alignment.
- ✅ Aging color steps must be monotonic: 30 → 60 → 90 → >90 always increases
  in saturation, never decreases.
- ✅ Sticky filter strip uses `surface-raised` with hairline, not blur. Blur
  fights with the warm surface and looks muddy.
- ❌ No gradient backgrounds on tiles. The previous design used radial-gradient
  glows — they conflict with the editorial palette.
- ❌ No emoji icons. Use Font Awesome or Lucide consistent with MASTER.md.
- ❌ Do not animate `width`/`height`/`top`/`left` on tiles or rows — only
  `transform` and `opacity`.
- ❌ Do not use clay accent for decoration. It is a CTA-only color.
