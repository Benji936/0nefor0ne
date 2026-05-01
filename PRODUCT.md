# TradeMarket — Product Context

## Register

product

## Users

Anyone who collects or plays Yu-Gi-Oh and wants to trade physical cards: casual collectors, competitive players, and hobbyists who want to clear duplicates or hunt specific cards. Broad age range. Comfortable with card game metadata (set codes, rarities, conditions) but not necessarily technical. Speed and clarity matter — they have limited time and specific cards in mind.

## Product Purpose

TradeMarket connects card traders who have what each other wants. Users build a trade pile (cards they can give away) and a wishlist (cards they're hunting for), and the platform surfaces mutual matches automatically. The primary experience is social: finding the right person to trade with, and proposing a deal directly. The goal is to remove the friction of large impersonal marketplaces and make peer-to-peer trading feel personal and efficient.

## Brand Personality

Collector-native. Trustworthy. Direct. Not a marketplace, a community tool. The personality is more "Discord server for traders" than "eBay for cards" — personal, focused, and slightly niche in a good way.

## References

- **Cardcluster** (cardcluster.com) — clean, functional, collector-oriented feel. Good information density without clutter. Not flashy.

## Anti-references

- Loud NFT/crypto marketplaces with neon-everything
- Sterile white eBay/Amazon product grids — impersonal, transactional
- Overcrowded spreadsheet-style UIs
- Generic SaaS landing page aesthetics

## Design Principles

1. The trade connection is the product — finding your match and proposing the deal is the core flow, everything else supports it
2. Metadata precision matters: set codes, conditions, rarities, languages are first-class information, not fine print
3. As few steps as possible between "I want this card" and "trade proposed"
4. Dark-first; collectors browse their collection in low-light environments, often at night
5. Card art does the visual work — the UI frames it and gets out of the way

## Accessibility

WCAG AA minimum. Keyboard navigation for all interactive elements. Respect `prefers-reduced-motion`.

## Stack

Vue 3 (Options API + Composition API), Vuetify 3, Tailwind CSS v4, Supabase. YGOProdeck API for card data.

## Key Surfaces

- **Search**: Browse all YGO cards by name or set code, preview card detail, add to trade pile or wishlist
- **Library**: Personal collection split into trade pile and wishlist, card tiles with quantity control
- **Trade Center**: Matched traders who overlap with your wishlist or trade pile; bucketed by match type
- **Propose Trade**: Two-column negotiation UI, select cards for each side of the deal
