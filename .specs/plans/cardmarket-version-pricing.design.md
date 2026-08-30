# Cardmarket version pricing

## Goal

Show an accurate Cardmarket price for each card version. Cardmarket's product catalogue and daily price guide already contain every product and price. The missing relationship is which rarity and version belong to each `idProduct` when one card has several products in the same expansion.

## Price data

The daily import stores every published metric for each `idProduct`: `trend`, `low`, `avg`, `avg1`, `avg7`, and `avg30`. The UI displays `trend`, falls back to `low`, and otherwise displays “Price unavailable.” It never substitutes an average.

The importer refreshes prices without changing verified identity fields. Fresh price data and version enrichment remain independent jobs.

## Identity model

A printing is the group identified by `(idExpansion, idMetacard)`. A group with one product already has an exact price. A group with several products needs a verified mapping from each `idProduct` to its version and rarity.

The resolver accepts these evidence sources, strongest first:

1. `manual`
2. `cardmarket_page`
3. `cardmarket_expansion_page`
4. `cardmarket_expansion_elimination`

A weaker source cannot overwrite a stronger source. A contradiction stops the write and becomes an audit record.

The resolver never infers identity from product order, row order, product ID order, release date, or price.

## Enrichment sweep

The sweep routes a Cardmarket expansion to its singles listing through a sample `idProduct`. It loads every listing page once, extracts the product ID from the image URL, and reads version and rarity from the rendered label.

The runner groups catalogue products by `(idExpansion, idMetacard)` and skips single-product groups. Each multi-product group must prove its own completeness. All listed IDs must belong to the group, no ID may repeat, every row must state an identity, and every identity must be distinct.

A missing-artwork row may resolve by elimination only when exactly one unnamed row and one unassigned product remain. Other unresolved groups fall back to individual product pages. Groups that remain indeterminate require manual review.

Writes are printing-atomic: the runner writes every sibling identity or none.

## Operations

The runner records progress per expansion and resumes after interruption. It paginates listings, applies bounded exponential backoff to rate limits, and does not repeat completed expansions. A markup change or unreadable row blocks only the affected printing and records the failure.

Each run reports routed expansions, pages read, direct identities, eliminations, product-page fallbacks, conflicts, and unresolved groups. Audit totals must account for every multi-product printing.

## Application behavior

CardPage keys a printing by set code and normalized rarity. An exact product shows its `trend` price or, when absent, its `low` price. Supporting text identifies the displayed metric and the price-guide date.

An unresolved multi-product printing shows a price range and asks the owner to select the exact version. A resolved product without `trend` or `low` shows “Price unavailable.”

## Verification

Implementation follows test-driven development:

1. Price selection tests prove `trend` wins, `low` is the only fallback, and averages never display.
2. Printing-key tests cover equal set codes with different rarities.
3. Resolver tests cover direct IDs, unique elimination, several unknown siblings, incomplete pages, duplicate IDs, renamed cards, and conflicting evidence.
4. Runner tests cover pagination, resumability, bounded retries, and printing-atomic writes.
5. Database tests prove price refreshes preserve enriched identities.
6. Component tests cover exact, range, low-fallback, and unavailable states.
7. A current-catalogue dry run establishes the baseline before any database write.
8. The final audit classifies every multi-product printing as resolved or explicitly unresolved.

## Baseline

The Cardmarket files dated 2026-08-26 contain 86,507 Yu-Gi-Oh singles and prices for 86,494 of them. The current join places 588 of 1,175 expansions. Of 66,829 printing groups, 55,121 contain one product and already resolve exactly. The remaining 11,708 groups contain several products and need version identity.
