<script setup>
// The trader profile itself: identity, stats, and the pile/wishlist/reviews
// tabs. Deliberately chrome-free — no dialog frame, no page frame, no footer
// actions — so TraderProfileDialog and TraderPage can both render it and never
// drift apart.
//
// Owns its own loading, because both hosts want the same fetch on the same
// trigger. `active` lets the dialog defer the fetch until it is actually
// opened; the page passes nothing and loads immediately.
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';
import CardBinder from '@/components/trade/CardBinder.vue';
import TraderAnnounces from '@/components/trade/TraderAnnounces.vue';
import TraderCommunities from '@/components/trade/TraderCommunities.vue';
import { countryByCode } from '@/lib/countries';
import { fetchUserTradePile, fetchUserWishlist, fetchWishlistNames } from '@/lib/matches';
import { timeAgo } from '@/lib/notifications';

const props = defineProps({
  traderId: { type: String,  default: null },
  // False keeps the fetch from firing (a closed dialog). Always true on a page.
  active:   { type: Boolean, default: true },
  // The host owns this: a page's trader name is its h1, but the same name in a
  // dialog must not be, or the document ends up with two h1s and the dialog
  // claims the page's own outline.
  headingLevel: { type: Number, default: 2, validator: (n) => n >= 1 && n <= 6 },
  // Whoever is looking. Needed to work out which of this trader's cards the
  // viewer actually wants, which is the question the page exists to answer.
  viewerId: { type: String, default: null },
});
const emit = defineEmits(['loaded', 'propose', 'auth-required']);

const { t } = useI18n();

const loading   = ref(false);
const loadError = ref(false); // the request failed, as opposed to "no such trader"
const profile   = ref(null);   // from get_trader_public_profile
const tradePile = ref([]);
const wishlist  = ref([]);
const reviews   = ref([]);
const activeTab = ref('pile'); // 'pile' | 'wish' | 'reviews'
let _loadToken = 0;

// Ties each tab to its panel for aria-controls / aria-labelledby. Scoped by
// trader id so two profiles on one document (page behind an open dialog)
// cannot mint colliding ids.
const uid = `tpb-${Math.random().toString(36).slice(2, 9)}`;
const tabId   = (k) => `${uid}-tab-${k}`;
const panelId = (k) => `${uid}-panel-${k}`;

const headingTag = computed(() => `h${props.headingLevel}`);

// Hosts need the name for their own chrome (page title, propose payload).
defineExpose({ profile, loading });

const country = computed(() => countryByCode(profile.value?.country_code));

const initials = computed(() => {
  const n = profile.value?.name?.trim();
  if (!n) return '?';
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
});

const scopeMeta = computed(() => ({
  local:     { label: t('account.localOnly'),        icon: 'mdi-map-marker' },
  national:  { label: t('account.nationalOnly'),     icon: 'mdi-flag-outline' },
  worldwide: { label: t('account.scopes.worldwide'), icon: 'mdi-earth' },
}[profile.value?.trade_scope ?? 'worldwide']));

async function load(id) {
  if (!id) return;
  const token = ++_loadToken;
  loading.value = true;
  loadError.value = false;
  profile.value = null;
  tradePile.value = [];
  wishlist.value  = [];
  reviews.value   = [];
  activeTab.value = 'pile';

  try {
    // The viewer's wishlist has to land before the trader's pile, because the
    // pile query is what tags each card as wanted. Own profile skips it: you
    // cannot match against yourself.
    const myWants = props.viewerId && props.viewerId !== id
      ? await fetchWishlistNames(props.viewerId)
      : [];
    if (token !== _loadToken) return;

    const [profileRes, pile, wish, reviewsRes] = await Promise.all([
      getClient().rpc('get_trader_public_profile', { p_trader_id: id }),
      fetchUserTradePile(id, myWants),
      fetchUserWishlist(id),
      getClient()
        .from('trader_rating')
        .select('score, comment, created_at, rater_id')
        .eq('ratee_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (token !== _loadToken) return; // stale — a newer load() was started
    // A failed request and a trader who does not exist both used to render the
    // same "not found", which told the user to stop looking when the real
    // answer might be "try again".
    if (profileRes.error) {
      console.error('get_trader_public_profile failed', profileRes.error);
      loadError.value = true;
      return;
    }
    profile.value   = profileRes.data?.[0] ?? null;
    tradePile.value = pile;
    wishlist.value  = wish;
    reviews.value   = await withRaters(reviewsRes.data ?? []);
    if (token !== _loadToken) return;
    emit('loaded', profile.value);
  } catch (e) {
    if (token !== _loadToken) return;
    console.error('TraderProfileBody: load failed', e);
    loadError.value = true;
  } finally {
    if (token === _loadToken) loading.value = false;
  }
}

/**
 * Attach each review's author. A bare list of stars from nobody in particular
 * is weak evidence; a name makes it a reference. Done as a second query rather
 * than a PostgREST embed so it does not depend on the FK constraint's
 * generated name, and it degrades to unnamed reviews rather than failing.
 */
async function withRaters(rows) {
  const ids = [...new Set(rows.map((r) => r.rater_id).filter(Boolean))];
  if (!ids.length) return rows;
  const { data, error } = await getClient()
    .from('Trader')
    .select('id, Name, avatar_url')
    .in('id', ids);
  if (error) { console.error('review raters failed', error); return rows; }
  const byId = Object.fromEntries((data ?? []).map((tr) => [tr.id, tr]));
  return rows.map((r) => ({ ...r, rater: byId[r.rater_id] ?? null }));
}

function retry() { load(props.traderId); }

watch(() => [props.active, props.traderId], ([on, id]) => {
  if (on && id) load(id);
}, { immediate: true });

// A restricted scope means this trader may not trade with you at all, so it is
// the one meta item that can change your next action.
const scopeRestricted = computed(() => ['local', 'national'].includes(profile.value?.trade_scope));

// The cards of theirs that the viewer is hunting. fetchUserTradePile tags these
// by name; this is the page's primary answer, so it leads the layout.
const matches = computed(() => tradePile.value.filter((c) => c.matchesMyWishlist));

// Matches only exist for a signed-in viewer looking at someone else, so this is
// really just "not my own profile" — but stated explicitly so the CTA can never
// appear on a page where it would dead-end.
const canPropose = computed(() => !!props.viewerId && props.viewerId !== props.traderId);

const completedTrades = computed(() => Number(profile.value?.completed_trades ?? 0));
const ratingCount     = computed(() => Number(profile.value?.rating_count ?? 0));

const tabItems = computed(() => [
  { key: 'pile',    label: t('library.tradePile'),     count: tradePile.value.length },
  { key: 'wish',    label: t('library.wishlist'),      count: wishlist.value.length  },
  { key: 'reviews', label: t('traderProfile.reviews'), count: Number(profile.value?.rating_count ?? 0) },
]);

// Roving tabindex with automatic activation, per the APG tabs pattern: the
// tablist is one tab stop, arrows move between tabs, and moving selects. That
// is the right variant here because switching panels is instant and cheap, so
// there is nothing to gain from making the user press Enter as well.
const tabList = ref(null);

async function focusTab(key) {
  activeTab.value = key;
  // nextTick, not requestAnimationFrame: focus has to follow the DOM update,
  // and rAF is tied to paint, which never comes in a backgrounded tab.
  await nextTick();
  tabList.value?.querySelector(`#${CSS.escape(tabId(key))}`)?.focus();
}

function onTabKeydown(e) {
  const keys = tabItems.value.map((x) => x.key);
  const i = keys.indexOf(activeTab.value);
  let next;
  if (e.key === 'ArrowRight')      next = keys[(i + 1) % keys.length];
  else if (e.key === 'ArrowLeft')  next = keys[(i - 1 + keys.length) % keys.length];
  else if (e.key === 'Home')       next = keys[0];
  else if (e.key === 'End')        next = keys[keys.length - 1];
  else return;
  e.preventDefault();
  focusTab(next);
}

</script>

<template>
  <!-- Skeleton -->
  <div v-if="loading" class="tpb">
    <div class="tpb-id">
      <div class="tpb-skel-avatar animate-pulse shrink-0" style="background: var(--c-skeleton)" />
      <div class="tpb-id__text tpb-skel-lines">
        <div class="h-6 rounded w-2/5 animate-pulse" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-3/5 animate-pulse" style="background: var(--c-skeleton)" />
      </div>
    </div>
    <div class="tpb-skel-cards flex gap-3 flex-wrap">
      <div v-for="i in 12" :key="i" class="animate-pulse rounded" style="width:68px;height:96px;background:var(--c-skeleton)" />
    </div>
  </div>

  <!-- Content -->
  <div v-else-if="profile" class="tpb">

    <!-- Identity -->
    <div class="tpb-id">
      <div class="tpb-id__avatar">
        <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" />
        <span v-else>{{ initials }}</span>
      </div>

      <div class="tpb-id__text">
        <component :is="headingTag" class="tpb-id__name">{{ profile.name ?? t('userCard.anonymous') }}</component>

        <!-- Everything the tabs below do not already say. Pile and wishlist
             counts live in the tab labels, so repeating them here would show
             the same number twice within 100px — and via a different query,
             which is a disagreement waiting to happen. -->
        <ul class="tpb-meta">
          <li>
            <template v-if="country">
              <span class="tpb-meta__flag">{{ country.flag }}</span>
              <span>{{ [profile.city, country.name].filter(Boolean).join(', ') }}</span>
            </template>
            <template v-else-if="profile.city">
              <v-icon icon="mdi-map-marker-outline" size="15" />
              <span>{{ profile.city }}</span>
            </template>
            <span v-else class="tpb-meta__absent">{{ t('traderProfile.noLocationSet') }}</span>
          </li>

          <!-- Scope only earns emphasis when it is a constraint: "worldwide"
               is the permissive default and says nothing you need to act on. -->
          <li :class="{ 'tpb-meta--notable': scopeRestricted }">
            <v-icon :icon="scopeMeta.icon" size="15" />
            <span>{{ scopeMeta.label }}</span>
          </li>

          <li>
            <v-icon icon="mdi-handshake-outline" size="15" />
            <span>{{ t('traderProfile.tradesCompleted', { count: completedTrades }, completedTrades) }}</span>
          </li>

          <!-- Omitted rather than shown as "—": an unrated trader has no score,
               and a dash reads as a broken value. The Reviews tab says 0. -->
          <li v-if="ratingCount > 0" class="tpb-meta--rating">
            <v-icon icon="mdi-star" size="15" />
            <span class="tpb-meta__score">{{ profile.avg_rating }}</span>
            <!-- Parenthesised: "4.3 3 reviews" runs two unrelated numbers
                 together and reads as one broken figure. -->
            <span>({{ t('traderProfile.reviewCount', { count: ratingCount }, ratingCount) }})</span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Match block: the page's primary answer, and the one place it raises
         its voice. Amethyst, matching UserCard's "they_have" kind, since this
         is the same signal in a different surface. Rendered only when there is
         something to say; an empty box here would cost every viewer the space
         to be told nothing. -->
    <section v-if="matches.length" class="tpb-match" :aria-labelledby="`${uid}-match`">
      <div class="tpb-match__head">
        <p :id="`${uid}-match`" class="tpb-match__title">
          <v-icon icon="mdi-cards-outline" size="17" />
          <strong>{{ t('traderProfile.matchTitle', { count: matches.length }, matches.length) }}</strong>
        </p>
        <!-- The action belongs here, at the moment of intent, not below three
             screens of binder. -->
        <button v-if="canPropose" type="button" class="tpb-match__cta" @click="emit('propose')">
          <v-icon icon="mdi-swap-horizontal" size="16" />
          {{ t('traderProfile.proposeTrade') }}
        </button>
      </div>
      <ul class="tpb-match__row">
        <li v-for="card in matches" :key="card.id">
          <v-tooltip
            :text="`${card.name}${card.extension ? ' · ' + card.extension : ''}${card.condition ? ' (' + card.condition + ')' : ''}`"
            location="top"
            open-on-click
          >
            <template #activator="{ props: tip }">
              <img
                v-bind="tip"
                :src="cardImage(card.image_id)"
                :alt="card.name"
                class="tpb-match__card"
                loading="lazy"
              />
            </template>
          </v-tooltip>
        </li>
      </ul>
    </section>

    <!-- Signed out, matching is impossible: the viewer has no wishlist to
         compare against. This takes the match block's slot rather than
         leaving a hole, because a shared link landing on a stranger's page is
         the single best moment to explain what the site is for. -->
    <section v-else-if="!viewerId && tradePile.length" class="tpb-signin">
      <p class="tpb-signin__lead">
        {{ t('traderProfile.signedOutLead', { count: tradePile.length }, tradePile.length) }}
      </p>
      <button type="button" class="tpb-signin__cta" @click="emit('auth-required')">
        {{ t('traderProfile.signedOutCta') }}
      </button>
    </section>

    <!-- What they are after: the other half of a trade. -->
    <TraderAnnounces :trader-id="traderId" />

    <!-- Where they play. Two people in the same shop are an easier trade. -->
    <TraderCommunities :trader-id="traderId" />

    <!-- Tab row -->
    <div
      ref="tabList"
      class="tpb-tabs"
      role="tablist"
      :aria-label="t('traderProfile.tabsLabel')"
      @keydown="onTabKeydown"
    >
      <button
        v-for="tab in tabItems"
        :key="tab.key"
        :id="tabId(tab.key)"
        role="tab"
        type="button"
        :aria-selected="activeTab === tab.key"
        :aria-controls="panelId(tab.key)"
        :tabindex="activeTab === tab.key ? 0 : -1"
        class="tpb-tab flex items-center gap-2 text-base font-semibold cursor-pointer transition-colors"
        :style="{
          color: activeTab === tab.key ? 'var(--c-text)' : 'var(--c-muted)',
          borderBottom: activeTab === tab.key ? '2px solid var(--c-accent)' : '2px solid transparent',
        }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span
          class="text-xs font-bold px-2 py-1 rounded-md tabular-nums"
          :style="activeTab === tab.key
            ? 'background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)'
            : 'background: color-mix(in srgb, var(--c-muted) 12%, transparent); color: var(--c-muted)'"
        >{{ tab.count }}</span>
      </button>
    </div>

    <!-- Trade pile -->
    <div v-if="activeTab === 'pile'" :id="panelId('pile')" role="tabpanel" :aria-labelledby="tabId('pile')" tabindex="0" class="tpb-panel">
      <CardBinder :cards="tradePile" :empty-label="t('traderProfile.noCardsForTrade')" />
    </div>

    <!-- Wishlist -->
    <div v-else-if="activeTab === 'wish'" :id="panelId('wish')" role="tabpanel" :aria-labelledby="tabId('wish')" tabindex="0" class="tpb-panel">
      <CardBinder :cards="wishlist" :empty-label="t('traderProfile.wishlistEmpty')" dim />
    </div>

    <!-- Reviews -->
    <div v-else-if="activeTab === 'reviews'" :id="panelId('reviews')" role="tabpanel" :aria-labelledby="tabId('reviews')" tabindex="0" class="tpb-panel">
      <ul v-if="reviews.length > 0" class="tpb-rev">
        <li v-for="r in reviews" :key="r.rater_id + r.created_at" class="tpb-rev__item">
          <div class="tpb-rev__line">
            <!-- Who said it. A row of stars from nobody in particular is weak
                 evidence; a name makes it a reference. -->
            <img v-if="r.rater?.avatar_url" :src="r.rater.avatar_url" alt="" class="tpb-rev__avatar" loading="lazy" />
            <span v-else class="tpb-rev__avatar tpb-rev__avatar--letter">
              {{ (r.rater?.Name || '?')[0].toUpperCase() }}
            </span>
            <span class="tpb-rev__who">{{ r.rater?.Name || t('userCard.anonymous') }}</span>

            <span class="tpb-rev__stars" :aria-label="t('traderProfile.reviewScore', { score: r.score })">
              <v-icon
                v-for="n in 5" :key="n"
                :icon="n <= r.score ? 'mdi-star' : 'mdi-star-outline'"
                size="15"
                aria-hidden="true"
              />
            </span>

            <!-- timeAgo needs `t`, or it silently renders English in every locale. -->
            <span class="tpb-rev__when">{{ timeAgo(r.created_at, t, { short: true }) }}</span>
          </div>
          <p v-if="r.comment" class="tpb-rev__comment">{{ r.comment }}</p>
        </li>
      </ul>
      <p v-else class="text-sm py-6 text-center" style="color: var(--c-muted)">{{ t('traderProfile.noReviewsYet') }}</p>
    </div>

  </div>

  <!-- Request failed. Distinct from "not found", and the only one of the two
       worth retrying, so it gets its own action rather than the host slot. -->
  <div v-else-if="loadError" class="tpb-dead" role="alert">
    <v-icon icon="mdi-wifi-off" size="36" />
    <p class="tpb-dead__msg">{{ t('traderProfile.loadFailed') }}</p>
    <button type="button" class="tpb-dead__action" @click="retry">
      <v-icon icon="mdi-refresh" size="16" />
      {{ t('traderProfile.retry') }}
    </button>
  </div>

  <!-- No such trader. The way out depends on where you are, so the host
       supplies it: a page sends you somewhere, a dialog just closes. -->
  <div v-else class="tpb-dead">
    <v-icon icon="mdi-account-off-outline" size="36" />
    <p class="tpb-dead__msg">{{ t('traderProfile.traderNotFound') }}</p>
    <slot name="not-found-action" />
  </div>
</template>

<style scoped>
/* ── Rhythm ────────────────────────────────────────────────────────────────
   Was gap-6 (24px) between every block, which gave the page one flat beat.
   Now: the meta line sits tight under the name because it is part of the same
   thought, and the tabs get real air because they start a new one. */
.tpb { display: flex; flex-direction: column; }
.tpb > .tpb-tabs { margin-top: 30px; }
.tpb-panel { margin-top: 20px; }
.tpb-skel-lines { gap: 10px; }
.tpb-skel-cards { margin-top: 30px; }

/* ── Match block ───────────────────────────────────────────────────────────
   Leads the page. Amethyst because UserCard already maps "they have your
   wants" to --c-trade; teal would be wrong, that is reserved for a confirmed
   mutual match, which this is not. */
.tpb-match {
  /* Hugs its content so a single match is a compact statement, not one card
     stranded in a wide empty box. Grows to full width as matches accumulate. */
  width: fit-content;
  max-width: 100%;
  margin-top: 26px;
  padding: 16px 18px 18px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--c-trade) 9%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 28%, transparent);
}
.tpb-match__head {
  margin: 0 0 12px; display: flex; align-items: center; gap: 24px;
  justify-content: space-between; flex-wrap: wrap;
}
.tpb-match__title {
  margin: 0; display: flex; align-items: center; gap: 8px;
  font-size: 0.9375rem; color: var(--c-text);
}
.tpb-match__title .v-icon { color: var(--c-trade); }
.tpb-match__title strong { font-weight: 700; }
.tpb-match__cta {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 36px; padding: 0 14px; border-radius: 10px;
  background: var(--c-trade); color: #fff; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; white-space: nowrap;
  transition: opacity 0.15s ease;
}
.tpb-match__cta:hover { opacity: 0.88; }
.tpb-match__cta:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (pointer: coarse) { .tpb-match__cta { min-height: 44px; } }
.tpb-match__row {
  list-style: none; margin: 0; padding: 0 0 4px;
  display: flex; gap: 10px; overflow-x: auto;
  scrollbar-width: thin; scrollbar-color: color-mix(in srgb, var(--c-trade) 40%, transparent) transparent;
}
.tpb-match__row::-webkit-scrollbar { height: 3px; }
.tpb-match__row::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--c-trade) 40%, transparent); border-radius: 99px;
}
.tpb-match__card {
  height: 104px; width: 74px; flex-shrink: 0; display: block;
  border-radius: 5px; object-fit: contain; background: var(--c-surface-2);
  outline: 1.5px solid color-mix(in srgb, var(--c-trade) 55%, transparent);
  transition: transform 0.15s cubic-bezier(0.22,1,0.36,1);
}
.tpb-match__card:hover { transform: translateY(-2px) scale(1.05); }

@media (max-width: 560px) {
  .tpb-match { margin-top: 20px; padding: 13px 14px 15px; }
}

/* ── Meta line ─────────────────────────────────────────────────────────────
   Replaces four bordered stat tiles. They were cards inside a card, all four
   the same size and shape, and the two loudest numbers in them were repeated
   verbatim by the tab labels underneath. As a text line the facts read in one
   pass and the name is unambiguously the largest thing on the page.

   Icons carry the only colour here, so no small text sits on a tinted surface:
   the old 12px labels needed 4.5:1 against surface-2 and three of the eight
   label/theme combinations missed it. */
.tpb-meta {
  list-style: none; margin: 7px 0 0; padding: 0;
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 3px 18px;
  font-size: 0.9375rem; color: var(--c-muted);
}
.tpb-meta li { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.tpb-meta .v-icon { color: var(--c-muted); flex-shrink: 0; }
.tpb-meta__flag { font-size: 1rem; line-height: 1; }
.tpb-meta__absent { opacity: 0.6; }

/* Emphasis by weight and text colour, not by another saturated hue. */
.tpb-meta--notable { color: var(--c-text); font-weight: 600; }
.tpb-meta--notable .v-icon { color: var(--c-trade); }

/* Amber star matches the seller rating elsewhere in the app
   (AnnounceDetailDialog, AnnounceCard), rather than inventing a colour or
   spending teal, which is reserved for confirmed mutual matches. */
.tpb-meta--rating .v-icon { color: #f59e0b; }
.tpb-meta__score { color: var(--c-text); font-weight: 700; font-variant-numeric: tabular-nums; }

/* ── Identity ──────────────────────────────────────────────────────────────
   Was a single non-wrapping flex row sized for a 720px dialog. On a page at
   375px the avatar and the scope badge left the name about 50px, which
   truncated "TinyHex" to "Ti…". Now a wrapping row: the badge is the piece
   that drops to its own line, because it is the least important of the three
   and the only one that can leave without breaking the avatar/name pairing. */
.tpb-id {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.tpb-id__avatar {
  width: 80px; height: 80px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 16px; overflow: hidden;
  font-size: 1.875rem; font-weight: 700; user-select: none;
  background: color-mix(in srgb, var(--c-trade) 18%, transparent);
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
}
.tpb-id__avatar img { width: 100%; height: 100%; object-fit: cover; }

/* Grows to fill, but may shrink below its content width — without min-width:0
   a long name would push the badge off the row instead of wrapping. */
.tpb-id__text { display: flex; flex-direction: column; min-width: 0; flex: 1 1 200px; }

/* Wraps rather than truncates: a name is the one thing on this page that must
   be readable in full. Capped at two lines so a pathological handle cannot
   push the stats off-screen, and `anywhere` so an unbroken string still
   breaks instead of overflowing. */
.tpb-id__name {
  /* Now a real heading element, so it arrives with UA margins and its own
     font-size to override. */
  margin: 0;
  font-size: 1.5rem; font-weight: 700; line-height: 1.25;
  color: var(--c-text);
  overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* Content-driven, not a device guess: below this the three-across row can no
   longer give the name a readable column (80px avatar + ~105px badge + gaps
   eats ~225px of it). */
@media (max-width: 560px) {
  /* The meta line stacks here, so centring would float the avatar against a
     tall text column and pull it away from the name it belongs to. */
  .tpb-id { gap: 14px; align-items: flex-start; }
  .tpb-id__avatar { width: 60px; height: 60px; border-radius: 14px; font-size: 1.5rem; }
  .tpb-id__name { font-size: 1.375rem; }
  /* Tighter column gap so two short facts can share a line instead of each
     taking its own; the meta line is four items and would otherwise become a
     four-line stack on a phone. */
  .tpb-meta { font-size: 0.875rem; gap: 2px 13px; }
  .tpb > .tpb-tabs { margin-top: 24px; }
}

/* ── Tabs ──────────────────────────────────────────────────────────────────
   Overflowed silently at 375px (382px of tabs in a 276px box, overflow
   visible), so "Reviews" was clipped and unreachable. Scrolls now, and the
   buttons refuse to compress into unreadability. */
.tpb-tabs {
  display: flex;
  gap: 0;
  /* The rule was a border-bottom plus a -1px margin on each tab to overhang it.
     Inside a scroll container that 1px overhang makes scrollHeight exceed
     clientHeight, which grows a stray vertical scrollbar. An inset shadow draws
     the same line without occupying layout, so nothing overhangs. */
  box-shadow: inset 0 -1px 0 var(--c-border);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
  -webkit-overflow-scrolling: touch;
}
.tpb-tabs::-webkit-scrollbar { height: 3px; }
.tpb-tabs::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.tpb-tab { flex-shrink: 0; padding: 16px 20px; white-space: nowrap; }

/* Tighter tabs on narrow screens so all three usually fit without scrolling;
   the scroll above is the safety net for long translations, not the norm. */
@media (max-width: 560px) {
  .tpb-tab { padding: 14px 13px; font-size: 0.9375rem; }
}

/* Touch devices get the 44px target PRODUCT.md asks for; pointer devices keep
   the tighter rhythm. */
@media (pointer: coarse) {
  .tpb-tab { min-height: 48px; }
}

/* Tracks .tpb-id__avatar at both sizes so nothing jumps when the profile lands. */
.tpb-skel-avatar { width: 80px; height: 80px; border-radius: 16px; }
@media (max-width: 560px) { .tpb-skel-avatar { width: 60px; height: 60px; border-radius: 14px; } }


/* ── Signed-out invitation ─────────────────────────────────────────────────
   Deliberately quieter than the match block: that one reports a fact worth
   acting on, this one asks for something. Same slot, less voice. */
.tpb-signin {
  margin-top: 26px; padding: 15px 18px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 18px; flex-wrap: wrap;
  border-radius: 14px;
  border: 1px solid var(--c-border);
  background: var(--c-surface-2);
}
.tpb-signin__lead { margin: 0; font-size: 0.9375rem; color: var(--c-text); }
.tpb-signin__cta {
  flex-shrink: 0;
  display: inline-flex; align-items: center;
  min-height: 38px; padding: 0 16px; border-radius: 10px;
  background: var(--c-trade); color: #fff; border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; white-space: nowrap;
  transition: opacity 0.15s ease;
}
.tpb-signin__cta:hover { opacity: 0.88; }
.tpb-signin__cta:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (pointer: coarse) { .tpb-signin__cta { min-height: 44px; } }
@media (max-width: 560px) {
  .tpb-signin { margin-top: 20px; }
  .tpb-signin__cta { width: 100%; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) { .tpb-signin__cta { transition: none; } }

/* ── Reviews ───────────────────────────────────────────────────────────────
   Most ratings carry no comment, so the score line has to stand on its own
   rather than look like a card missing its body. Bordered rows, no tiles. */
.tpb-rev { list-style: none; margin: 0; padding: 0; }
.tpb-rev__item { padding: 11px 2px; border-bottom: 1px solid var(--c-border); }
.tpb-rev__item:first-child { border-top: 1px solid var(--c-border); }
.tpb-rev__line { display: flex; align-items: center; gap: 9px; }
.tpb-rev__avatar {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0;
  object-fit: cover; background: var(--c-surface-2);
}
.tpb-rev__avatar--letter {
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 800; color: var(--c-muted);
}
.tpb-rev__who {
  font-size: 13.5px; font-weight: 700; color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
/* Amber matches the seller rating elsewhere in the app. Teal was wrong here:
   it is reserved for a confirmed mutual match. */
.tpb-rev__stars { display: inline-flex; gap: 1px; margin-left: auto; flex-shrink: 0; }
.tpb-rev__stars .v-icon { color: #f59e0b; }
.tpb-rev__when {
  flex-shrink: 0; font-size: 12px; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}
.tpb-rev__comment {
  margin: 7px 0 0 31px; font-size: 13.5px; line-height: 1.55; color: var(--c-text);
}
@media (max-width: 560px) {
  .tpb-rev__comment { margin-left: 0; }
}

/* ── Focus ─────────────────────────────────────────────────────────────────
   The tab is one stop and the panel is the next, so both need a visible ring:
   a keyboard user arrowing through tabs and then tabbing into the card grid
   must never lose track of where they are. */
.tpb-tab:focus-visible,
.tpb-panel:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: -2px;
  border-radius: 8px;
}

/* ── Dead ends ─────────────────────────────────────────────────────────────
   Both terminal states. Neither used to offer a way out, which left a bad URL
   as a wall. */
.tpb-dead {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; padding: 64px 20px; text-align: center;
}
.tpb-dead .v-icon { color: var(--c-muted); }
.tpb-dead__msg { margin: 0; font-size: 0.875rem; color: var(--c-muted); }
.tpb-dead__action {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 16px; border-radius: 11px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.tpb-dead__action:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.tpb-dead__action .v-icon { color: var(--c-trade); }
.tpb-dead__action:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (pointer: coarse) { .tpb-dead__action { min-height: 48px; } }

/* ── Reduced motion ────────────────────────────────────────────────────────
   Matches the targeted approach used elsewhere (CommunityProfile, SideNav):
   kill the specific decorative animations, not every transition on the page.
   The skeleton pulse is the worst offender here, running on a dozen elements
   at once. */
@media (prefers-reduced-motion: reduce) {
  .animate-pulse { animation: none; }
  .tpb-match__card { transition: none; }
  .tpb-match__card:hover { transform: none; }
  .tpb-match__cta { transition: none; }
  .tpb-tab { transition: none; }
  .tpb-dead__action { transition: none; }
}
</style>
