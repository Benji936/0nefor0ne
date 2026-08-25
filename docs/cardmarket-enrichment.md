# Resolving a Cardmarket identity

Which product a price belongs to is decided by `idProduct` and nothing else.
Getting there means turning "this card, in this set" into one product id, and
for most printings that is already unambiguous -- one product, one price. The
work below only concerns printings holding several products, where a card was
printed at more than one rarity and each rarity is its own product.

The rungs are ordered by what they cost and by how directly Cardmarket states
the answer. Each one is tried only for what the rung above could not settle.

## 1. Route the expansion

`cardmarket_expansion_route` maps our `id_expansion` to the URL its listing
lives at. The mapping came from the expansion index, bridged by a sample
product id rather than by name -- see that table's own comment for why the slug
is never generated.

Without a route the expansion cannot be read at all, so this is the gate on
everything after it. 1,169 of 1,257 expansions are routed.

## 2. Read the listing pages

~30 products per page, against one per product page. Each row states the
identity twice: the image path carries the `idProduct`, the alt carries the
version and rarity in the same grammar the product page's H1 uses.

## 3. Direct identity

A row whose image names its own id resolves itself, recorded as
`cardmarket_expansion_page`. This settles the large majority: 113 of 131 rows
on CORI, 142 of 142 on MZMU.

**The rarity comes from the alt. The URL slug is corroboration for the card
name and nothing else.** A slug is fixed when the product is first published
and is not rewritten when the product changes, so it goes stale: 20 of 25LP's
82 rows sit at `...-V2-Secret-Rare` while the alt, the H1 and the rarity field
all say Ultra Rare. Product pages 845461 and 845521 settled it in both
directions -- the alt is right.

So a slug that disagrees about rarity is neither a reason to refuse the row nor
a value to prefer. Only a slug naming a different *card* is a refusal, because
that means the row was assembled from two different products.

## 4. Elimination, for rows with no artwork

Products Cardmarket has no picture for share one placeholder image, so their
rows carry a correct identity and no id. Where the remaining mapping is
mathematically unique -- both sets complete, exactly one id and exactly one row
left -- the pairing follows by set difference and is recorded as
`cardmarket_expansion_elimination`.

Six gates, all in `cardmarket-elimination.mjs`, each with a test that proves it
refuses. **Two unknown ids against two unknown rows stays unresolved**, even
though the counts match: a pair has two mappings and nothing in the data
chooses between them.

Nothing at this rung reads idProduct order, row order, `dateAdded`, version
order or price.

**A row that is missing is not a row with no picture.** Elimination needs the
page to serve one row per product; a placeholder row is still a row, and still
states a variant. Where the listing simply does not render a product there is
nothing to eliminate against, and the printing fails the count gate instead --
see DLCS below.

> **CORI is not the rule.** All 18 of its placeholders happened to be a single
> un-illustrated Starlight per printing, so all 25 printings closed. That is an
> observation about one recent set, not a pattern to lean on. The algorithm is
> the rule; an expansion where two variants both lack artwork will refuse those
> printings and should.

## 5. Product page, only for what is still ambiguous

One navigation per product, and the only rung that reads a page per product.
It is reserved for printings elimination could not close, because it is the
expensive one and because the rate limit interrupted a 50-product run five
times.

Its identities are recorded as `cardmarket_page` and are **never overwritten**
by rungs 3 or 4. If a later reading disagrees with one, that is a conflict to
report, not a value to replace: the write aborts.

## 6. Manual review

What survives all of the above. `cardmarket_unresolved_printing` lists it.

## What the advertised card count is, and is not

`cardmarket_expansion_route.advertised_card_count` is the number the expansion
index prints beside a set. It is a **diagnostic**, never a write gate.

It is worth watching because it usually agrees with us, and a sudden divergence
means something changed. It is not worth obeying, because we do not know what
it counts. One measurement, across all 1,169 routed expansions:

    advertised == locally priced products     1169 / 1169
    advertised == local products              1168 / 1169

Suggestive, and not enough. Every expansion but one holds the same number of
priced products as products, so the two hypotheses are only distinguishable in
a single case -- RA05, whose 13 unpriced products are the only ones in the
whole catalogue. One disagreeing row cannot settle what a number means, so the
architecture does not assume it.

**Printing-level completeness is the authoritative gate.** An expansion-wide
count mismatch does not block a printing that is itself positively proven
complete: page rows equal to that printing's products, every id one of ours,
none repeated, each row stating a distinct variant. That is a property of the
printing and does not become less true because a number elsewhere on the site
disagrees.

The converse also holds and matters more. An expansion whose counts agree
perfectly proves nothing about any individual printing inside it, and a
printing that cannot show its own completeness is refused however tidy the
expansion looks.

## Writing

Per printing, never per expansion. Completeness is a property of a printing, so
a settled one is written even while an ambiguous one beside it is not -- an
expansion-wide gate would let a single un-illustrated card withhold correct
identities for every printing around it.

A printing is written whole or not at all. Half of one is worse than none: the
price ladder treats a printing carrying rarities as authoritative, so a
partially enriched group would let it answer confidently from an incomplete
set.

## Which evidence wins

Four mechanisms can state an identity, and they are not equally good:

| | source | what it means |
|---|---|---|
| 1 | `manual` | a person decided |
| 2 | `cardmarket_page` | the product's own page stated it |
| 3 | `cardmarket_expansion_page` | a listing row stated it |
| 4 | `cardmarket_expansion_elimination` | nothing else it could have been |

Ordered by how directly Cardmarket said the thing. Elimination is last not
because it is unreliable -- it is deterministic -- but because it is
*conditional*: it holds only if the printing was complete when read, so a
product added later invalidates it while a directly-read row still stands.

**A weaker source never overwrites a stronger one.** If it agrees, the stronger
provenance is kept and the run log records the agreement. If it disagrees, the
write is refused: two mechanisms contradicting each other is a fact to look at,
not a race to settle.

Enforced by a trigger, not by convention, because the convention had already
failed. The daily import upserts `rarity` and `rarity_source` for all 86,507
products, resolving to null for ambiguous printings -- so the next import would
have erased every rarity the enrichment established, silently, with the ladder
falling quietly back to bands. A rule kept in the scripts protects only the
scripts that remember it.

Correcting provenance that was recorded wrong is not a downgrade, and the
trigger cannot tell them apart from values alone, so a correction says so:

```sql
SET LOCAL cardmarket.allow_provenance_correction = 'on';
```

## The one rarity source that is an inference

`rarity_source` is `cardmarket_page` where a rarity was read off Cardmarket,
and `unique` where it was not. `unique` means the import found exactly one
rarity listed for that card in that set on YGOPRODeck and applied it to *every
product of the printing* -- which `cardmarket-rarity.mjs` states plainly is "a
statement about the card, not about any individual product".

That inference is right far more often than not: all 76 of DL17's `unique`
rarities matched Cardmarket exactly. But it can be **positively wrong**, not
merely incomplete. MVP1's Obelisk the Tormentor holds three products, all
stored Ultra Rare; the product pages say Gold Secret Rare, Gold Rare and Ultra
Rare. YGOPRODeck knew about one of the three printings, and the rule spread its
rarity over the other two.

It fails only where a printing holds several products, since a single-product
printing has one rarity by construction. **5,187 products sit in that
configuration with an unchecked `unique` rarity.** Enrichment overwrites them
with what Cardmarket says, so every expansion swept is 5,187 smaller; until
then, treat `unique` on a multi-product printing as a guess the ladder is
currently repeating with confidence.

## Expansions that do not behave

`cardmarket_expansion_route.enrichment_status` is `normal`, `listing_anomaly`,
or `manual_review`. Anything but `normal` is excluded from automatic
enrichment, and a single printing inside it may still be written when
positively proven complete.

The flag lives on the expansion rather than in the extractor on purpose. RA05
renders far fewer listing rows than it holds products and its search filter
under-returns unpredictably; a special case in the parser would encode today's
symptom of a mechanism nobody has explained, while a flag says only "this one
does not behave" and leaves the parser honest.

Two are flagged, and they fail differently:

**RA05 (6424)** renders "Page 1 of 10" for 725 products, and its in-expansion
search filter under-returns unpredictably -- 1 row for a card holding 7
products, but a correct 7 for another. Mechanism not understood.

**DLCS (3234)** is irregular in a perfectly regular way. Its listing serves 240
of 269 products and omits **exactly one product from every one of its 29
multi-product printings**: 28 show 4 rows for 5, one shows 8 for 9. 240 is 8
full pages of 30 and `?site=9` answers "Page 9 of 8" with no rows, so the
listing ends there rather than being cut short mid-page. Every omitted product
carries a live price in the daily file, so none of them is delisted or merged.

DLCS is the case that shows what the listing rung cannot do. A full sweep of
all 8 pages resolves **nothing at all**: each printing's fifth id is known by
difference, but no row states its version, so there is no identity to write.
Its sole-product printings are unaffected and need no identity.

## Run log

`cardmarket_enrichment_run` records what each run did: rows read, identities by
mechanism, what it left to a stronger source, conflicts, product-page
fallbacks, and whether it swept the expansion or targeted one printing.
Identities say what we concluded; this says how, which is the part that goes
stale. `cardmarket_enrichment_metrics` aggregates it, keeping full-sweep and
targeted figures in separate columns so neither flatters the other.

## What has been swept

Priority 1 (every printing touching a user-visible `Card` row) is complete: 22
groups across MZMU, CORI, BLZD, RA04 and RA05.

Priority 2 ran as an 8-expansion pilot, chosen for a spread of era and group
shape rather than for size -- 2007 sets beside a 2025 one, 2-product printings
beside a 9-product one.

| | rows / products | printings | direct | elimination | refused |
|---|---|---|---|---|---|
| 25LP 6212 | 82 / 82 | 21/21 | 62 | 20 | 0 |
| GLAS 1021 | 113 / 113 | 16/16 | 32 | 0 | 0 |
| STON 1022 | 97 / 97 | 26/26 | 52 | 0 | 0 |
| DL17 1480 | 80 / 80 | 19/20 | 75 | 1 | 1 |
| MVP1 1711 | 187 / 187 | 60/60 | 187 | 0 | 0 |
| LDS2 3535 | 221 / 221 | 30/30 | 120 | 0 | 0 |
| LODT 1057 | 225 / 225 | 99/100 | 221 | 0 | 1 |
| DLCS 3234 | **240 / 269** | 0/29 | 0 | 0 | 29 |

770 identities from 46 listing navigations and 2 product-page navigations. No
conflict was left standing.

Two printings refused for reasons worth keeping:

- **DL17, Summon Limit** -- two unnamed products against two unnamed rows. The
  counts match and the mapping does not follow.
- **LODT, Arcana Force XIV - Temperance** -- both products picture themselves,
  but one row's alt is the bare card name while the other states V.2. Calling
  the bare one V.1 would be an assumption.

The rest of the refusals are all DLCS, above.

The pattern that makes elimination necessary is a recent one: 25LP accounts for
20 of the pilot's 21 eliminated identities, and GLAS, STON, MVP1 and LDS2
served no placeholder rows at all. Elimination is not becoming less reliable as
coverage grows -- it is becoming less *needed*, which is a different thing and
should not be read as the rung earning its retirement.
