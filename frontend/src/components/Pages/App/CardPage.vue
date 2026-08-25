<template>
  <!--
    One card, and whether it can be traded here.

    The page used to end with that second question. Below the art, the effect,
    seventeen searchers, nine artworks and fifty-nine printings sat the only
    section that answers what the site is for — and it answered it for nobody:
    find_traders_with_card raises `must be authenticated`, so every visitor
    arriving from a search engine got an empty box, and the "looking for this
    card" half of it could never render at all (see lib/cardMarket.js).

    So the trade fact moves up next to the card and becomes the page's one
    bold element: this card's two piles, drawn on the same seam the matches
    list and the trader page draw, with the two actions sitting on the side
    each one joins. Adding to your trade pile is joining the left column.
  -->
  <div class="cx">
    <button type="button" class="cx__back" @click="goBack">
      <v-icon icon="mdi-arrow-left" size="15" aria-hidden="true" />
      {{ $t('cardPage.backToSearch') }}
    </button>

    <!-- Loading: the shape of the page, so the art does not jump into place. -->
    <div v-if="loading" class="cx__top" aria-hidden="true">
      <div class="cx__object">
        <div class="cx__art cx__sk" />
      </div>
      <div class="cx__body">
        <div class="cx__sk cx__sk--title" />
        <div class="cx__sk cx__sk--line" />
        <div class="cx__sk cx__sk--plate" />
        <div class="cx__sk cx__sk--block" />
      </div>
    </div>

    <div v-else-if="error" class="cx__error">
      <v-icon icon="mdi-card-off-outline" size="40" aria-hidden="true" />
      <p class="cx__error-title">{{ $t('cardPage.cardNotFound') }}</p>
      <p class="cx__error-body">{{ error }}</p>
      <router-link class="cx__error-cta" :to="`/${$route.params.locale || 'en'}/cards`">
        {{ $t('cardPage.searchOther') }}
      </router-link>
    </div>

    <template v-else-if="card">
      <div class="cx__top">
        <!-- ── The object itself ────────────────────────────────────────── -->
        <div class="cx__object">
          <img
            :src="cardImageUrl"
            :alt="card.name"
            class="cx__art"
            width="590"
            height="860"
            fetchpriority="high"
          />

          <!-- The card's other faces. These used to be a section of their own
               at the foot of the page, three screens from the image they swap.
               A reprint is not a topic; it is another face of the object above. -->
          <div
            v-if="altImages.length > 1"
            class="cx__faces"
            role="group"
            :aria-label="$t('cardPage.alternateArtworks')"
          >
            <button
              v-for="(img, i) in altImages"
              :key="img.id"
              type="button"
              class="cx__face"
              :class="{ 'is-on': (selectedImageId ?? card.id) === img.id }"
              :aria-pressed="(selectedImageId ?? card.id) === img.id"
              :aria-label="$t('cardPage.artworkNumber', { n: i + 1 })"
              @click="selectedImageId = img.id"
            >
              <img :src="cardImage(img.id)" alt="" loading="lazy" decoding="async" />
            </button>
          </div>

        </div>

        <!-- ── What it is, then whether you can get it ───────────────────── -->
        <div class="cx__body">
          <h1 class="cx__name">{{ card.name }}</h1>

          <p class="cx__kind">
            <CardKindIcons :card="card" :size="19" />
            <span v-if="card.type" class="cx__kind-t">{{ card.type }}</span>
            <span v-if="card.race && !cardIsSpellTrap" class="cx__kind-t">{{ card.race }}</span>
            <!-- The only internal link into /archetype/:slug, and so the only
                 path a crawler has to those pages. It reads as part of the
                 card's identity, which is what it is, rather than as the third
                 button in a toolbar. -->
            <router-link
              v-if="archetypeSlug"
              class="cx__arch"
              :to="`/${$route.params.locale || 'en'}/archetype/${archetypeSlug}`"
            >{{ card.archetype }}</router-link>
          </p>

          <!-- Whether you are allowed to play it: the one fact that outranks
               everything else on the page, and only ever shown when restricted. -->
          <div v-if="hasBanlist" class="cx__ban">
            <span class="cx__label cx__label--inline">{{ $t('banlist.label') }}</span>
            <CardBanlistBadge :card="card" format="tcg" variant="chip" show-format />
            <CardBanlistBadge :card="card" format="ocg" variant="chip" show-format />
          </div>

          <!-- ATK and DEF are printed in a fixed slot on the cardboard and are
               the two numbers players compare. They were a run of middots in
               the same muted grey as everything around them. -->
          <dl v-if="statPlate.length" class="cx__stats">
            <div v-for="stat in statPlate" :key="stat.key" class="cx__stat">
              <dt class="cx__stat-k">{{ stat.label }}</dt>
              <dd class="cx__stat-v tabular-nums">{{ stat.value }}</dd>
            </div>
          </dl>

          <div class="cx__effect">
            <CardEffectBreakdown v-if="showEffectBreakdown && hasEffectBreakdown" :card-id="card.id" :original-text="card.desc" />
            <p v-else class="cx__desc">{{ card.desc }}</p>
          </div>

          <!-- ── The market for this one card ───────────────────────────── -->
          <section class="cx__market" :data-kind="marketKind" aria-labelledby="cx-market-h">
            <h2 id="cx-market-h" class="cx__label">{{ $t('cardPage.marketTitle') }}</h2>

            <div class="cx__axis">
              <div class="cx__side" data-side="have">
                <p class="cx__side-label">{{ $t('cardPage.inTradePiles') }}</p>
                <p v-if="market" class="cx__side-n tabular-nums" :class="{ 'is-zero': !market.holders }">{{ market.holders }}</p>
                <p v-else-if="loadingMarket" class="cx__side-sk" aria-hidden="true" />

                <!-- Who, when we are allowed to know. The holders are named
                     because their pile is already public on their own page;
                     a wishlist stays a count, so wanting something in private
                     stays private. -->
                <ul v-if="tradersHave.length" class="cx__whos">
                  <li v-for="trader in tradersHave" :key="trader.id">
                    <router-link
                      class="cx__who"
                      :to="{ name: 'trader', params: { locale: $route.params.locale || 'en', id: trader.id } }"
                    >
                      <span class="cx__who-av">
                        <img v-if="trader.avatarUrl" :src="trader.avatarUrl" alt="" loading="lazy" />
                        <span v-else>{{ (trader.name ?? '?')[0].toUpperCase() }}</span>
                      </span>
                      <span class="cx__who-name">{{ trader.name ?? $t('common.anonymous') }}</span>
                    </router-link>
                  </li>
                </ul>
                <p v-else-if="market && !market.holders" class="cx__side-none">
                  {{ $t('cardPage.noneOffering') }}
                </p>

                <button type="button" class="cx__join cx__join--have" @click="openTrade">
                  <v-icon icon="mdi-plus" size="16" aria-hidden="true" />
                  {{ $t('cardPage.addToTrade') }}
                </button>
              </div>

              <div class="cx__seam" :class="{ 'is-both': marketKind === 'both' }">
                <span class="cx__seam-arm" :class="{ 'is-live': market && market.holders > 0 }" />
                <span class="cx__seam-glyph" :title="seamTitle">
                  <v-icon :icon="marketKind === 'both' ? 'mdi-swap-horizontal' : 'mdi-minus'" size="16" aria-hidden="true" />
                  <span class="cx__sr">{{ seamTitle }}</span>
                </span>
                <span class="cx__seam-arm" :class="{ 'is-live': market && market.wanters > 0 }" />
              </div>

              <div class="cx__side" data-side="want">
                <p class="cx__side-label">{{ $t('cardPage.onWishlists') }}</p>
                <p v-if="market" class="cx__side-n tabular-nums" :class="{ 'is-zero': !market.wanters }">{{ market.wanters }}</p>
                <p v-else-if="loadingMarket" class="cx__side-sk" aria-hidden="true" />

                <p v-if="market && !market.wanters" class="cx__side-none">
                  {{ $t('cardPage.noneHunting') }}
                </p>

                <button type="button" class="cx__join cx__join--want" @click="openWish">
                  <v-icon icon="mdi-plus" size="16" aria-hidden="true" />
                  {{ $t('cardPage.addToWishlist') }}
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- What it goes for elsewhere. This was a 2×2 grid of full-colour shop
             logos — the loudest thing on a page about an illustration, with the
             actual figure set at 11px inside it. The number is the useful part,
             so the number is what it shows.
             Its own grid item, placed under the artwork by the grid rather
             than nested inside it: a phone has to stack the columns, and in
             source order the shops would land between the card's picture and
             its own name. Last in the DOM, so the reading order a screen reader
             and the tab key follow is the one a phone shows. -->
        <div class="cx__refs">
          <div v-if="priceRefs.length" class="cx__prices">
            <a
              v-for="ref in priceRefs"
              :key="ref.label"
              class="cx__price"
              :href="ref.url"
              target="_blank"
              rel="noopener noreferrer"
              :title="ref.label"
              :aria-label="ref.aria"
            >
              <img
                class="cx__price-mark"
                :src="ref.mark"
                alt=""
                loading="lazy"
                :style="ref.filter ? { filter: ref.filter } : null"
              />
              <span v-if="ref.figure" class="cx__price-n">{{ ref.figure }}</span>
            </a>
          </div>

          <a
            v-if="yugipediaTipsUrl"
            class="cx__tips"
            :href="yugipediaTipsUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <v-icon icon="mdi-book-open-variant" size="14" aria-hidden="true" />
            {{ $t('cardPage.yugipediaTips') }}
          </a>
        </div>
      </div>

      <!-- ── What fetches it ──────────────────────────────────────────────
           A deckbuilding fact, and the densest one on the page: the median
           card here has seventeen of these. -->
      <section v-if="loadingSearchers || searcherCards.length" class="cx__section">
        <h2 class="cx__label">
          {{ $t('cardPage.searchedBy') }}
          <span v-if="searcherCards.length" class="cx__n tabular-nums">{{ searcherCards.length }}</span>
        </h2>

        <div v-if="loadingSearchers" class="cx__reel" aria-hidden="true">
          <div v-for="i in 8" :key="i" class="cx__reel-sk cx__sk" />
        </div>
        <div v-else class="cx__reel">
          <router-link
            v-for="c in searcherCards"
            :key="c.id"
            class="cx__fetch"
            :to="`/${$route.params.locale || 'en'}/card/${c.id}`"
          >
            <img :src="cardImage(c.id)" :alt="c.name" loading="lazy" decoding="async" />
            <span class="cx__fetch-name">{{ c.name }}</span>
          </router-link>
        </div>
      </section>

      <!-- ── Every printing, newest first ────────────────────────────────
           The list was already sorted by release date and never showed one,
           so the order looked arbitrary. Set codes stay monospace: they are
           the collector's serial number (DESIGN.md, The Mono Identifier Rule). -->
      <section v-if="card.card_sets?.length" class="cx__section">
        <h2 class="cx__label">
          {{ $t('cardPage.printings') }}
          <span class="cx__n tabular-nums">{{ card.card_sets.length }}</span>
        </h2>

        <div class="cx__ledger" :class="{ 'is-clipped': printingsClipped }">
          <div v-for="s in sortedPrintings" :key="s.set_code + '|' + s.set_rarity" class="cx__print">
            <span class="cx__print-code">{{ s.set_code }}</span>
            <router-link class="cx__print-set" :to="'/en/set/' + encodeURIComponent(s.set_name)">{{ s.set_name }}</router-link>
            <span class="cx__print-year tabular-nums">{{ releaseYear(s.set_name) }}</span>
            <span class="cx__print-rarity">{{ s.set_rarity }}</span>
            <CardPrice
              v-if="printingPrice(s)"
              class="cx__print-price"
              :price="printingPrice(s)"
            />
            <span v-else-if="loadingPrintingPrices" class="cx__print-price-sk" aria-hidden="true" />
            <a
              class="cx__print-buy"
              :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="$t('cardPage.findPrinting', { code: s.set_code })"
            >
              <v-icon icon="mdi-open-in-new" size="13" aria-hidden="true" />
            </a>
          </div>
        </div>

        <button
          v-if="card.card_sets.length > 5"
          type="button"
          class="cx__more"
          @click="printingsExpanded = !printingsExpanded"
        >
          {{ printingsExpanded ? $t('cardPage.showLess') : $t('cardPage.showAllPrintings', { count: card.card_sets.length }) }}
        </button>
      </section>
    </template>

    <!-- Headless AddCard dialogs -->
    <AddCard ref="tradeAdd" mode="trade" :headless="true" />
    <AddCard ref="wishAdd"  mode="wish"  :headless="true" />
  </div>
</template>

<script>
import { ref, computed, onServerPrefetch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import AddCard           from "@/components/library/AddCard.vue";
import CardKindIcons      from "@/components/ui/card/CardKindIcons.vue";
import CardBanlistBadge   from "@/components/ui/card/CardBanlistBadge.vue";
import CardEffectBreakdown from "@/components/ui/card/CardEffectBreakdown.vue";
import CardPrice           from "@/components/trade/CardPrice.vue";
import { ARCHETYPES } from "@/data/archetype-slugs.js";
import { parseCardText }  from "@/lib/psctParser";
import { cardImage }      from "@/lib/cardImage";
import { isSpellTrap, levelIconFor } from "@/lib/cardIcons";
import { hasAnyBanlist, ensureBanlistManifest } from "@/lib/banlist";
import { searchById, searchByArchetype, getCardsByIds, getCardArtworks, getSetReleaseDates } from "@/api";
import { fetchTradersWithCard } from "@/lib/matches";
import { fetchCardMarket } from "@/lib/cardMarket";
import { fetchPrintingPrices, printingRarity, rarityKey } from "@/lib/printings";
import { getCurrentSession } from "@/lib/supabaseClient";
import { ldScript }   from "@/lib/jsonLd";

/** How a ledger row finds its price: the print code alone does not identify one,
 *  because a set that printed the card at two rarities uses one code for both. */
const priceKey = (printCode, rarity) => `${printCode}|${rarityKey(rarity) ?? ""}`;

// Reverse of ARCHETYPE_BY_SLUG: the API gives a card's archetype by name, and
// the link needs its slug. Built once per module load, not per card.
const ARCHETYPE_SLUG_BY_NAME = new Map(ARCHETYPES.map(a => [a.name, a.slug]));

// Lazily-loaded Yugipedia "Card Tips" availability manifest: { [cardId]: url }.
// Generated by scripts/yugipedia-tips.mjs and served as a static file; fetched
// ONCE on the client (module-level cache, browser-cached) — never a per-view
// request to Yugipedia, and absent from SSR so it can't break prerender.
const yugipediaTips = ref({});
let yugipediaTipsLoaded = false;
async function ensureYugipediaTips() {
  if (yugipediaTipsLoaded || typeof window === "undefined") return;
  yugipediaTipsLoaded = true;
  try {
    const res = await fetch("/yugipedia-tips.json");
    if (res.ok) yugipediaTips.value = await res.json();
  } catch {
    // Non-critical enhancement — silently skip if the manifest is unavailable.
  }
}

// Lazily-loaded Yugipedia "can be searched by" manifest: { [cardId]: [searcherId, …] }.
// Same static-file / fetch-once-per-session pattern as the tips manifest, but
// awaitable so the related-cards loader can read it deterministically. Absent
// from SSR (client-only) so it can't affect prerender.
let searchersData = null;
let searchersPromise = null;
function ensureYugipediaSearchers() {
  if (typeof window === "undefined") return Promise.resolve({});
  if (searchersData) return Promise.resolve(searchersData);
  if (!searchersPromise) {
    searchersPromise = fetch("/yugipedia-searchers.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => { searchersData = j; return j; })
      .catch(() => ({})); // non-critical enhancement
  }
  return searchersPromise;
}

export default {
  components: { AddCard, CardKindIcons, CardBanlistBadge, CardEffectBreakdown, CardPrice },

  props: {
    // Passed by App.vue RouterView slot — needed for AddCard auth check
    login: { type: Object, default: null },
  },

  emits: ["requireAuth"],

  setup() {
    const route = useRoute();

    // Reactive card state shared between SSR prefetch and client load.
    // card and loading are declared here so onServerPrefetch can set them
    // before renderToString serializes the HTML (created() runs too early).
    const ssrCard = ref(null);
    const card    = ref(null);
    const loading = ref(true);

    // Build-time prefetch: vite-ssg awaits this before snapshotting HTML.
    onServerPrefetch(async () => {
      const cardId = route.params.id;
      const loc = route.params.locale || "en";
      try {
        const res = await searchById(cardId, loc);
        const data = res?.data?.data?.[0] ?? res?.data?.[0] ?? null;
        if (data) {
          ssrCard.value = data;
          card.value    = data;
          loading.value = false;
        } else {
          console.warn(`[vite-ssg] Skipping card ${cardId} — API returned null`);
          throw new Error(`No data for card ${cardId}`);
        }
      } catch (err) {
        console.error(`[vite-ssg] Skipping card ${cardId} — API error:`, err?.message ?? err);
        // Does NOT skip the route, despite what this comment used to claim:
        // vite-ssg writes the page anyway, in its loading state. The throw is a
        // log line, not a guard. verify-ssg-output.mjs scans every prerendered
        // page for exactly that outcome.
        throw err;
      }
    });

    // SEO via useHead — reactive to ssrCard (set by SSR prefetch and client load()).
    useHead(computed(() => {
      const card = ssrCard.value;
      if (!card) {
        const fallbackId = route.params?.id;
        const fallbackImage = cardImage(fallbackId) || 'https://0nefor.one/logo.png';
        const fallbackUrl = `https://0nefor.one${route.path || '/en/card/unknown'}`;
        const fallbackTitle = "Yu-Gi-Oh! Card — One for One";
        const fallbackDesc = "Trade Yu-Gi-Oh! cards on One for One — the free card trading platform.";
        return {
          title: fallbackTitle,
          meta: [
            { name: "description", content: fallbackDesc },
            { property: "og:title", content: fallbackTitle },
            { property: "og:description", content: fallbackDesc },
            { property: "og:image", content: fallbackImage },
            { property: "og:url", content: fallbackUrl },
            { name: "twitter:card", content: "summary_large_image" },
            { name: "twitter:title", content: fallbackTitle },
            { name: "twitter:description", content: fallbackDesc },
            { name: "twitter:image", content: fallbackImage },
          ],
          link: [
            { rel: "canonical", href: fallbackUrl },
          ],
        };
      }

      const BASE = "https://0nefor.one";
      const loc = route.params?.locale || "en";
      const path = route.path || `/en/card/${card.id}`;
      const image = cardImage(card.id);
      const title = `${card.name} — Yu-Gi-Oh! | One for One`;
      const raw = card.desc ?? "";

      // Build a stats prefix line for monsters and typed spell/trap cards
      const statParts = [];
      if (card.type)             statParts.push(card.type);
      if (card.attribute)        statParts.push(card.attribute);
      if (card.level != null)    statParts.push(`Lv.${card.level}`);
      else if (card.linkval != null) statParts.push(`Link ${card.linkval}`);
      if (card.atk != null)      statParts.push(`ATK ${card.atk}${card.def != null ? `/DEF ${card.def}` : ""}`);
      const statsLine = statParts.join(" · ");

      const effectText = raw.length > 0
        ? raw
        : `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`;
      const candidate = statsLine ? `${statsLine} — ${effectText}` : effectText;
      const desc = candidate.length > 155 ? candidate.slice(0, 155) + "…" : candidate;

      const canonical = `${BASE}${path}`;
      const enPath = path.replace(new RegExp(`^/${loc}(/|$)`), "/en$1");

      // Card stats as schema.org additionalProperty for structured data richness
      const additionalProperty = [];
      if (card.type)          additionalProperty.push({ "@type": "PropertyValue", name: "Card Type",  value: card.type });
      if (card.attribute)     additionalProperty.push({ "@type": "PropertyValue", name: "Attribute",  value: card.attribute });
      if (card.race)          additionalProperty.push({ "@type": "PropertyValue", name: "Type",       value: card.race });
      if (card.level != null) additionalProperty.push({ "@type": "PropertyValue", name: "Level",      value: card.level });
      if (card.atk != null)   additionalProperty.push({ "@type": "PropertyValue", name: "ATK",        value: card.atk });
      if (card.def != null)   additionalProperty.push({ "@type": "PropertyValue", name: "DEF",        value: card.def });

      const schema = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: card.name,
        description: card.desc ?? "",
        image,
        category: "Trading Card",
        brand: { "@type": "Brand", name: "Yu-Gi-Oh!" },
        ...(additionalProperty.length ? { additionalProperty } : {}),
        ...(card.card_sets?.length ? {
          offers: card.card_sets.map(s => ({
            "@type": "Offer",
            sku: s.set_code,
            name: s.set_rarity,
            url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`,
            seller: { "@type": "Organization", name: "One for One" },
          })),
        } : {}),
      };

      const breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home",        item: `${BASE}/en/` },
          { "@type": "ListItem", position: 2, name: "Card Search", item: `${BASE}/en/` },
          { "@type": "ListItem", position: 3, name: card.name,     item: canonical },
        ],
      };

      return {
        title,
        meta: [
          { name: "description", content: desc },
          { property: "og:type",        content: "product" },
          { property: "og:title",       content: title },
          { property: "og:description", content: desc },
          { property: "og:image",       content: image },
          { property: "og:url",         content: canonical },
          { name: "twitter:card",        content: "summary_large_image" },
          { name: "twitter:title",       content: title },
          { name: "twitter:description", content: desc },
          { name: "twitter:image",       content: image },
        ],
        link: [
          { rel: "canonical", href: canonical },
          { rel: "alternate", hreflang: "en",        href: `${BASE}${enPath}` },
          { rel: "alternate", hreflang: "x-default", href: `${BASE}${enPath}` },
        ],
        script: [
          ldScript(schema),
          ldScript(breadcrumb),
        ],
      };
    }));

    // Client-only: load the Card Tips + searcher + banlist manifests (guarded so SSR skips them).
    ensureYugipediaTips();
    ensureYugipediaSearchers();
    ensureBanlistManifest();

    // `cardImage` is imported at module scope, so the template (which calls
    // cardImage(c.id) directly in the archetype / matching-cards v-for loops)
    // cannot see it unless it is returned here. Without this, every related-card
    // thumbnail render throws "cardImage is not a function", leaving null vnodes
    // in the v-for children array — which crashes unmountChildren on the next
    // navigation and wedges the router. Expose it explicitly.
    return { ssrCard, card, loading, yugipediaTips, cardImage };
  },

  data() {
    // card and loading are intentionally omitted here — they are declared as
    // refs in setup() so that onServerPrefetch can set them before renderToString
    // serializes the HTML. setup() properties take precedence over data().
    return {
      error:            null,
      traders:          [],
      loadingTraders:   false,
      archetypeCards:   [],
      loadingArchetype: false,
      searcherCards:    [],
      loadingSearchers: false,
      printingsExpanded:  false,
      // The PSCT effect breakdown is finished but not trusted on every card yet,
      // so it is switched off in favour of the plain card text. Flip to true to
      // bring it back once the parser has been improved.
      showEffectBreakdown: false,
      market:             null, // { holders, wanters, kind } — null until loaded, or if the read failed
      // Starts true so the count's place is held from the first frame. Left
      // false, the side rendered label-then-button, then grew a skeleton, then
      // grew a number — two reflows to say one thing. If the read fails this
      // goes false with market still null, and the side simply makes no claim.
      loadingMarket:      true,
      viewerId:           null, // so the market does not count you as someone you could trade with
      selectedImageId:    null, // which printing art the hero image shows (null → main id)
      artworks:           [],   // all printing artworks (fetched by name; id query returns only one)
      setDates:           {},   // set_name → release date, for sorting printings by recency
      // print code → the price band Cardmarket holds for that printing, from
      // fetchPrintingPrices. Client-only: this page is prerendered, and a build
      // that read the price table would bake yesterday's figures into the HTML.
      printingPrices:     {},
      loadingPrintingPrices: false,
    };
  },

  computed: {
    cardId()     { return this.$route.params.id; },
    // null when the card has no archetype, or when its archetype is not in
    // archetype-slugs.js — the API knows archetypes that archetype-art.json does
    // not, and a link to a page we never built would be a 404 shaped like a
    // feature. ARCHETYPE_SLUG_BY_NAME is built once at module scope.
    archetypeSlug() {
      return this.card?.archetype ? ARCHETYPE_SLUG_BY_NAME.get(this.card.archetype) ?? null : null;
    },
    // Tracks the active Vuetify theme so the market logos can swap to their
    // light/white treatment on the dark theme (and back on the light one).
    isDarkTheme() { return this.$vuetify?.theme?.global?.name !== 'neonDuskLight'; },
    cardImageUrl() { return cardImage(this.selectedImageId ?? this.card?.id); },
    // All printing artworks for this card (each has its own passcode id, already
    // synced to R2). Populated lazily by loadArtworks(); length<=1 → no alternates.
    altImages() { return this.artworks; },
    // Spell/Trap cards expose their property (Quick-Play, Counter, …) in `race`,
    // which CardKindIcons renders as an icon — so the raw race text is hidden for them.
    cardIsSpellTrap() { return isSpellTrap(this.card); },
    // Restricted in TCG and/or OCG (Yugipedia manifest first, then YGOPRODeck).
    hasBanlist() { return hasAnyBanlist(this.card); },
    // Level (or Rank, for Xyz) icon + value, shown in place of the "Level" text.
    levelIcon() { return levelIconFor(this.card); },
    // True when the PSCT parser can segment this card's text — i.e. the
    // CardEffectBreakdown component will render. When false (vanilla flavor text,
    // unparseable spells/traps) we fall back to the plain effect paragraph so the
    // text is never hidden entirely.
    hasEffectBreakdown() {
      const desc = this.card?.desc;
      if (!desc) return false;
      // Normal (vanilla) monsters carry flavor lore, not an effect — the parser
      // would mislabel it as an "EFFECT" segment, so keep their plain text.
      if (/Normal\b.*Monster/.test(this.card?.type ?? "")) return false;
      return parseCardText(desc).effects.length > 0;
    },
    // Everyone find_traders_with_card returns is a holder — it selects wish=false
    // rows, so they_have_count is at least 1 on every row and `kind` is never
    // 'they_want'. The page used to filter for that value and render a "looking
    // for this card" section that could not, by construction, ever fill.
    tradersHave() {
      return this.traders;
    },
    // 'none' until the counts land, so the seam is dashed rather than claiming
    // an empty market it has not read yet.
    marketKind() { return this.market?.kind ?? 'none'; },
    seamTitle() {
      if (!this.market) return this.$t('cardPage.marketTitle');
      return this.$t(`cardPage.marketState.${this.market.kind}`);
    },
    // Level, Rank or Link, then the two numbers players compare. Spells and
    // traps have none of these, so the plate does not render for them.
    statPlate() {
      const card = this.card;
      if (!card) return [];
      const plate = [];
      const level = this.levelIcon;
      if (level) plate.push({ key: 'level', label: level.label, value: level.value });
      else if (card.linkval != null) plate.push({ key: 'link', label: 'Link', value: card.linkval });
      if (card.atk != null) plate.push({ key: 'atk', label: 'ATK', value: card.atk });
      if (card.def != null) plate.push({ key: 'def', label: 'DEF', value: card.def });
      return plate;
    },
    // Collapsed only when there is enough to be worth collapsing, which is the
    // same test the toggle below the list uses.
    printingsClipped() {
      return (this.card?.card_sets?.length ?? 0) > 5 && !this.printingsExpanded;
    },
    // One row of price references. A shop with no figure for this card still
    // gets its link, labelled with its own short name rather than a dash.
    priceRefs() {
      const prices = this.prices;
      return this.marketLinks.map((link) => {
        const figure = prices?.[link.priceKey] ? `${link.symbol}${prices[link.priceKey]}` : null;
        return {
          label: link.label,
          url: link.url,
          mark: this.isDarkTheme && link.logoDark ? link.logoDark : link.logo,
          filter: (this.isDarkTheme ? link.filterDark : link.filterLight) || null,
          figure,
          aria: figure ? `${link.label} ${figure}` : link.label,
        };
      });
    },
    // Printings sorted newest-first by set release date. card_sets carries no date,
    // so we look it up in setDates (loaded lazily). Sets with an unknown date sink to
    // the bottom; equal dates keep their original order (Array.sort is stable).
    sortedPrintings() {
      const sets = this.card?.card_sets ?? [];
      const dates = this.setDates;
      return [...sets].sort((a, b) => {
        const da = dates[a.set_name] || "";
        const db = dates[b.set_name] || "";
        if (da === db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return db.localeCompare(da); // ISO dates → descending (newest first)
      });
    },
    marketLinks() {
      const name = encodeURIComponent(this.card?.name ?? "");
      // Logos are theme-aware. `logoDark` swaps to a white asset on the dark theme;
      // `filterLight` recolors a white (monochrome) logo to black on the light theme.
      // TCGplayer keeps its colored icon, so it uses two real assets (no filter).
      // Cardmarket is a single white wordmark: white on dark, filtered black on light.
      return [
        { label: "TCGPlayer",  short: "TCG",  symbol: "$", priceKey: "tcg",  logo: "/logos/tcgplayer.svg",        logoDark: "/logos/tcgplayer-white.png", url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}` },
        { label: "eBay",       short: "eBay", symbol: "$", priceKey: "ebay", logo: "/logos/ebay.png",             url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh` },
        { label: "Cardmarket", short: "CM",   symbol: "\u20ac", priceKey: "cm",   logo: "/logos/cardmarket-white.png", filterLight: "brightness(0)", url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${name}` },
      ];
    },
    // Outbound Yugipedia strategy-tips link — only present when the crawler
    // confirmed a real (non-stub) Card Tips page exists for this card id.
    yugipediaTipsUrl() {
      return (this.card?.id != null && this.yugipediaTips?.[this.card.id]) || null;
    },
    prices() {
      const p = this.card?.card_prices?.[0];
      if (!p) return null;
      const normalize = v => (!v || v === '0.00') ? null : v;
      const tcg  = normalize(p.tcgplayer_price);
      const cm   = normalize(p.cardmarket_price);
      // eBay's figure is an average of recent sold listings rather than a live
      // asking price, so it can sit above the other two on widely-reprinted cards.
      const ebay = normalize(p.ebay_price);
      return (tcg || cm || ebay) ? { tcg, cm, ebay } : null;
    },
  },

  watch: {
    // Re-load when navigating between card pages directly
    cardId() { this.load(); },
  },

  created() {
    // During SSG, card and loading are already set by onServerPrefetch in setup().
    // This hook is kept as a no-op placeholder for clarity.
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.loading           = true;
      this.error             = null;
      this.card              = null;
      this.traders           = [];
      this.archetypeCards    = [];
      this.searcherCards     = [];
      this.loadingArchetype  = false;
      this.loadingSearchers  = false;
      this.printingsExpanded = false;
      this.selectedImageId   = null;
      this.artworks          = [];
      this.market            = null;
      this.loadingMarket     = true;
      this.printingPrices    = {};
      this.loadingPrintingPrices = false;

      try {
        const locale = this.$route.params.locale || 'en';
        const res = await searchById(this.cardId, locale);
        const data = res?.data?.data?.[0] ?? res?.data?.[0] ?? null;
        if (!data) { this.error = "Card not found."; return; }
        this.card = data;
        this.ssrCard = data; // drive useHead() reactively on the client too
        this.loadRelatedCards(); // fire-and-forget
        this.loadArtworks(data); // fire-and-forget: alternate artworks (fetched by name)
        this.loadSetDates();     // fire-and-forget: release dates to sort printings
        this.loadMarket(data);   // fire-and-forget: how many piles and wishlists this card is in
        this.loadPrintingPrices(data); // fire-and-forget: what each printing is worth

        this.loadTraders(data); // fire-and-forget: who the holders are, when we may know
      } catch (err) {
        this.error = err?.message ?? "Failed to load card.";
      } finally {
        this.loading = false;
      }
    },

    /** Fire-and-forget: populate archetypeCards and searcherCards. */
    loadRelatedCards() {
      const card = this.card;
      if (!card) return;
      if (card.archetype) {
        this.loadingArchetype = true;
        searchByArchetype(card.archetype, 20)
          .then(res => {
            const all = res?.data?.data ?? [];
            this.archetypeCards = all.filter(c => c.id !== card.id).slice(0, 12);
          })
          .catch(() => { this.archetypeCards = []; })
          .finally(() => { this.loadingArchetype = false; });
      }
      this.loadSearcherCards(card);
    },

    /** Fire-and-forget: fetch all printing artworks. searchById(id) returns only the
     *  single queried artwork, so we re-query by the English name to get the full set. */
    async loadArtworks(card) {
      const imgs = await getCardArtworks(card.name_en ?? card.name);
      if (this.card?.id !== card.id) return; // user navigated away mid-flight
      this.artworks = imgs;
    },

    /** Fire-and-forget: names for the holders, and only for people who are
     *  signed in — find_traders_with_card raises `must be authenticated`, so
     *  calling it anonymously logged a console error on every card view by the
     *  visitors this page is mostly built for. The counts do not go through it,
     *  so a signed-out visitor still learns whether the card is here, which is
     *  the question they arrived with. */
    async loadTraders(card) {
      if (!(await getCurrentSession())) return;
      this.loadingTraders = true;
      try {
        const traders = await fetchTradersWithCard(card.name_en ?? card.name);
        if (this.card?.id === card.id) this.traders = traders;
      } catch {
        this.traders = [];
      } finally {
        if (this.card?.id === card.id) this.loadingTraders = false;
      }
    },

    /** Fire-and-forget: the two counts the seam draws. Matched on the English
     *  canonical name, the same key find_matches and the trader page join on,
     *  or this page would disagree with the pages it sends people to. */
    async loadMarket(card) {
      this.loadingMarket = true;
      try {
        this.viewerId = (await getCurrentSession())?.user?.id ?? null;
        const market = await fetchCardMarket(card.name_en ?? card.name, this.viewerId);
        if (this.card?.id !== card.id) return; // navigated away mid-flight
        this.market = market;
      } finally {
        if (this.card?.id === card.id) this.loadingMarket = false;
      }
    },

    /** Fire-and-forget: what Cardmarket holds for each of this card's printings.
     *
     *  Keyed by print code and rarity together, which is what identifies a row:
     *  a set that printed the card at two rarities gives both rows the same
     *  code, and BP01-EN036 is Graceful Charity as both Rare (7.47) and
     *  Starfoil Rare (10.11). The key survives the ledger being re-sorted by
     *  release date, which a row index would not.
     *
     *  Runs on the client only -- it is called from load(), which only mounted()
     *  and the route watcher reach, never onServerPrefetch. Prices move daily
     *  and this page is prerendered; baking them into the HTML would ship a
     *  figure that is stale the moment the build finishes. */
    async loadPrintingPrices(card) {
      const sets = card?.card_sets ?? [];
      if (!sets.length) return;
      this.loadingPrintingPrices = true;
      try {
        const priced = await fetchPrintingPrices(card.name_en ?? card.name, sets);
        if (this.card?.id !== card.id) return; // navigated away mid-flight
        this.printingPrices = Object.fromEntries(
          priced.filter((p) => p.price).map((p) => [priceKey(p.printCode, p.rarity), p.price]),
        );
      } catch {
        this.printingPrices = {}; // no price beats a wrong one; the row just omits it
      } finally {
        if (this.card?.id === card.id) this.loadingPrintingPrices = false;
      }
    },

    /** The price for one ledger row, or null when Cardmarket has none.
     *
     *  Where the printing has not been enriched, both rarities of one print code
     *  resolve to the same band -- Cardmarket's files carry no rarity, and
     *  nothing in either catalogue says which product is the Ultra and which the
     *  Secret. That is the honest answer, and it stops being the answer for a
     *  printing somebody has read. */
    printingPrice(s) {
      return this.printingPrices[priceKey(s?.set_code, printingRarity(s?.set_rarity))] ?? null;
    },

    /** The year a printing came out. The list has always been sorted by this
     *  date and has never shown it, so the order read as arbitrary. */
    releaseYear(setName) {
      return (this.setDates?.[setName] ?? "").slice(0, 4);
    },

    /** Back, without leaving the site.
     *
     *  This was `$router.back()` behind an href of "/". On the app's most
     *  crawled page most visitors arrive cold from a search engine, where the
     *  previous history entry is the results page they came from — so "Back to
     *  search" took them off One for One. history.length does not help: it
     *  counts the whole tab, and reads 30-odd on a fresh landing. Vue Router's
     *  own state.back is null until we have navigated inside the app, which is
     *  exactly the question being asked. */
    goBack() {
      const inApp = typeof window !== "undefined" && window.history.state?.back;
      if (inApp) this.$router.back();
      else this.$router.push(`/${this.$route.params.locale || "en"}/cards`);
    },

    /** Fire-and-forget: load the (session-cached) set release dates so printings
     *  can be sorted newest-first. The map is global, so this is cheap to re-call. */
    async loadSetDates() {
      this.setDates = await getSetReleaseDates();
    },

    /** Fire-and-forget: resolve the Yugipedia "can be searched by" ids (from the
     *  static manifest) to full card objects, preserving Yugipedia's ordering. */
    async loadSearcherCards(card) {
      try {
        const map = await ensureYugipediaSearchers();
        const ids = map?.[card.id];
        if (!ids?.length) return;
        // Guard against a race when the user navigated to another card meanwhile.
        if (this.card?.id !== card.id) return;
        this.loadingSearchers = true;
        const byId = await getCardsByIds(ids);
        if (this.card?.id !== card.id) return;
        this.searcherCards = ids.map(i => byId[i]).filter(Boolean).slice(0, 24);
      } catch {
        this.searcherCards = [];
      } finally {
        this.loadingSearchers = false;
      }
    },

    async _requireAuth() {
      const session = await getCurrentSession();
      if (!session) { this.$emit("requireAuth"); return null; }
      return session;
    },
    async openTrade() {
      if (!await this._requireAuth()) return;
      this.$refs.tradeAdd.openWith(this.card, "");
    },
    async openWish() {
      if (!await this._requireAuth()) return;
      this.$refs.wishAdd.openWith(this.card, "");
    },
  },
};
</script>

<style scoped>
/* Borrowed from the landing page, as every app page in this pass has been: the
   panel sits one tonal step under the page, hairlines are a fraction of the
   border token, and depth is a 1px top highlight rather than a drop shadow
   (DESIGN.md, The Flat-By-Default Rule). */
.cx {
  --cx-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --cx-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --cx-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --cx-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

  display: flex;
  flex-direction: column;
  gap: clamp(26px, 3.4vw, 42px);
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 20px 0 64px;
}
@media (max-width: 600px) { .cx { padding: 14px 0 48px; gap: 24px; } }

/* ── The way back ───────────────────────────────────────────────────────── */
.cx__back {
  display: inline-flex; align-items: center; gap: 7px;
  align-self: flex-start;
  min-height: 34px; padding: 0 10px 0 6px;
  background: transparent; border: 0; border-radius: 9px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--c-muted); cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.cx__back:hover { color: var(--c-text); background: var(--c-surface-2); }

/* ── Two columns: the object, and what to do about it ───────────────────── */
.cx__top {
  display: grid;
  grid-template-columns: minmax(0, clamp(220px, 24vw, 300px)) minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  grid-template-areas:
    "object body"
    "refs   body";
  column-gap: clamp(20px, 2.6vw, 40px);
  row-gap: 12px;
  align-items: start;
}
.cx__object { grid-area: object; }
.cx__body   { grid-area: body; }
.cx__refs   { grid-area: refs; }

@media (max-width: 860px) {
  .cx__top {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    grid-template-areas: "object" "body" "refs";
    row-gap: 20px;
  }
  /* Small enough that the card's own name clears the fold on a phone. */
  .cx__object { max-width: 236px; margin-inline: auto; }
  .cx__refs { width: 100%; max-width: 320px; margin-inline: auto; }
}

.cx__object { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cx__refs { display: flex; flex-direction: column; gap: 8px; min-width: 0; }

/* The card, at something like its real presence. It was 200px wide on a page
   with 1150 to spend, which on a page about an illustration is a thumbnail of
   the subject. No drop shadow: the art carries its own frame. */
.cx__art {
  display: block; width: 100%; height: auto;
  aspect-ratio: 59 / 86; object-fit: contain;
  border-radius: 11px;
  background: var(--c-surface-2);
  outline: 1px solid var(--cx-line-soft);
}

.cx__faces { display: flex; flex-wrap: wrap; gap: 6px; }
.cx__face {
  width: 42px; padding: 0; line-height: 0;
  background: none; border: 0; border-radius: 6px; cursor: pointer;
}
.cx__face img {
  width: 100%; aspect-ratio: 59 / 86; object-fit: cover;
  border-radius: 6px;
  outline: 1px solid var(--cx-line-soft);
  transition: outline-color 0.15s ease, transform 0.15s cubic-bezier(0.22,1,0.36,1);
}
.cx__face:hover img { transform: translateY(-2px); outline-color: var(--cx-line); }
/* Which face is showing is a selection, not a trade role, so it is marked in
   the text colour rather than borrowing amethyst or pink from the palette's
   two meanings (DESIGN.md, The Three-Role Rule). */
.cx__face.is-on img {
  outline: 2px solid color-mix(in srgb, var(--c-text) 72%, transparent);
  transform: none;
}

/* What it goes for elsewhere: the figure, with the shop as its mark. */
.cx__prices { display: grid; grid-template-columns: repeat(auto-fit, minmax(88px, 1fr)); gap: 6px; }
.cx__price {
  display: inline-flex; align-items: center; gap: 7px;
  justify-content: center;
  min-height: 34px; padding: 0 9px;
  border-radius: 10px;
  background: var(--cx-panel); border: 1px solid var(--cx-line-soft);
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.cx__price:hover { border-color: var(--cx-line); }
.cx__price-mark { height: 13px; max-width: 46px; object-fit: contain; display: block; flex-shrink: 0; }
.cx__price-n {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.76rem; font-weight: 700; color: var(--c-text);
}

.cx__tips {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 30px;
  font-size: 0.74rem; font-weight: 600; color: var(--c-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}
.cx__tips:hover { color: var(--c-text); text-decoration: underline; text-underline-offset: 3px; }

/* ── What it is ─────────────────────────────────────────────────────────── */
.cx__body { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.cx__name {
  margin: 0;
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: clamp(1.65rem, 3vw, 2.35rem);
  font-weight: 700; line-height: 1.08; letter-spacing: -0.022em;
  color: var(--c-text);
}

.cx__kind {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin: 0; font-size: 0.86rem; color: var(--c-muted);
}
.cx__kind-t ~ .cx__kind-t::before,
.cx__kind-t ~ .cx__arch::before { content: "·"; margin-right: 8px; opacity: 0.65; }
/* The archetype is a fact about the card that happens to be a page, so it is
   underlined rather than dressed as a button in one of the role colours. */
/* Padded rather than sized: vertical padding grows the hit area to the 24px
   minimum without touching the line box it shares with the type it sits in. */
.cx__arch {
  padding: 4px 0;
  font-weight: 600; color: var(--c-text); text-decoration: underline;
  text-underline-offset: 3px; text-decoration-color: var(--cx-line);
  transition: text-decoration-color 0.15s ease;
}
.cx__arch:hover { text-decoration-color: currentColor; }

.cx__ban { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }

/* The card's own stat slot: mono, hairline-divided, sized like the numbers
   matter. Dividers come from the 1px gap over a tinted ground. */
.cx__stats {
  display: flex; flex-wrap: wrap; gap: 1px;
  margin: 0; width: fit-content; max-width: 100%;
  border: 1px solid var(--cx-line-soft); border-radius: 12px;
  background: var(--cx-line-soft); overflow: hidden;
}
.cx__stat {
  display: flex; align-items: baseline; gap: 8px;
  padding: 8px 14px; background: var(--cx-panel);
}
.cx__stat-k {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--c-muted);
}
.cx__stat-v {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.95rem; font-weight: 700; color: var(--c-text);
}

.cx__effect {
  padding: clamp(13px, 1.6vw, 18px);
  border-radius: 14px;
  background: var(--cx-panel); border: 1px solid var(--cx-line-soft);
  box-shadow: var(--cx-lit);
}
/* pre-line, because a Pendulum card's two halves are separated by a line break
   that the old paragraph collapsed into one run of prose. The text was also
   held at 0.85 opacity, which is a contrast cut applied to the only thing on
   the page a player came to read. */
.cx__desc {
  margin: 0; max-width: 76ch;
  font-size: 0.92rem; line-height: 1.65; white-space: pre-line;
  color: var(--c-text);
}

/* ── The market ─────────────────────────────────────────────────────────── */
.cx__market {
  --kind: var(--c-muted);
  display: flex; flex-direction: column; gap: 13px;
  padding: clamp(14px, 1.8vw, 20px);
  border-radius: 18px;
  background: var(--cx-panel); border: 1px solid var(--cx-line-soft);
  box-shadow: var(--cx-lit);
}
.cx__market[data-kind="held"]   { --kind: var(--c-trade); }
.cx__market[data-kind="wanted"] { --kind: var(--c-accent); }
.cx__market[data-kind="both"]   { --kind: var(--c-mutual); }

.cx__axis { display: flex; align-items: stretch; gap: 4px; }

.cx__side {
  display: flex; flex-direction: column; gap: 10px;
  flex: 1; min-width: 0;
  padding: 13px 15px;
  border-radius: 13px; border: 1px solid var(--cx-line-soft);
}
.cx__side[data-side="have"] { background: color-mix(in srgb, var(--c-trade) 6%, transparent); }
.cx__side[data-side="want"] { background: color-mix(in srgb, var(--c-accent) 6%, transparent); }

.cx__side-label {
  display: flex; align-items: center; gap: 7px; margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.cx__side[data-side="have"] .cx__side-label { color: var(--c-trade); }
.cx__side[data-side="want"] .cx__side-label { color: var(--c-accent); }
/* The count is the page's answer, so it is set like an answer. It carries no
   pill: a chip tinted in the same hue as its own text sits on a tint of that
   hue and subtracts contrast from the one number that matters. */
.cx__side-n {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 1.85rem; font-weight: 700; line-height: 1; letter-spacing: -0.02em;
}
.cx__side[data-side="have"] .cx__side-n { color: var(--c-trade); }
.cx__side[data-side="want"] .cx__side-n { color: var(--c-accent); }
/* A nought in the role colour claims a presence that is not there. It steps
   back for the same reason the arm beside it stays dashed. */
.cx__side .cx__side-n.is-zero { color: var(--c-muted); }
.cx__side-sk {
  margin: 0; width: 30px; height: 26px; border-radius: 5px;
  background: color-mix(in srgb, currentColor 26%, transparent);
}

.cx__side-none {
  margin: 0; max-width: 26ch;
  font-size: 0.76rem; line-height: 1.45; color: var(--c-muted);
}

.cx__whos { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.cx__who {
  display: inline-flex; align-items: center; gap: 7px; max-width: 100%;
  padding: 4px 11px 4px 4px;
  border-radius: 999px;
  background: var(--cx-panel); border: 1px solid var(--cx-line-soft);
  text-decoration: none;
  transition: border-color 0.15s ease;
}
.cx__who:hover { border-color: color-mix(in srgb, var(--c-trade) 50%, transparent); }
.cx__who-av {
  display: grid; place-items: center;
  width: 22px; height: 22px; flex-shrink: 0;
  border-radius: 999px; overflow: hidden;
  background: var(--c-surface-2);
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 10px; font-weight: 700; color: var(--c-text);
}
.cx__who-av img { width: 100%; height: 100%; object-fit: cover; }
.cx__who-name {
  font-size: 0.78rem; font-weight: 600; color: var(--c-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* The action sits at the foot of the side it joins, so the two bottoms line up
   however tall the side above them gets.
   Outlined rather than filled: two saturated slabs side by side outshouted both
   the artwork and the counts above them, and neither action is primary over the
   other — which one you want depends on whether you own the card. The colour
   still says which side you would be joining. */
.cx__join {
  margin-top: auto;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 40px; padding: 0 14px;
  border-radius: 11px; background: transparent;
  font-family: inherit; font-size: 0.82rem; font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
/* Hover is a halo outside the button rather than a wash behind the label. A
   tint in the button's own hue lands under its own text, and on the light theme
   the wishlist action fell to 3.95:1 at 9% and was still short of 4.5 at 4% —
   there is no fill small enough to be worth the reading. */
.cx__join--have {
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 48%, transparent);
}
.cx__join--have:hover {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 16%, transparent);
}
.cx__join--want {
  color: var(--c-accent);
  border: 1px solid color-mix(in srgb, var(--c-accent) 48%, transparent);
}
.cx__join--want:hover {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-accent) 16%, transparent);
}

/* The seam, as the matches list and the trader page draw it: an arm goes solid
   only where somebody is actually standing, and the disc fills teal only when
   both sides are live — the one state that is an agreement waiting to happen
   (DESIGN.md, The Agreement Rule). */
.cx__seam {
  display: flex; align-items: center; flex: 0 0 auto;
  width: clamp(44px, 7%, 84px);
  color: var(--kind);
}
.cx__seam-arm { flex: 1; height: 1px; border-top: 1px dashed var(--cx-line); }
.cx__seam-arm.is-live { border-top-style: solid; }
.cx__seam-arm:first-child.is-live { border-top-color: var(--c-trade); }
.cx__seam-arm:last-child.is-live  { border-top-color: var(--c-accent); }
.cx__seam-glyph {
  position: relative;
  display: grid; place-items: center;
  width: 30px; height: 30px; flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--cx-line); background: var(--cx-panel);
}
.cx__seam.is-both .cx__seam-glyph {
  border-color: transparent;
  background: var(--c-mutual); color: var(--c-on-accent);
}

/* ── Sections ───────────────────────────────────────────────────────────── */
.cx__section { display: flex; flex-direction: column; gap: 12px; }

.cx__label {
  display: flex; align-items: center; gap: 9px; margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}
.cx__label--inline { font-size: 0.62rem; letter-spacing: 0.14em; }
.cx__n { letter-spacing: 0; font-size: 0.72rem; color: var(--c-text); }

.cx__reel {
  display: flex; gap: 12px;
  overflow-x: auto; padding-bottom: 6px;
  scrollbar-width: thin; scroll-snap-type: x proximity;
}
.cx__fetch {
  flex: 0 0 auto; width: 84px;
  display: flex; flex-direction: column; gap: 5px;
  text-decoration: none; scroll-snap-align: start;
}
.cx__fetch img {
  width: 100%; aspect-ratio: 59 / 86; object-fit: cover;
  border-radius: 6px; background: var(--c-surface-2);
  outline: 1px solid var(--cx-line-soft);
  transition: transform 0.15s cubic-bezier(0.22,1,0.36,1), outline-color 0.15s ease;
}
.cx__fetch:hover img {
  transform: translateY(-2px);
  outline-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
}
.cx__fetch-name {
  font-size: 0.68rem; line-height: 1.3; color: var(--c-muted);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.cx__fetch:hover .cx__fetch-name { color: var(--c-text); }
.cx__reel-sk { flex: 0 0 auto; width: 84px; aspect-ratio: 59 / 86; border-radius: 6px; }

.cx__ledger {
  border: 1px solid var(--cx-line-soft); border-radius: 14px;
  background: var(--cx-panel); overflow: hidden;
}
/* Clipped rather than scrolled, with the last row fading out so the cut reads
   as "there is more" instead of as the end of the list. */
.cx__ledger.is-clipped {
  max-height: 214px;
  -webkit-mask-image: linear-gradient(to bottom, #000 68%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 68%, transparent 100%);
}
.cx__print {
  display: flex; align-items: center; gap: 11px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--cx-line-soft);
  font-size: 0.78rem;
}
.cx__print:last-child { border-bottom: 0; }
.cx__print-code {
  flex: 0 0 106px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-weight: 700; color: var(--c-text);
}
.cx__print-set {
  flex: 1 1 auto; min-width: 0; padding: 4px 0;
  color: var(--c-muted); text-decoration: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  transition: color 0.15s ease;
}
.cx__print-set:hover { color: var(--c-text); text-decoration: underline; text-underline-offset: 3px; }
.cx__print-year {
  flex: 0 0 auto;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem; color: var(--c-muted);
}
.cx__print-rarity { flex: 0 0 auto; font-size: 0.72rem; color: var(--c-muted); }
/* Last before the outbound link, and never given a fixed width: an exact
   figure and a two-ended band are different lengths, and padding the short one
   out to match would imply a precision the band does not have. The set name is
   what flexes, so the money sits against the link on every row. */
.cx__print-price { flex: 0 0 auto; }
/* Holds the money's place while the prices load, so the ledger settles once
   rather than twitching row by row as they arrive. */
.cx__print-price-sk {
  flex: 0 0 auto;
  width: 52px; height: 12px; border-radius: 4px;
  background: var(--c-skeleton);
  animation: cx-pulse 1.4s ease-in-out infinite;
}
.cx__print-buy {
  flex: 0 0 auto;
  display: grid; place-items: center;
  width: 26px; height: 26px; border-radius: 7px;
  color: var(--c-muted);
  transition: color 0.15s ease, background 0.15s ease;
}
.cx__print-buy:hover { color: var(--c-text); background: var(--c-surface-2); }

.cx__more {
  align-self: center;
  min-height: 38px; padding: 0 16px;
  background: transparent; border: 1px solid var(--cx-line); border-radius: 11px;
  font-family: inherit; font-size: 0.76rem; font-weight: 700;
  color: var(--c-muted); cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.cx__more:hover { color: var(--c-text); border-color: color-mix(in srgb, var(--c-trade) 55%, transparent); }

/* ── Nothing to show ────────────────────────────────────────────────────── */
.cx__error {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 72px 16px; text-align: center; color: var(--c-muted);
}
.cx__error-title {
  margin: 0;
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: 1.2rem; font-weight: 700; color: var(--c-text);
}
.cx__error-body { margin: 0; font-size: 0.86rem; }
.cx__error-cta {
  margin-top: 4px; min-height: 40px; padding: 10px 18px;
  border-radius: 11px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; text-decoration: none;
}
.cx__error-cta:hover { filter: brightness(1.08); }

/* ── Waiting ────────────────────────────────────────────────────────────── */
.cx__sk { background: var(--c-skeleton); border-radius: 9px; animation: cx-pulse 1.6s ease-in-out infinite; }
.cx__sk--title { height: 38px; width: min(70%, 340px); }
.cx__sk--line  { height: 14px; width: min(45%, 230px); }
.cx__sk--plate { height: 38px; width: min(60%, 300px); border-radius: 12px; }
.cx__sk--block { height: 104px; width: 100%; border-radius: 14px; }
@keyframes cx-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

.cx__sr {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* ── Reach ──────────────────────────────────────────────────────────────── */
.cx :where(a, button):focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
  border-radius: 9px;
}
.cx__join--want:focus-visible { outline-color: var(--c-accent); }

@media (pointer: coarse) {
  .cx__back, .cx__price, .cx__more, .cx__tips { min-height: 44px; }
  .cx__who { padding: 7px 13px 7px 7px; }
  .cx__print-buy { width: 44px; height: 44px; }
  .cx__face { width: 46px; }
}

/* Phones: the axis rotates, exactly as it does on the matches row — the two
   sides stack and the seam runs between them, so the shape of the market
   survives the turn. */
@media (max-width: 640px) {
  .cx__axis { flex-direction: column; }
  .cx__seam {
    flex-direction: row; width: auto; height: 28px;
    justify-content: center; gap: 12px;
  }
  .cx__seam-arm { max-width: 64px; }
  .cx__desc { font-size: 0.88rem; }
  /* One line for the printing, one for the set it came in. */
  .cx__print { flex-wrap: wrap; row-gap: 3px; gap: 9px; }
  .cx__print-code { flex: 0 0 auto; }
  .cx__print-set { flex: 1 1 100%; order: 5; white-space: normal; }
}

@media (prefers-reduced-motion: reduce) {
  .cx__sk, .cx__print-price-sk { animation: none; }
  .cx__face img, .cx__fetch img { transition: outline-color 0.15s ease; }
  .cx__face:hover img, .cx__fetch:hover img { transform: none; }
}
</style>
