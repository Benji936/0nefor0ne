<template>
  <div class="flex flex-col gap-8 py-6 md:py-10 max-w-3xl mx-auto">

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
        />

        <!-- Details -->
        <div class="flex flex-col gap-3">
          <h1 class="text-2xl font-bold" style="color: var(--c-text)">{{ card.name }}</h1>

          <div class="flex flex-wrap gap-3 text-sm" style="color: var(--c-muted)">
            <span v-if="card.type">{{ card.type }}</span>
            <span v-if="card.race">· {{ card.race }}</span>
            <span v-if="card.attribute">· {{ card.attribute }}</span>
            <span v-if="card.level != null">· {{ $t('cardYugi.level') }} {{ card.level }}</span>
            <span v-if="card.atk != null">· ATK {{ card.atk }}</span>
            <span v-if="card.def != null">· DEF {{ card.def }}</span>
          </div>

          <p class="text-sm leading-relaxed" style="color: var(--c-text); opacity: 0.85">{{ card.desc }}</p>

          <!-- External links -->
          <div class="flex flex-wrap gap-3 mt-1">
            <a
              v-for="link in marketLinks"
              :key="link.label"
              :href="link.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs no-underline flex items-center gap-1 transition-opacity hover:opacity-70"
              style="color: var(--c-muted)"
            >
              <v-icon icon="mdi-open-in-new" size="13" />
              {{ link.label }}
            </a>
          </div>

          <!-- Actions -->
          <div class="flex flex-col sm:flex-row gap-2 mt-2">
            <v-btn
              variant="flat"
              :style="{ backgroundColor: 'var(--c-trade)', color: 'white', minHeight: '40px' }"
              prepend-icon="mdi-plus-box"
              @click="openTrade"
            >{{ $t('cardPage.addToTrade') }}</v-btn>
            <v-btn
              variant="flat"
              :style="{ backgroundColor: 'var(--c-accent)', color: 'white', minHeight: '40px' }"
              prepend-icon="mdi-heart-plus"
              @click="openWish"
            >{{ $t('cardPage.addToWishlist') }}</v-btn>
          </div>
        </div>
      </div>

      <!-- Printings -->
      <div v-if="card.card_sets?.length" class="rounded-lg border overflow-hidden" style="border-color: var(--c-border)">
        <p class="text-xs font-bold uppercase tracking-wide px-4 py-3" style="color: var(--c-muted); border-bottom: 1px solid var(--c-border)">
          {{ $t('cardPage.printingsCount', { count: card.card_sets.length }) }}
        </p>
        <div class="overflow-y-auto" style="max-height: 180px">
          <div
            v-for="s in card.card_sets"
            :key="s.set_code"
            class="flex items-center gap-2 px-4 py-2 border-b last:border-0 text-xs"
            style="border-color: var(--c-border)"
          >
            <span class="font-mono font-semibold shrink-0 w-28" style="color: var(--c-text)">{{ s.set_code }}</span>
            <span class="truncate grow" style="color: var(--c-muted)">{{ s.set_name }}</span>
            <span class="shrink-0" style="color: var(--c-muted)">{{ s.set_rarity }}</span>
            <a
              :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`"
              target="_blank"
              rel="noopener noreferrer"
              class="shrink-0 flex items-center gap-1 no-underline transition-opacity hover:opacity-70"
              style="color: var(--c-muted)"
            >
              <v-icon icon="mdi-open-in-new" size="13" />
            </a>
          </div>
        </div>
      </div>

      <!-- Traders section -->
      <div class="flex flex-col gap-3">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('cardYugi.tradersWithCard') }}</p>

        <div v-if="loadingTraders" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div
            v-for="i in 6" :key="i"
            class="rounded-xl border overflow-hidden animate-pulse"
            style="border-color: var(--c-border)"
          >
            <div class="h-1 w-full" style="background: var(--c-skeleton)" />
            <div class="p-3 flex flex-col gap-2" style="background: var(--c-surface-2)">
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

        <p
          v-else-if="traders.length === 0"
          class="text-sm text-center py-6"
          style="color: var(--c-muted)"
        >{{ $t('cardYugi.noTraders') }}</p>

        <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div
            v-for="trader in traders"
            :key="trader.id"
            class="rounded-xl border overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
            style="border-color: var(--c-border)"
            @click="proposeToTrader(trader)"
          >
            <div class="h-1 w-full" :style="{ background: kindColor(trader.kind) }" />
            <div class="flex flex-col gap-2 p-3" style="background: var(--c-surface-2)">
              <div class="flex items-center gap-2">
                <div
                  class="size-9 rounded-full shrink-0 flex items-center justify-center text-sm font-bold overflow-hidden"
                  :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 18%, transparent)`, color: kindColor(trader.kind) }"
                >
                  <img v-if="trader.avatarUrl" :src="trader.avatarUrl" class="w-full h-full object-cover" />
                  <span v-else>{{ (trader.name ?? '?')[0].toUpperCase() }}</span>
                </div>
                <div class="flex flex-col min-w-0">
                  <span class="text-sm font-semibold truncate" style="color: var(--c-text)">{{ trader.name ?? $t('common.anonymous') }}</span>
                  <span class="text-xs truncate" style="color: var(--c-muted)">
                    {{ [trader.city, trader.country].filter(Boolean).join(', ') || $t('cardPage.unknown') }}
                  </span>
                </div>
              </div>
              <span
                class="text-[10px] font-bold px-2 py-1 rounded-md text-center"
                :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 12%, transparent)`, color: kindColor(trader.kind) }"
              >{{ kindLabel(trader.kind) }}</span>
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
      :login="currentLogin"
    />
  </div>
</template>

<script>
import AddCard           from "@/components/AddCard.vue";
import ProposeTradeDialog from "@/components/ProposeTradeDialog.vue";
import { cardImage }      from "@/lib/cardImage";
import { searchById }     from "@/api";
import { fetchTradersWithCard } from "@/lib/matches";
import { getCurrentSession }   from "@/lib/supabaseClient";

export default {
  components: { AddCard, ProposeTradeDialog },

  props: {
    // Passed by App.vue RouterView slot — needed for AddCard auth check
    login: { type: Object, default: null },
  },

  emits: ["requireAuth"],

  data() {
    return {
      card:           null,
      loading:        true,
      error:          null,
      traders:        [],
      loadingTraders: false,
      proposeOpen:    false,
      proposingTo:    null,
      currentLogin:   null,
    };
  },

  computed: {
    cardId()     { return this.$route.params.id; },
    cardImageUrl() { return cardImage(this.card?.id); },
    marketLinks() {
      const name = encodeURIComponent(this.card?.name ?? "");
      return [
        { label: "TCGPlayer",  url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}` },
        { label: "eBay",       url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh` },
        { label: "Cardmarket", url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${name}` },
      ];
    },
  },

  watch: {
    // Re-load when navigating between card pages directly
    cardId() { this.load(); },
  },

  async mounted() {
    await this.load();
  },

  methods: {
    async load() {
      this.loading = true;
      this.error   = null;
      this.card    = null;
      this.traders = [];

      try {
        const locale = this.$route.params.locale || 'en';
        const res = await searchById(this.cardId, locale);
        const data = res?.data?.data?.[0] ?? res?.data?.[0] ?? null;
        if (!data) { this.error = "Card not found."; return; }
        this.card = data;
        this._injectSeo();
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

    _injectSeo() {
      const card  = this.card;
      const image = cardImage(card.id);
      const title = `${card.name} — Yu-Gi-Oh! | One for One`;
      const raw   = card.desc ?? "";
      const desc  = raw.length > 155 ? raw.slice(0, 155) + "…" : raw ||
        `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`;

      document.title = title;

      const setMeta = (attr, key, val) => {
        let el = document.head.querySelector(`meta[${attr}="${key}"]`);
        if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute("content", val);
      };

      setMeta("name",     "description",        desc);
      setMeta("property", "og:title",            title);
      setMeta("property", "og:description",      desc);
      setMeta("property", "og:image",            image);
      setMeta("property", "og:url",             `https://0nefor.one/${this.$route?.params?.locale || "en"}/card/${card.id}`);
      setMeta("name",     "twitter:card",        "summary_large_image");
      setMeta("name",     "twitter:title",       title);
      setMeta("name",     "twitter:description", desc);
      setMeta("name",     "twitter:image",       image);

      // Canonical
      const locale = this.$route?.params?.locale || "en";
      const canonical = document.head.querySelector('link[rel="canonical"]');
      if (canonical) canonical.setAttribute("href", `https://0nefor.one/${locale}/card/${card.id}`);

      // JSON-LD
      const schema = {
        "@context": "https://schema.org",
        "@type":    "Product",
        name:       card.name,
        description: card.desc ?? "",
        image,
        category: "Trading Card",
        brand: { "@type": "Brand", name: "Yu-Gi-Oh!" },
        ...(card.card_sets?.length ? {
          offers: card.card_sets.map(s => ({
            "@type": "Offer",
            sku:     s.set_code,
            name:    s.set_rarity,
            url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`,
          })),
        } : {}),
      };
      let tag = document.getElementById("ld-card");
      if (!tag) {
        tag = document.createElement("script");
        tag.id   = "ld-card";
        tag.type = "application/ld+json";
        document.head.appendChild(tag);
      }
      tag.textContent = JSON.stringify(schema);
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
