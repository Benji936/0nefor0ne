---
name: TradeMarket
description: Peer-to-peer Yu-Gi-Oh card trading platform connecting collectors and players.
colors:
  # Values below are the source of truth: they mirror the CSS custom properties
  # in frontend/src/assets/main.css exactly. If a token changes there, change it
  # here too. Dark is the canonical theme; light mirrors the same roles.
  bg: "#0B0617"
  surface: "#13092A"
  surface-2: "#1C1040"
  border: "#3A206E"
  text: "#EDE8FF"
  muted: "#A890D0"
  accent: "#F42D87"
  trade: "#9A52F5"
  mutual: "#2DD4BF"
  bg-light: "#FFFFFF"
  surface-light: "#F7F2FF"
  surface-2-light: "#EDE0FF"
  border-light: "#C5ABED"
  text-light: "#1C0852"
  muted-light: "#6830A8"
  accent-light: "#C9185A"
  trade-light: "#6B20D9"
  mutual-light: "#0882A8"
  nav: "#0B0617"
  skeleton: "#1E1248"
typography:
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.05em"
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  mono:
    fontFamily: "ui-monospace, 'Cascadia Code', monospace"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-trade:
    backgroundColor: "{colors.trade}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  button-trade-hover:
    backgroundColor: "#B56EFF"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  button-accent-hover:
    backgroundColor: "#FF6A9A"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  button-mutual:
    backgroundColor: "{colors.mutual}"
    textColor: "#13031A"
    rounded: "{rounded.md}"
    padding: "8px 20px"
  card-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "20px"
  chip-mutual:
    backgroundColor: "rgba(45,212,191,0.15)"
    textColor: "{colors.mutual}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
  chip-trade:
    backgroundColor: "rgba(154,82,245,0.15)"
    textColor: "{colors.trade}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Design System: TradeMarket

## 1. Overview

**Creative North Star: "The Card Shop Back Table"**

TradeMarket is built around a specific moment: the back table at a local game store, where two collectors spread their binders and negotiate a trade face to face. That exchange is direct, personal, and driven entirely by mutual need — no platform taking a cut, no anonymous transaction. The UI should feel like that table: honest, focused, slightly dim, with card sleeves glinting under fluorescent light. Information is dense because the people using this *want* the information. They're not intimidated by set codes and rarity abbreviations.

The visual register is dark by default — not because dark mode is fashionable, but because this is a tool used at night, at kitchen tables, at tournament venues with overhead lighting already straining. The deep indigo-black backgrounds (`#0B0617`) protect against glare fatigue during long collection-building sessions. Color is used with purpose: amethyst for trading actions, hot pink for desire and wishlists, teal reserved exclusively for the mutual match — the moment of connection that the whole platform exists to create.

What this system explicitly rejects: the neon maximalism of NFT/crypto marketplaces; the sterile white grid of eBay and TCGPlayer; the sprawling spreadsheet UIs of legacy collection trackers. Cardcluster's functional clarity is the closest public reference — dense but never cluttered, collector-native without being geeky-looking.

**Key Characteristics:**
- Dark-first, with a secondary light mode using lavender-tinted whites
- Full palette: three semantic color roles (trade/accent/mutual) used with discipline
- Card images do the visual work; the UI frames and recedes
- Monospace font for set codes and card identifiers
- No decorative chrome — every border, shadow, and badge earns its place
- Interaction hierarchy is tight: primary → secondary → tertiary, never ambiguous

## 2. Colors: The Amethyst Exchange Palette

Three semantic roles, one neutral system, two modes. The dark mode is canonical; light mode mirrors the same roles in reversed lightness.

**The Three-Role Rule.** Trade (amethyst), Accent (hot pink), and Mutual (teal) are the only saturated colors in the system. Each maps to exactly one meaning and is never borrowed for decoration. Mutual is the rarest — it appears only when both sides of a trade align. Its rarity is the point.

### Primary — Trade (Amethyst)

- **Amethyst Trade** (`#9A52F5` dark / `#6B20D9` light): Trade pile actions, "Add to trade," "Propose trade" buttons, the "You give" column in the negotiation UI. The color of offering something.
- **Deep Amethyst Surface** (`#13092A`): Card and panel backgrounds in dark mode. The base layer on which card art rests.
- **Amethyst Border** (`#3A206E`): Dividers, input strokes, card outlines. Visible but not demanding.

### Secondary — Accent (Hot Pink)

- **Collector's Pink** (`#F42D87` dark / `#C9185A` light): Wishlist actions, heart icons, "Add to wishlist" buttons, the "You receive" emotional framing. The color of want.
- **Pink Berry** (`#C9185A` light mode): Deeper pink for light-mode contrast without losing warmth.

### Tertiary — Mutual (Teal)

- **Trade Match Teal** (`#2DD4BF`): Mutual match badges, "They want this" indicators in the propose-trade UI, match count chips. Used nowhere else. When it appears, it means something.

### Neutral

- **Void Indigo** (`#0B0617`): Page background, nav background. Near-black with a deliberate purple tint — never pure black.
- **Lavender White** (`#E8E0FF`): Primary text in dark mode. Warm toward the brand hue, never clinical white.
- **Soft Violet** (`#A890D0`): Secondary text, muted labels, icon fills at rest. The neutral voice of the system.
- **Skeleton Plum** (`#1E1248`): Loading skeleton backgrounds. Darker than the surface, lighter than the border.
- **Near-White Tint** (`#FEFEFF`): Page background in light mode. Tinted to 0.005 chroma toward purple — imperceptible but not sterile.
- **Deep Indigo Text** (`#1A0D45`): Primary text in light mode. High contrast without the harshness of pure black.

### Named Rules

**The No-Gray Rule.** Pure grays (`#555`, `#ccc`, `text-gray-*`) are prohibited. Every neutral in the system is tinted toward the brand hue. Icon fills, placeholder text, and muted labels use `var(--c-muted)` (Soft Violet), not a gray.

**The Mutual Scarcity Rule.** Teal appears only for confirmed mutual matches and "they want this" signals in the trade negotiation UI. Never use it for generic success states, positive alerts, or decoration.

## 3. Typography

**Body/UI Font:** system-ui, -apple-system, sans-serif (system default)
**Code/Identifier Font:** ui-monospace, 'Cascadia Code', monospace

**Character:** The system uses the device's native sans-serif — no custom font load, no FOUT, instant render. Typography earns its hierarchy through weight and size contrast, not through typeface personality. Set codes and card extensions use a monospaced fallback to distinguish metadata from names at a glance.

### Hierarchy

- **Section Heading** (700 weight, 1.25rem, 0.05em letter-spacing, uppercase tracking): Page section labels — "Cards for Trade", "Mutual Matches". Uppercase + tracking creates visual separation without requiring a different typeface.
- **Title** (600–700 weight, 0.9375rem–1rem, 1.3 line-height): Card names in overlays, dialog headers, user names in match cards.
- **Body** (400 weight, 0.875rem, 1.5 line-height): Card descriptions, metadata strings, explanatory copy. Max ~65ch line length.
- **Label** (600 weight, 0.6875rem–0.75rem, 0.08em letter-spacing): Rarity abbreviations, condition tags, language chips. Small but legible through weight.
- **Mono** (600 weight, 0.75rem, ui-monospace): Set codes (e.g., LOB-EN001), extension identifiers in card rows. Immediately distinguishes identifier from name.

### Named Rules

**The Mono Identifier Rule.** Set codes, card extensions, and print codes are always rendered in monospace. This lets the eye distinguish metadata from card names instantly, matching how collectors read binders.

**The Uppercase Section Rule.** Section headers use uppercase + tracking (`text-xl uppercase font-semibold tracking-wide`), never sentence case. This creates a catalog-style hierarchy that feels native to the TCG product category.

## 4. Elevation

TradeMarket uses tonal layering as its primary depth model — surfaces are stacked by background color (`bg` → `surface` → `surface-2`), not by shadow. Shadows appear only as ambient glow on hover states for interactive elements, and as a subtle inset on selected trade rows.

**The Flat-By-Default Rule.** Surfaces are flat at rest. No card has a shadow unless it is in an interactive hover state. Hover glow uses the element's semantic color (`var(--c-trade)`, `var(--c-accent)`, `var(--c-mutual)`) at low opacity — never a neutral gray shadow.

### Shadow Vocabulary

- **Hover Glow** (`0 12px 40px {semantic-color}/30%, 0 2px 8px rgba(0,0,0,0.3)`): User match cards on hover. Color is the kind-specific glow variable `--kind-glow`.
- **Inset Selection Glow** (`inset 0 0 20px rgba(133,20,75,0.08)` for accent, similar for trade): Applied to selected trade rows to indicate checked state without a border shift.
- **Nav Bottom Border** (`1px solid var(--c-border)`): The only structural separator. The nav is flush with the page background; the border is the sole depth signal.

## 5. Components

### Buttons

Vuetify `v-btn` with `variant="flat"` and inline style overrides for semantic color. Shape is gently rounded (8px radius) — not pill, not square.

- **Trade button** (amethyst `#9A52F5`, white text, 8px radius, `mdi-plus-box` prefix icon): Primary action for adding to trade pile or proposing a trade.
- **Accent button** (hot pink `#F42D87`, white text, 8px radius, `mdi-heart-plus` prefix icon): Wishlist actions.
- **Mutual button** (teal `#2DD4BF`, dark text `#13031A`, 8px radius): "See traders" / confirm match actions.
- **Ghost / Cancel** (`variant="text"`, `color="gray"`): Destructive-adjacent actions, dialog cancel. No background.
- **Hover:** Vuetify handles opacity shift; add no extra transforms on buttons.
- **Loading:** Vuetify `:loading` prop shows spinner inline — always used on async submit actions.

### Trade Row (Signature Component)

The core interactive primitive of the Propose Trade dialog. A horizontal row with checkbox, card thumbnail, name + metadata, market links, and an optional quantity input.

- **Default:** `border-color: var(--c-border)`, transparent background, 8px radius.
- **Selected (give/trade):** `border-pink-500/50 bg-pink-950/40 shadow-[inset_0_0_20px_rgba(133,20,75,0.08)]`
- **Selected (receive):** `border-blue-500/50 bg-blue-950/40` — amethyst-adjacent blue for the receiving side.
- **Transition:** background-color, border-color, box-shadow — 200ms ease-out. Never `transition: all`.
- **Keyboard:** `role="checkbox"`, `aria-checked`, `tabindex="0"`, Space/Enter to toggle.

### Card Tile (Library / Search)

Vertical tile: card image (59:86 aspect ratio) → name + rarity chip + condition + language → quantity control.

- **Width:** 160px fixed. The image fills the full width; the card art does the visual work.
- **Image:** `aspect-ratio: 59/86`, `loading="lazy"`, `object-cover`.
- **Data strip:** `px-3 pt-2 pb-1`, small text, rarity as abbreviated initials in amber chip.
- **Quantity:** Vuetify `v-number-input`, control-variant="split", density="compact". Setting to 0 deletes the row.
- **Hover:** `outline outline-white` on the image wrapper (Search view card preview).

### Card Preview Overlay (CardYugi)

Vuetify `v-overlay` triggered by clicking a card thumbnail. Contains: full-size card image + data, per-print set code list with Cardmarket links, market footer links (TCGPlayer, eBay), and action buttons.

- **Container:** `max-width: 680px`, `background: var(--c-surface)`, `border-radius: 12px`, `px-10 py-7`.
- **Print list:** scrollable at `max-height: 110px`, `border-color: var(--c-border)`, set code in mono font.
- **Action buttons:** Three equal-width buttons (trade/wish/see-traders) in a flex row.

### User Match Card (UserCard)

Cards in the Trade Center, bucketed by match type. Colored top accent bar, avatar, name + location, count pills, card thumbnail strips, CTA button.

- **Kind colors:** mutual = `var(--c-mutual)`, they-have = `var(--c-trade)`, they-want = `var(--c-accent)`.
- **Hover glow:** `box-shadow: 0 12px 40px var(--kind-glow)`, `transform: translateY(-3px)`. GPU-promoted via `will-change: transform` on card thumbnails.
- **Top accent bar:** 3px linear gradient from the kind color — centered, fading to transparent at edges. Not a side stripe.

### Navigation (NavItem)

Icon-only nav items with tooltip and active indicator.

- **Default:** transparent background, icon in `var(--c-accent)`.
- **Hover / Active:** `background-color: var(--c-surface-2)`.
- **Active indicator:** 2px `h-0.5 w-4 rounded-full` line below the icon in `var(--c-accent)`. Appears only when active.
- **Light mode:** icons use CSS `filter: brightness(0) saturate(0%)` to render as near-black.

### Inputs / Search

- **Nav search:** plain `<input>`, no border, `background: var(--c-surface-2)`, `outline-color: var(--c-accent)` on focus, `border-radius: 6px`.
- **Dialog inputs:** Vuetify `v-text-field variant="outlined" density="comfortable"`. Border shifts to `var(--c-accent)` on focus.
- **Number input:** Vuetify `v-number-input control-variant="split"` for quantity. Always `min=1` when adding, `min=0` when editing (0 = delete).

### Skeleton Loading

Animated pulse skeletons using `var(--c-skeleton)` (`#1E1248` dark, `#E2D2F8` light). The `animate-pulse` Tailwind utility handles the opacity oscillation. Card-shaped skeletons use the 59:86 aspect ratio so layout doesn't shift when real images arrive.

## 6. Do's and Don'ts

### Do:

- **Do** use `var(--c-trade)` for all "giving" actions, `var(--c-accent)` for all "wanting" actions, and `var(--c-mutual)` only for confirmed mutual matches. Never swap roles.
- **Do** render set codes and card extensions in monospace (`font-mono`). The visual difference from card names matters to collectors.
- **Do** use `loading="lazy"` and `aspect-ratio: 59/86` on every card image. CLS on a card-heavy UI is immediately noticeable.
- **Do** use `transition: background-color, border-color, box-shadow` — explicit properties only. Never `transition: all`.
- **Do** abbreviate rarities to initials in compact contexts (NM, SR, UR). Show the full name on hover via `title` attribute.
- **Do** keep all interactive elements keyboard-reachable with visible focus rings. `role`, `aria-checked`, `tabindex`, and `@keydown.space/enter` are required on custom interactive divs.
- **Do** use the three-surface tonal stack (`--c-bg` → `--c-surface` → `--c-surface-2`) for depth instead of shadows at rest.
- **Do** set `will-change: transform` only on elements with known GPU-promoted hover animations (card thumbnails in UserCard).

### Don't:

- **Don't** use pure gray (`#555`, `#666`, `text-gray-400`, `color="#ccc"`). Tint every neutral toward the brand hue. Use `var(--c-muted)` instead.
- **Don't** use `transition: all`. Always name the properties explicitly to avoid accidental layout reflow.
- **Don't** build a loud neon aesthetic — no rainbow gradients, no glowing borders on every element, no drop shadows on text. The reference here is Cardcluster's restraint, not a crypto marketplace.
- **Don't** create sterile white product grids. The light mode uses lavender-tinted whites (`#FEFEFF`, `#F8F5FF`), never clinical white.
- **Don't** use side-stripe borders (`border-left > 1px` as a colored accent). Use full borders, background tints, or leading icons instead.
- **Don't** use `background-clip: text` with a gradient background for decorative purposes. Emphasis is achieved through weight and size contrast, never gradient text.
- **Don't** render the mutual color (`#2DD4BF`, teal) for anything other than confirmed mutual matches. Using it for generic success or positivity dilutes its meaning.
- **Don't** place headless `<AddCard>` components inside Vuetify `v-overlay` default slots — they teleport out of DOM scope and break `$refs`. Always place them as siblings outside the overlay.
- **Don't** mix `<script setup>` with Options API methods that need to be called via `$refs` without `defineExpose()`. The methods become inaccessible. Consolidate to one API style per component.
