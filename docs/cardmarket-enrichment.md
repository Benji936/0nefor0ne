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
