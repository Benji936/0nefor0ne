<script setup>
import { cardImage } from '@/lib/cardImage'
const emit = defineEmits(['showTraders', 'requireAuth'])
</script>

<template>
  <v-overlay class="align-start justify-center rounded-lg pt-8" :opacity="0" transition="scale-transition" @click.self="$emit('close')">
    <template v-slot:activator="{ props: activatorProps }">
      <div class="hover:outline hover:outline-white cursor-pointer w-fit" v-bind="activatorProps" @click="fetchTraders">
        <img :alt="componentCard.name" loading="lazy" class="h-48 object-cover rounded" style="aspect-ratio: 59/86" :src="cardImage(componentCard.id)" />
      </div>
    </template>

    <template v-slot:default="{ isActive }">
      <div
        class="flex flex-col gap-4 px-4 py-5 sm:px-10 sm:py-7 rounded-xl overflow-y-auto"
        style="background-color: var(--c-surface); color: var(--c-text); width: min(680px, calc(100vw - 24px)); max-height: 90dvh"
      >
        <!-- Card image + data -->
        <div class="flex flex-col sm:flex-row gap-6">
          <img :alt="componentCard.name" loading="lazy" class="h-26 sm:h-52 shrink-0  sm:mx-0 rounded" :src="cardImage(componentCard.id)" />
          <div class="flex flex-col gap-2">
            <p class="font-bold text-xl" style="color: var(--c-text)">{{ componentCard.name }}</p>
            <div class="flex flex-wrap gap-3 text-base" style="color: var(--c-muted)">
              <p v-if="componentCard.atk != null">ATK {{ componentCard.atk }}</p>
              <p v-if="componentCard.def != null">DEF {{ componentCard.def }}</p>
              <p v-if="componentCard.level != null">{{ $t('cardYugi.level') }} {{ componentCard.level }}</p>
              <p>{{ componentCard.race }}</p>
            </div>
            <p class="text-sm leading-relaxed" style="color: var(--c-text); opacity: 0.85">{{ componentCard.desc }}</p>
          </div>
        </div>

        <!-- Prints -->
        <div v-if="printPrices.length" class="rounded-lg border overflow-hidden" style="border-color: var(--c-border)">
          <div class="overflow-y-auto" style="max-height: 110px">
            <div
              v-for="s in printPrices" :key="s.set_code"
              class="flex items-center gap-2 px-3 py-2 border-b last:border-0 text-xs"
              style="border-color: var(--c-border)"
            >
              <span class="font-mono font-semibold shrink-0" style="color: var(--c-text)">{{ s.set_code }}</span>
              <span class="truncate grow" style="color: var(--c-muted)">{{ s.set_rarity }}</span>
              <a
                :href="`https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 transition-opacity hover:opacity-70 flex items-center gap-1 no-underline text-xs"
                style="color: var(--c-muted)"
              >
                <v-icon icon="mdi-open-in-new" size="13" />
                Cardmarket
              </a>
            </div>
          </div>
        </div>

        <!-- Permalink -->
        <router-link
          :to="`/card/${componentCard.id}`"
          class="text-xs no-underline flex items-center gap-1 transition-opacity hover:opacity-70 -mt-2 w-fit"
          style="color: var(--c-muted)"
        >
          <v-icon icon="mdi-link-variant" size="13" />
          {{ $t('cardYugi.permalink') }}
        </router-link>

        <!-- Footer links -->
        <div class="flex gap-3 -mt-3">
          <a
            v-for="m in marketLinks" :key="m.label"
            :href="m.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs no-underline transition-opacity hover:opacity-70 flex items-center gap-1"
            style="color: var(--c-muted)"
          >
            <v-icon icon="mdi-open-in-new" size="12" />
            {{ m.label }}
          </a>
        </div>

        <!-- Traders with this card -->
        <div class="flex flex-col gap-2">
          <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('cardYugi.tradersWithCard') }}</p>

          <!-- Loading skeleton -->
          <div v-if="loadingTraders" class="grid grid-cols-2 gap-2">
            <div
              v-for="i in 4" :key="i"
              class="rounded-xl border overflow-hidden animate-pulse"
              style="border-color: var(--c-border)"
            >
              <div class="h-1 w-full" style="background: var(--c-skeleton)" />
              <div class="flex flex-col gap-3" style="background: var(--c-surface-2); padding: 12px">
                <div class="flex items-center gap-2">
                  <div class="size-10 rounded-full shrink-0" style="background: var(--c-skeleton)" />
                  <div class="flex flex-col gap-1 grow">
                    <div class="h-3 rounded w-3/4" style="background: var(--c-skeleton)" />
                    <div class="h-2 rounded w-1/2" style="background: var(--c-border)" />
                  </div>
                </div>
                <div class="h-7 rounded w-full" style="background: var(--c-skeleton)" />
              </div>
            </div>
          </div>

          <!-- Empty state -->
          <p
            v-else-if="traders.length === 0"
            class="text-sm text-center py-4"
            style="color: var(--c-muted)"
          >{{ $t('cardYugi.noTraders') }}</p>

          <!-- Trader cards grid -->
          <template v-else>
            <div class="grid grid-cols-2 gap-2">
              <div
                v-for="trader in traders.slice(0, 4)"
                :key="trader.id"
                class="rounded-xl border overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
                style="border-color: var(--c-border)"
                @click="openProfile(trader.id)"
              >
                <!-- Kind accent stripe -->
                <div class="h-1 w-full" :style="{ background: kindColor(trader.kind) }" />

                <div class="flex flex-col gap-3" style="background: var(--c-surface-2); padding: 12px">
                  <!-- Avatar + name -->
                  <div class="flex items-center gap-2">
                    <div
                      class="size-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold select-none overflow-hidden"
                      :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 18%, transparent)`, color: kindColor(trader.kind) }"
                    >
                      <img v-if="trader.avatarUrl" :src="trader.avatarUrl" class="w-full h-full object-cover" />
                      <span v-else>{{ (trader.name ?? '?')[0].toUpperCase() }}</span>
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span class="text-sm font-semibold truncate" style="color: var(--c-text)">{{ trader.name ?? $t('common.anonymous') }}</span>
                      <span class="text-xs truncate" style="color: var(--c-muted)">
                        {{ [trader.city, trader.country].filter(Boolean).join(', ') || $t('common.unknownLocation') }}
                      </span>
                    </div>
                  </div>

                  <!-- Kind badge + propose -->
                  <div class="flex items-center gap-2">
                    <span
                      class="text-[10px] font-bold px-2 py-1 rounded-md grow text-center truncate"
                      :style="{ background: `color-mix(in srgb, ${kindColor(trader.kind)} 12%, transparent)`, color: kindColor(trader.kind) }"
                    >{{ kindLabel(trader.kind) }}</span>
                    <v-btn
                      size="x-small"
                      variant="outlined"
                      style="border-color: var(--c-border); color: var(--c-muted)"
                      @click.stop="proposeToTrader(trader)"
                    >{{ $t('userCard.propose') }}</v-btn>
                  </div>
                </div>
              </div>
            </div>

            <!-- More traders -->
            <button
              v-if="traders.length > 4"
              class="text-xs text-center py-1 cursor-pointer transition-opacity hover:opacity-70 w-full"
              style="color: var(--c-muted)"
              @click="emit('showTraders', componentCard)"
            >{{ $t('cardYugi.moreTraders', { count: traders.length - 4 }) }}</button>
          </template>
        </div>

        <!-- Action buttons -->
        <div class="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-trade)', color: 'white', minHeight: '44px' }"
            prepend-icon="mdi-plus-box"
            @click="openTrade"
          >{{ $t('addCard.addToTrade') }}</v-btn>

          <v-btn
            class="grow"
            variant="flat"
            :style="{ backgroundColor: 'var(--c-accent)', color: 'white', minHeight: '44px' }"
            prepend-icon="mdi-heart-plus"
            @click="openWish"
          >{{ $t('addCard.addToWishlist') }}</v-btn>
        </div>
      </div>
    </template>
  </v-overlay>

  <!-- Headless AddCard dialogs -->
  <AddCard ref="tradeAdd" mode="trade" :headless="true" />
  <AddCard ref="wishAdd" mode="wish" :headless="true" />

  <!-- Propose trade dialog — always mounted so the watcher fires on a real false→true
       transition rather than an immediate hook on first mount (avoids Vuetify dialog
       lazy-boot edge-case where slot content isn't rendered when modelValue starts true) -->
  <ProposeTradeDialog
    v-model="proposeDialogOpen"
    :user="proposingTo"
    :login="currentLogin"
  />

  <!-- Trader profile dialog — always mounted for same reason as ProposeTradeDialog -->
  <TraderProfileDialog
    v-model="profileDialogOpen"
    :trader-id="profileTraderId"
    :current-user-id="currentLogin?.user?.id ?? null"
    @propose="handleProposeFromProfile"
  />
</template>

<script>
import AddCard from './AddCard.vue';
import ProposeTradeDialog from './ProposeTradeDialog.vue';
import TraderProfileDialog from './TraderProfileDialog.vue';
import { getCurrentSession } from '@/lib/supabaseClient';
import { fetchTradersWithCard } from '@/lib/matches';

export default {
  components: { AddCard, ProposeTradeDialog, TraderProfileDialog },
  props: {
    componentCard: { type: Object, required: true },
    extension: { type: String, default: '' },
  },
  data() {
    return {
      traders: [],
      loadingTraders: false,
      proposeDialogOpen: false,
      proposingTo: null,
      profileDialogOpen: false,
      profileTraderId: null,
      currentLogin: null,
    };
  },
  computed: {
    printPrices() {
      return this.componentCard.card_sets ?? [];
    },
    marketLinks() {
      const name = encodeURIComponent(this.componentCard.name);
      return [
        { label: 'TCGPlayer', url: `https://www.tcgplayer.com/search/yugioh/product?q=${name}` },
        { label: 'eBay', url: `https://www.ebay.com/sch/i.html?_nkw=${name}+yugioh` },
      ];
    },
  },
  methods: {
    async _requireAuth() {
      const session = await getCurrentSession();
      if (!session) { this.$emit('requireAuth'); return false; }
      return true;
    },
    async openTrade() {
      if (!await this._requireAuth()) return;
      this.$refs.tradeAdd.openWith(this.componentCard, this.extension);
    },
    async openWish() {
      if (!await this._requireAuth()) return;
      this.$refs.wishAdd.openWith(this.componentCard, this.extension);
    },
    kindColor(kind) {
      return kind === 'mutual' ? 'var(--c-mutual)' : kind === 'they_have' ? 'var(--c-trade)' : 'var(--c-accent)';
    },
    kindLabel(kind) {
      return kind === 'mutual' ? this.$t('cardYugi.match') : kind === 'they_have' ? this.$t('cardYugi.hasThisCard') : this.$t('cardYugi.wantsYours');
    },
    async fetchTraders() {
      this._injectCardSeo();
      if (this.loadingTraders || this.traders.length > 0) return; // skip if cached
      this.loadingTraders = true;
      try {
        // Use English canonical name so DB lookup matches stored records
        this.traders = await fetchTradersWithCard(this.componentCard.name_en ?? this.componentCard.name);
      } catch {
        this.traders = [];
      } finally {
        this.loadingTraders = false;
      }
    },
    _injectCardSeo() {
      const card  = this.componentCard;
      const image = `https://images.ygoprodeck.com/images/cards/${card.id}.jpg`;
      const title = `${card.name} — Yu-Gi-Oh! | One for One`;
      const desc  = card.desc
        ? card.desc.slice(0, 155) + (card.desc.length > 155 ? '…' : '')
        : `Trade ${card.name} on One for One — the free Yu-Gi-Oh! card trading platform.`;

      // Title
      document.title = title;

      // Meta description + OG + Twitter
      this._setMeta('name',     'description',       desc);
      this._setMeta('property', 'og:title',           title);
      this._setMeta('property', 'og:description',     desc);
      this._setMeta('property', 'og:image',           image);
      this._setMeta('name',     'twitter:title',      title);
      this._setMeta('name',     'twitter:description', desc);
      this._setMeta('name',     'twitter:image',      image);

      // JSON-LD Product schema
      const schema = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: card.name,
        description: card.desc ?? '',
        image,
        category: 'Trading Card',
        brand: { '@type': 'Brand', name: 'Yu-Gi-Oh!' },
        ...(card.card_sets?.length ? {
          offers: card.card_sets.map(s => ({
            '@type': 'Offer',
            sku: s.set_code,
            name: s.set_rarity,
            url: `https://www.cardmarket.com/en/YuGiOh/Products/Search?searchString=${encodeURIComponent(s.set_code)}`,
          })),
        } : {}),
      };

      let tag = document.getElementById('ld-card');
      if (!tag) {
        tag = document.createElement('script');
        tag.id   = 'ld-card';
        tag.type = 'application/ld+json';
        document.head.appendChild(tag);
      }
      tag.textContent = JSON.stringify(schema);
    },

    /** Upsert a <meta> tag by attribute+key (mirrors App.vue helper). */
    _setMeta(attr, key, value) {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    },
    async openProfile(traderId) {
      this.currentLogin = await getCurrentSession();
      this.profileTraderId = traderId;
      this.profileDialogOpen = true;
    },
    async proposeToTrader(trader) {
      const login = await getCurrentSession();
      if (!login) { this.$emit('requireAuth'); return; }
      this.currentLogin = login;
      this.proposingTo = trader;
      this.proposeDialogOpen = true;
    },
    async handleProposeFromProfile(user) {
      const login = await getCurrentSession();
      if (!login) { this.$emit('requireAuth'); return; }
      this.currentLogin = login;
      this.profileDialogOpen = false;
      this.proposingTo = user;
      this.proposeDialogOpen = true;
    },
  },
};
</script>
