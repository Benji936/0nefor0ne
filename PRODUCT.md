# Product

## Register

product

## Users

Yu-Gi-Oh collectors and players who trade cards peer to peer. They know set codes, rarity abbreviations, and card conditions cold, and they are not intimidated by dense information. They use TradeMarket at night and in odd moments: at kitchen tables, on a phone at a tournament venue, on a laptop during a long collection-building session. Their job to be done is direct: find someone who wants what I have and has what I want, then arrange the trade themselves, with no platform taking a cut and no anonymous marketplace friction.

On the profile / account page specifically, the job is quieter: keep my identity, location, and trading range accurate so matches are relevant; manage the store or community I own; connect Discord to post announces; and check my trade history. It is a settings surface, visited occasionally, not a workspace lived in daily.

## Product Purpose

TradeMarket recreates the back table at a local game store, where two collectors spread their binders and negotiate face to face. It exists to create the moment of mutual match: when both sides of a trade align. Success is a relevant match surfaced quickly and a trade arranged directly between two people. The platform frames the exchange and then gets out of the way.

## Brand Personality

Honest, focused, collector-native. The voice is plain and confident, never salesy or hand-holding. Information is dense because the people using this want the information. The feel is the card-shop back table: direct, personal, slightly dim, card sleeves glinting under fluorescent light. Emotionally it should read as trustworthy and unhurried, a tool that respects the user's expertise rather than performing at them.

## Anti-references

- The neon maximalism of NFT / crypto marketplaces (glowing borders on everything, rainbow gradients, neon-on-black).
- The sterile white product grid of eBay and TCGPlayer (clinical whites, generic marketplace chrome).
- The sprawling spreadsheet UIs of legacy collection trackers (data dumps with no hierarchy).
- Generic SaaS-settings templates: a stack of identical bordered cards, hero-metric tiles, gradient-text headings. The account page must not read as a Bootstrap admin panel.

## Design Principles

- **The table, not the storefront.** Every screen should feel like a direct, personal exchange, not a marketplace transaction. Warmth comes from directness, not decoration.
- **Collector-native density.** Trust users with information. Show set codes, conditions, and counts plainly; never dumb the interface down or pad it with explanatory chrome.
- **Color is meaning, never decoration.** Amethyst (trade), pink (want), and teal (mutual) each carry one meaning. Teal is scarce by design; spending it on generic success dilutes the one moment the product exists for.
- **Recede so the content leads.** The UI frames and steps back. Borders, badges, and shadows each earn their place or are removed.
- **Honest surfaces.** Flat by default, tonal layering for depth, no faux-glass or gratuitous elevation. What looks interactive is interactive.

## Accessibility & Inclusion

Target WCAG 2.1 AA. Body and UI text meet 4.5:1 contrast against their surface in both dark (canonical) and light modes; the tinted-neutral system must not drop below that. Every custom interactive element (trade rows, scope toggles, upload triggers) is keyboard reachable with a visible focus ring and correct role / state (`aria-pressed`, `aria-checked`, labels on icon-only controls). Color is never the sole signal: pair it with an icon, label, or text. Honor `prefers-reduced-motion` by disabling non-essential animation (pulses, spins, transitions). Design for one-handed phone use as much as desktop.
