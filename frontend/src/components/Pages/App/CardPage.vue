<template>
  <div class="flex flex-col gap-8 py-6 md:py-10 w-full max-w-7xl px-4 sm:px-6 lg:px-8 mx-auto">

    <!-- Back link -->
    <a
      href="/"
      class="flex items-center gap-2 text-sm no-underline transition-opacity hover:opacity-70 w-fit"
      style="color: var(--c-muted)"
      @click.prevent="$router.back()"
    >
      <v-icon icon="mdi-arrow-left" size="16" />
      {{ $t('cardPage.backToSearch') }}
    </a>

    <!-- Loading skeleton -->
    <div v-if="loading" class="flex flex-col sm:flex-row gap-6 animate-pulse">
      <div class="rounded-lg shrink-0" style="width: 200px; height: 291px; background: var(--c-skeleton)" />
      <div class="flex flex-col gap-4 grow">
        <div class="h-8 rounded w-3/4" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-1/3" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-full" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-5/6" style="background: var(--c-skeleton)" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="flex flex-col items-center gap-3 py-16 text-center">
      <v-icon icon="mdi-card-off-outline" size="48" style="color: var(--c-muted)" />
      <p class="text-lg font-semibold" style="color: var(--c-text)">{{ $t('cardPage.cardNotFound') }}</p>
      <p class="text-sm" style="color: var(--c-muted)">{{ error }}</p>
      <router-link to="/" class="text-sm" style="color: var(--c-accent)">{{ $t('cardPage.searchOther') }}</router-link>
    </div>

    <!-- Card content -->
    <template v-else-if="card">
      <!-- Image + details row -->
      <div class="flex flex-col sm:flex-row gap-6 sm:gap-10">

        <!-- Card image -->
        <img
          :src="cardImageUrl"
          :alt="card.name"
          class="rounded-lg shrink-0 shadow-lg"
          style="width: 200px; height: 291px; object-fit: cover"
          fetchpriority="high"
        />

        <!-- Details -->
        <div class="flex flex-col gap-3">
          <h1 class="text-2xl font-bold" style="color: var(--c-text)">{{ card.name }}</h1>

          <div class="flex flex-wrap items-center gap-3 text-sm" style="color: var(--c-muted)">
            <CardKindIcons :card="card" :size="20" />
            <span v-if="card.type">{{ card.type }}</span>
            <span v-if="card.race && !cardIsSpellTrap">· {{ card.race }}</span>
            <span v-if="card.level != null" class="inline-flex items-center gap-1">·
              <img v-if="levelIcon && levelIcon.src" :src="levelIcon.src" :alt="levelIcon.label" :title="levelIcon.label" class="object-contain" style="width: 18px; height: 18px" />
              <template v-else>{{ levelIcon ? levelIcon.label : $t('cardYugi.level') }}</template>
              {{ card.level }}
            </span>
            <span v-if="card.atk != null">· ATK {{ card.atk }}</span>
            <span v-if="card.def != null">· DEF {{ card.def }}</span>
          </div>

          <!-- Banlist (Forbidden/Limited list) status — shown only for restricted
               cards; TCG and OCG are listed separately since they can differ. -->
          <div v-if="hasBanlist" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('banlist.label') }}</span>
            <CardBanlistBadge :card="card" format="tcg" variant="chip" show-format />
            <CardBanlistBadge :card="card" format="ocg" variant="chip" show-format />
          </div>

          <div v-if="loadingSearchers || searcherCards.length" class="flex flex-col gap-2 mt-2">
            <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">
              {{ $t('cardPage.searchedBy') }}
            </p>
            <div v-if="loadingSearchers" class="flex gap-3 overflow-x-auto pb-1">
              <div v-for="i in 6" :key="i" class="shrink-0 rounded-lg animate-pulse" style="width: 80px; height: 116px; background: var(--c-skeleton)" />
            </div>
            <div v-else class="flex gap-3 overflow-x-auto pb-1" style="scrollbar-width: thin">
              <router-link
                v-for="c in searcherCards"
                :key="c.id"
                :to="`/${$route.params.locale || 'en'}/card/${c.id}`"
                class="shrink-0 flex flex-col gap-1 no-underline transition-opacity hover:opacity-80"
                style="width: 80px"
              >
                <img :src="cardImage(c.id)" :alt="c.name" loading="lazy" class="rounded w-full shadow-sm" style="aspect-ratio: 59/86; object-fit: cover" />
                <span class="text-[10px] text-center leading-tight" style="color: var(--c-muted); display: -webkit-box; line-clamp: 2; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">{{ c.name }}</span>
              </router-link>
            </div>
          </div>

        </div>
      </div>

      <div class="flex flex-col xl:flex-row gap-6 xl:items-start">
        <div class="flex-1 min-w-0 flex flex-col gap-4">
          <div class="rounded-lg border p-4" style="border-color: var(--c-border); background: var(--c-surface-2)">
            <!-- Effect: the normalized breakdown stands in for the plain text when the
                 PSCT parser can segment it (the breakdown keeps a "show original"
                 toggle); otherwise fall back to the raw effect paragraph so vanilla /
                 unparseable cards still show their text. -->
            <CardEffectBreakdown v-if="hasEffectBreakdown" :card-id="card.id" :original-text="card.desc" />
            <p v-else class="text-sm leading-relaxed" style="color: var(--c-text); opacity: 0.85">{{ card.desc }}</p>
          </div>

          <div class="flex flex-col gap-3">
            <!-- Combo Explorer entry (renders only if this card has a parsed effect) -->
            <ComboExplorerLink :card-id="card.id" />

            <!-- External links + actions -->
            <div class="flex flex-wrap items-center gap-2">
              <a
                v-for="link in marketLinks"
                :key="link.label"
                :href="link.url"
                target="_blank"
                rel="noopener noreferrer"
                :title="link.label"
                :aria-label="link.label"
                class="no-underline flex items-center gap-2 rounded px-2 py-1 transition-opacity hover:opacity-80"
                style="height: 28px"
              >
                <img
                  :src="isDarkTheme && link.logoDark ? link.logoDark : link.logo"
                  :alt="link.label"
                  loading="lazy"
                  :style="{ maxHeight: '24px', maxWidth: '90px', objectFit: 'contain', display: 'block', filter: (isDarkTheme ? link.filterDark : link.filterLight) || 'none' }"
                />
                <span v-if="link.label === 'TCGPlayer' && prices?.tcg" class="text-[11px] font-semibold" style="color: var(--c-text)">{{ `$${prices.tcg}` }}</span>
                <span v-if="link.label === 'Cardmarket' && prices?.cm" class="text-[11px] font-semibold" style="color: var(--c-text)">{{ `€${prices.cm}` }}</span>
              </a>
              <v-btn
                variant="flat"
                class="!min-h-[28px] !px-3"
                :style="{ backgroundColor: 'var(--c-trade)', color: 'white' }"
                prepend-icon="mdi-plus-box"
                @click="openTrade"
              >{{ $t('cardPage.addToTrade') }}</v-btn>
              <v-btn
                variant="flat"
                class="!min-h-[28px] !px-3"
                :style="{ backgroundColor: 'var(--c-accent)', color: 'white' }"
                prepend-icon="mdi-heart-plus"
                @click="openWish"
              >{{ $t('cardPage.addToWishlist') }}</v-btn>
              <!-- Strategy tips (outbound link only — no content reproduced).
                   Shown only when the crawler confirmed a real Card Tips page. -->
              <a
                v-if="yugipediaTipsUrl"
                :href="yugipediaTipsUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
                style="color: var(--c-muted)"
              >
                <v-icon icon="mdi-open-in-new" size="13" />
                {{ $t('cardPage.yugipediaTips') }}
              </a>
            </div>
          </div>
        </div>

      </div>

      <!-- Alternate artworks: clicking a thumbnail swaps the hero image above.
           Full-width row that wraps to as many lines as needed so every printing
           art is visible; shown only when the card has more than one. -->
      <div v-if="altImages.length > 1" class="flex flex-col gap-2">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('cardPage.alternateArtworks') }}</p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="img in altImages"
            :key="img.id"
            type="button"
            class="shrink-0 rounded overflow-hidden p-0 cursor-pointer transition-opacity hover:opacity-80"
            :style="{ border: '2px solid ' + ((selectedImageId ?? card.id) === img.id ? 'var(--c-accent)' : 'transparent') }"
            :aria-label="card.name"
            @click="selectedImageId = img.id"
          >
            <img :src="cardImage(img.id)" :alt="card.name" loading="lazy" style="width: 50px; height: 73px; object-fit: cover; display: block" />
          </button>
        </div>
      </div>

      <!-- Printings -->
      <div v-if="card.card_sets?.length" class="rounded-lg border" style="border-color: var(--c-border)">
        <p class="text-xs font-bold uppercase tracking-wide px-4 py-3" style="color: var(--c-muted); border-bottom: 1px solid var(--c-border)">
          {{ $t('cardPage.printingsCount', { count: card.card_sets.length }) }}
        </p>
        <!-- Printings list — collapsed to 180px when >5 entries, toggle to expand -->
        <div
          :style="card.card_sets.length > 5 && !printingsExpanded ? 'max-height: 180px; overflow-y: hidden' : 'overflow-y: auto'"
        >
          <div
            v-for="s in sortedPrintings"
            :key="s.set_code + '|' + s.set_rarity"
            class="flex items-center gap-2 px-4 py-2 border-b last:border-0 text-xs"
            style="border-color: var(--c-border)"
          >
            <span class="font-mono font-semibold shrink-0 w-28" style="color: var(--c-text)">{{ s.set_code }}</span>
            <router-link :to="'/en/set/' + encodeURIComponent(s.set_name)" class="truncate grow no-underline transition-opacity hover:opacity-70" style="color: var(--c-muted)">{{ s.set_name }}</router-link>
            <span class="shrink-0" style="color: var(--c-muted)">{{ s.set_rarity }}</span>
            <a
              :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`"
              target="_blank" rel="noopener noreferrer"
              class="shrink-0 flex items-center gap-1 no-underline transition-opacity hover:opacity-70"
              style="color: var(--c-muted)"
            >
              <v-icon icon="mdi-open-in-new" size="13" />
            </a>
          </div>
        </div>
        <button
          v-if="card.card_sets.length > 5"
          type="button"
          class="w-full text-xs py-2 text-center transition-opacity hover:opacity-70"
          style="color: var(--c-muted); border-top: 1px solid var(--c-border)"
          @click="printingsExpanded = !printingsExpanded"
        >
          {{ printingsExpanded ? $t('cardPage.showLess') : $t('cardPage.showAllPrintings', { count: card.card_sets.length }) }}
        </button>
      </div>

      <!-- Traders section -->
      <div class="flex flex-col gap-4">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('cardYugi.tradersWithCard') }}</p>

        <div v-if="loadingTraders" class="grid grid-cols-2 sm:grid-cols-3 gap-3 px-3 py-3">
          <div
            v-for="i in 6" :key="i"
            class="rounded-xl border overflow-hidden animate-pulse"
            style="border-color: var(--c-border)"
          >
            <div class="h-1 w-full" style="background: var(--c-skeleton)" />
            <div class="px-3 py-3 flex flex-col gap-2" style="background: var(--c-surface-2)">
              <div class="flex items-center gap-2">
                <div class="size-8 rounded-full" style="background: var(--c-skeleton)" />
                <div class="flex flex-col gap-1 grow">
                  <div class="h-3 rounded w-3/4" style="background: var(--c-skeleton)" />
                  <div class="h-2 rounded w-1/2" style="background: var(--c-border)" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else>
          <div class="rounded-lg border" style="border-color: var(--c-border)">
            <template v-if="tradersHave.length === 0">
              <p class="text-sm text-center py-6" style="color: var(--c-muted)">{{ $t('cardYugi.noTraders') }}</p>
            </template>
            <template v-else>
              <div
                v-for="trader in tradersHave"
                :key="trader.id"
                class="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-opacity hover:opacity-80"
                style="border-color: var(--c-border)"
                @click="proposeToTrader(trader)"
              >
                <div
                  class="size-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold overflow-hidden"
                  :style="{ width: '32px', height: '32px', background: `color-mix(in srgb, ${kindColor(trader.kind)} 18%, transparent)`, color: kindColor(trader.kind) }"
                >
                  <img v-if="trader.avatarUrl" :src="trader.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ (trader.name ?? '?')[0].toUpperCase() }}</span>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold truncate" style="color: var(--c-text)">{{ trader.name ?? $t('common.anonymous') }}</span>
                    <span class="text-[10px] uppercase rounded-full px-2 py-1 font-semibold" :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 12%, transparent)`, color: kindColor(trader.kind) }">{{ kindLabel(trader.kind) }}</span>
                  </div>
                  <p class="text-xs truncate mt-1" style="color: var(--c-muted)">{{ [trader.city, trader.country].filter(Boolean).join(', ') || $t('cardPage.unknown') }}</p>
                </div>
              </div>
            </template>
          </div>

          <div class="flex flex-col gap-4 pt-2">
            <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('cardYugi.tradersLookingForCard') }}</p>
            <div class="rounded-lg border" style="border-color: var(--c-border)">
            <template v-if="tradersWant.length === 0">
              <p class="text-sm text-center py-6" style="color: var(--c-muted)">{{ $t('cardYugi.noTradersLookingForCard') }}</p>
            </template>
            <template v-else>
              <div
                v-for="trader in tradersWant"
                :key="trader.id"
                class="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer transition-opacity hover:opacity-80"
                style="border-color: var(--c-border)"
                @click="proposeToTrader(trader)"
              >
                <div
                  class="size-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold overflow-hidden"
                  :style="{ width: '32px', height: '32px', background: `color-mix(in srgb, ${kindColor(trader.kind)} 18%, transparent)`, color: kindColor(trader.kind) }"
                >
                  <img v-if="trader.avatarUrl" :src="trader.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ (trader.name ?? '?')[0].toUpperCase() }}</span>
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold truncate" style="color: var(--c-text)">{{ trader.name ?? $t('common.anonymous') }}</span>
                    <span class="text-[10px] uppercase rounded-full px-2 py-1 font-semibold" :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 12%, transparent)`, color: kindColor(trader.kind) }">{{ kindLabel(trader.kind) }}</span>
                  </div>
                  <p class="text-xs truncate mt-1" style="color: var(--c-muted)">{{ [trader.city, trader.country].filter(Boolean).join(', ') || $t('cardPage.unknown') }}</p>
                </div>
              </div>
            </template>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Headless AddCard dialogs -->
    <AddCard ref="tradeAdd" mode="trade" :headless="true" />
    <AddCard ref="wishAdd"  mode="wish"  :headless="true" />

    <ProposeTradeDialog
      v-model="proposeOpen"
      :user="proposingTo"
    />
  </div>
</template>

<script>
import { ref, computed, onServerPrefetch } from "vue";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import AddCard           from "@/components/library/AddCard.vue";
import ProposeTradeDialog from "@/components/trade/ProposeTradeDialog.vue";
import CardKindIcons      from "@/components/ui/card/CardKindIcons.vue";
import CardBanlistBadge   from "@/components/ui/card/CardBanlistBadge.vue";
import ComboExplorerLink  from "@/components/ui/card/ComboExplorerLink.vue";
import CardEffectBreakdown from "@/components/ui/card/CardEffectBreakdown.vue";
import { parseCardText }  from "@/lib/psctParser";
import { cardImage }      from "@/lib/cardImage";
import { isSpellTrap, levelIconFor } from "@/lib/cardIcons";
import { hasAnyBanlist, ensureBanlistManifest } from "@/lib/banlist";
import { searchById, searchByArchetype, getCardsByIds, getCardArtworks, getSetReleaseDates } from "@/api";
import { fetchTradersWithCard } from "@/lib/matches";
import { getCurrentSession, getClient } from "@/lib/supabaseClient";

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
  components: { AddCard, ProposeTradeDialog, CardKindIcons, CardBanlistBadge, ComboExplorerLink, CardEffectBreakdown },

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
          throw new Error(`No data for card ${cardId}`);
        }
      } catch (err) {
        throw err; // causes vite-ssg to skip this route silently
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
          { type: "application/ld+json", innerHTML: JSON.stringify(schema) },
          { type: "application/ld+json", innerHTML: JSON.stringify(breadcrumb) },
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
      proposeOpen:        false,
      proposingTo:        null,
      currentLogin:       null,
      printingsExpanded:  false,
      selectedImageId:    null, // which printing art the hero image shows (null → main id)
      artworks:           [],   // all printing artworks (fetched by name; id query returns only one)
      setDates:           {},   // set_name → release date, for sorting printings by recency
    };
  },

  computed: {
    cardId()     { return this.$route.params.id; },
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
    tradersHave() {
      return this.traders.filter((trader) => trader.kind === 'they_have' || trader.kind === 'mutual');
    },
    tradersWant() {
      return this.traders.filter((trader) => trader.kind === 'they_want');
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
        { label: "TCGPlayer",  logo: "/logos/tcgplayer.svg",        logoDark: "/logos/tcgplayer-white.png", url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}` },
        { label: "eBay",       logo: "/logos/ebay.png",             url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh` },
        { label: "Cardmarket", logo: "/logos/cardmarket-white.png", filterLight: "brightness(0)", url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${name}` },
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
      const tcg = normalize(p.tcgplayer_price);
      const cm  = normalize(p.cardmarket_price);
      return (tcg || cm) ? { tcg, cm } : null;
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
        // Traders are looked up by English canonical name so they match DB records
        this.loadingTraders = true;
        fetchTradersWithCard(data.name_en ?? data.name)
          .then(t => { this.traders = t; })
          .catch(() => { this.traders = []; })
          .finally(() => { this.loadingTraders = false; });
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

    kindColor(kind) {
      return kind === "mutual"     ? "var(--c-mutual)"
           : kind === "they_have"  ? "var(--c-trade)"
           :                         "var(--c-accent)";
    },
    kindLabel(kind) {
      return kind === "mutual"    ? this.$t('cardYugi.match')
           : kind === "they_have" ? this.$t('cardYugi.hasThisCard')
           :                        this.$t('cardYugi.wantsYours');
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
    async proposeToTrader(trader) {
      const login = await this._requireAuth();
      if (!login) return;
      this.currentLogin = login;
      this.proposingTo  = trader;
      this.proposeOpen  = true;
    },
  },
};
</script>
