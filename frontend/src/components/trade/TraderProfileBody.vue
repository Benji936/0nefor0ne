<script setup>
/**
 * One side of the table.
 *
 * This page was built as a profile — a face, a place, a row of counts, three
 * tabs — and the data says a profile is not what anybody arrives for. Ten of
 * the fourteen accounts in the database have an empty trade pile, an empty
 * wishlist, no completed trades and no reviews, so the modal profile rendered
 * as four zeroes and a sentence: "0 trades completed", "Trade pile 0",
 * "Wishlist 0", "Reviews 0", "No cards listed for trade." Two thirds of a
 * screen of nothing, with no way to tell an account that arrived yesterday
 * from one that was abandoned a year ago.
 *
 * The question a visitor actually brings is never "who is this" — it is "is
 * there a trade here for me", and the app already knows how to draw that. The
 * matches list draws every trader as a seam with two arms, what you get and
 * what they get, lit only where cards actually travel. The profile threw that
 * away and showed a one-directional strip: their cards you want, and nothing
 * whatsoever about your cards they want, even though their wishlist is fetched
 * on the same load and rendered in a tab a few pixels below. Three of the six
 * live matching relationships in this database run in that unshown direction,
 * so for half of them the page reported no overlap while the Trade Center
 * reported one.
 *
 * So the page opens on the table: their side, your side, and the seam where
 * the two meet, with the propose button sitting in it. Amethyst for the pile
 * coming toward you, pink for the pile they want off you, teal only when both
 * arms are live — that is the mutual match, and teal marks nothing else
 * (DESIGN.md, The Agreement Rule). A page with nothing on either side says so
 * in one sentence and offers the way out, instead of three tabs of zeroes.
 *
 * Chrome-free by design, so TraderProfileDialog and TraderPage both render it
 * and never drift apart.
 */
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { getClient } from '@/lib/supabaseClient';
import { cardImage } from '@/lib/cardImage';
import CardBinder from '@/components/trade/CardBinder.vue';
import TraderAnnounces from '@/components/trade/TraderAnnounces.vue';
import TraderCommunities from '@/components/trade/TraderCommunities.vue';
import { countryByCode } from '@/lib/countries';
import {
  fetchUserTradePile, fetchUserWishlist, fetchWishlistNames, fetchTradePileNames,
} from '@/lib/matches';
import { joinedAgo } from '@/lib/people';
import { timeAgo } from '@/lib/notifications';
import { tradeTable } from '@/lib/traderMatch';

const props = defineProps({
  traderId: { type: String,  default: null },
  // False keeps the fetch from firing (a closed dialog). Always true on a page.
  active:   { type: Boolean, default: true },
  // The host owns this: a page's trader name is its h1, but the same name in a
  // dialog must not be, or the document ends up with two h1s and the dialog
  // claims the page's own outline.
  headingLevel: { type: Number, default: 2, validator: (n) => n >= 1 && n <= 6 },
  // Whoever is looking. Needed to work out which way cards would travel, which
  // is the question the page exists to answer.
  viewerId: { type: String, default: null },
});
const emit = defineEmits(['loaded', 'propose', 'auth-required']);

const { t } = useI18n();
const route = useRoute();
const locale = computed(() => route.params.locale || 'en');

// Starts true: "we have not looked yet" is a skeleton, not a missing trader.
// With it false, a host that defers the fetch — TraderPage waiting for the
// session to resolve — rendered the not-found dead end for the split second
// before the first load began.
const loading   = ref(true);
const loadError = ref(false); // the request failed, as opposed to "no such trader"
const profile   = ref(null);
const tradePile = ref([]);
const wishlist  = ref([]);
const reviews   = ref([]);
// The two name lists that decide which way cards travel. Fetched once per load
// alongside everything else.
const myWishNames = ref([]);
const myPileNames = ref([]);
const viewerCountry = ref(null);
// Whether the two sections that own their own fetch found anything. The blank
// state has to know, or it would tell a trader with four live listings that
// they have nothing going on.
const announceCount  = ref(0);
const communityCount = ref(0);

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

async function load(id) {
  if (!id) return;
  const token = ++_loadToken;
  loading.value = true;
  loadError.value = false;
  profile.value = null;
  tradePile.value = [];
  wishlist.value  = [];
  reviews.value   = [];
  myWishNames.value = [];
  myPileNames.value = [];
  viewerCountry.value = null;
  announceCount.value = 0;
  communityCount.value = 0;
  activeTab.value = 'pile';

  // You cannot trade with yourself, so a viewer looking at their own page needs
  // none of the three viewer-side queries.
  const asViewer = props.viewerId && props.viewerId !== id;

  try {
    // The viewer's two name lists have to land before the trader's pile,
    // because the pile query is what tags each card as wanted for the binder's
    // filter. Issued together — they are the same shape and the same cost.
    const [myWants, myHaves, meRes] = asViewer
      ? await Promise.all([
          fetchWishlistNames(props.viewerId),
          fetchTradePileNames(props.viewerId),
          // Only used to say "your account is in X" next to a trader who will
          // not trade outside their own country.
          getClient().from('Trader').select('country_code').eq('id', props.viewerId).maybeSingle(),
        ])
      : [[], [], null];
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
    profile.value     = profileRes.data?.[0] ?? null;
    tradePile.value   = pile;
    wishlist.value    = wish;
    myWishNames.value = myWants;
    myPileNames.value = myHaves;
    viewerCountry.value = meRes?.data?.country_code ?? null;
    reviews.value     = await withRaters(reviewsRes.data ?? []);
    if (token !== _loadToken) return;
    // Open on a tab that has something in it. The pile is the right default
    // when there is one, but it is empty for ten of the fourteen accounts here
    // and one of those has sixteen cards sitting in the tab next door — so the
    // page opened on "No cards listed for trade" with the answer one click away.
    activeTab.value = firstFilledTab();
    emit('loaded', profile.value);
  } catch (e) {
    if (token !== _loadToken) return;
    console.error('TraderProfileBody: load failed', e);
    loadError.value = true;
  } finally {
    if (token === _loadToken) loading.value = false;
  }
}

function firstFilledTab() {
  if (tradePile.value.length) return 'pile';
  if (wishlist.value.length)  return 'wish';
  if (reviews.value.length)   return 'reviews';
  return 'pile';
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

// An array of getters, not a getter returning an array: the second form hands
// Vue a fresh array every time, which never compares equal, so the profile
// refetched on any unrelated re-evaluation — including Supabase's own initial
// auth event re-setting the viewer id to the value it already had.
watch([() => props.active, () => props.traderId, () => props.viewerId], ([on, id]) => {
  if (on && id) load(id);
  // Live and pointed at nothing: that is a bad URL, and it has to settle rather
  // than hold a skeleton open forever.
  else if (on) { loading.value = false; profile.value = null; }
}, { immediate: true });

// ── The table ──────────────────────────────────────────────────────────────

// Matches only exist for a signed-in viewer looking at somebody else, so this
// is really "not my own profile" — stated explicitly so the propose action can
// never appear on a page where it would dead-end.
const canPropose = computed(() => !!props.viewerId && props.viewerId !== props.traderId);

const table = computed(() => tradeTable({
  theirPile:     tradePile.value,
  theirWishlist: wishlist.value,
  myWishNames:   myWishNames.value,
  myPileNames:   myPileNames.value,
}));

// Which way cards actually move. The seam reads straight off these, exactly as
// it does on the matches list: an arm is drawn solid only when something
// travels along it, so a one-way trade looks one-way rather than being
// labelled one-way. That is why there is no verdict line any more — a band
// reading "ONE-WAY" over a seam already saying it was a caption for a picture.
const incoming = computed(() => table.value.youGet.length > 0);
const outgoing = computed(() => table.value.youGive.length > 0);
const mutual   = computed(() => incoming.value && outgoing.value);

const seamGlyph = computed(() => {
  if (mutual.value) return 'mdi-swap-horizontal';
  if (incoming.value) return 'mdi-arrow-left';
  if (outgoing.value) return 'mdi-arrow-right';
  return 'mdi-minus';
});

// ── Facts ──────────────────────────────────────────────────────────────────

const completedTrades = computed(() => Number(profile.value?.completed_trades ?? 0));
const ratingCount     = computed(() => Number(profile.value?.rating_count ?? 0));

// How long they have been here. For an account with nothing in it this is the
// only fact that separates "arrived on Tuesday" from "gave up in March", and
// the page never asked the database for it.
// The bare interval ("2 months ago"), reused by two sentences. Kept apart from
// the sentences themselves so neither has to lowercase a translated string to
// drop it mid-clause.
const agoText = computed(() => {
  const ago = joinedAgo(profile.value?.created_at);
  if (!ago) return null;
  if (ago.unit === 'today') return t('people.ago.today');
  return t(`people.ago.${ago.unit}`, { n: ago.count }, ago.count);
});
const joinedText = computed(() =>
  agoText.value ? t('traderProfile.joined', { when: agoText.value }) : null);

/**
 * Where this trader will and will not trade — but only when it restricts them,
 * and only for somebody who could otherwise propose. "Worldwide" is the
 * permissive default and tells you nothing you can act on; "national only"
 * from another country means the proposal you were about to write cannot
 * happen. Four of the fourteen accounts here carry a restricted scope.
 */
const scopeNote = computed(() => {
  const scope = profile.value?.trade_scope;
  if (!canPropose.value || !scope || scope === 'worldwide') return null;

  const where = scope === 'local'
    ? (profile.value?.city?.trim() || country.value?.name)
    : country.value?.name;
  if (!where) return t(scope === 'local' ? 'account.localOnly' : 'account.nationalOnly');
  return t(scope === 'local' ? 'traderProfile.scopeLocal' : 'traderProfile.scopeNational', { place: where });
});

// Said as a second sentence rather than folded into the first, because it is a
// fact about the reader and not about the trader.
const scopeMismatch = computed(() => {
  if (!scopeNote.value || !viewerCountry.value || !profile.value?.country_code) return null;
  if (viewerCountry.value === profile.value.country_code) return null;
  const mine = countryByCode(viewerCountry.value);
  return mine ? t('traderProfile.scopeElsewhere', { place: mine.name }) : null;
});

// Whether there are two piles to lay a trade across. Without them the table is
// guaranteed to be empty on both sides, so it would be a box drawn around a
// question nobody asked.
const hasLists = computed(() => tradePile.value.length > 0 || wishlist.value.length > 0);

// The tab strip earns its place only when a tab has something behind it. Three
// tabs reading 0 · 0 · 0 over an empty panel is chrome around nothing.
const hasTabs = computed(() => hasLists.value || ratingCount.value > 0);

// Nothing in the binder, nothing on the wishlist, nothing said about them, and
// neither of the two self-fetching sections found anything either. Ten of the
// fourteen accounts here land in exactly this state. The two counts come from
// the children because they own their own fetch — without them this would tell
// a trader with four live listings that they have nothing going on.
const barren = computed(() =>
  !hasTabs.value && !announceCount.value && !communityCount.value);

// The seam is a summary, not a browser: past this a side becomes a wall, and
// the binder below already holds the full list behind its own filter. Higher
// than the matches list's seven, because a page has room a row in a list does
// not.
const ARM_MAX = 12;

const tabItems = computed(() => [
  { key: 'pile',    label: t('library.tradePile'),     count: tradePile.value.length, tone: 'trade'  },
  { key: 'wish',    label: t('library.wishlist'),      count: wishlist.value.length,  tone: 'accent' },
  { key: 'reviews', label: t('traderProfile.reviews'), count: ratingCount.value,      tone: 'plain'  },
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

function cardTitle(card) {
  const bits = [card.name];
  if (card.extension) bits.push(card.extension);
  const base = bits.join(' · ');
  return card.condition ? `${base} (${card.condition})` : base;
}
</script>

<template>
  <!-- Skeleton -->
  <div v-if="loading" class="tpb">
    <div class="tpb-plate">
      <div class="tpb-skel-face animate-pulse shrink-0" style="background: var(--c-skeleton)" />
      <div class="tpb-plate__text tpb-skel-lines">
        <div class="h-8 rounded w-2/5 animate-pulse" style="background: var(--c-skeleton)" />
        <div class="h-4 rounded w-3/5 animate-pulse" style="background: var(--c-skeleton)" />
      </div>
    </div>
    <div class="tpb-skel-cards flex gap-3 flex-wrap">
      <div v-for="i in 12" :key="i" class="animate-pulse rounded" style="width:68px;height:96px;background:var(--c-skeleton)" />
    </div>
  </div>

  <!-- Content -->
  <div v-else-if="profile" class="tpb" :data-kind="table.kind">

    <!-- ── Who ────────────────────────────────────────────────────────── -->
    <header class="tpb-plate">
      <div class="tpb-face">
        <img v-if="profile.avatar_url" :src="profile.avatar_url" alt="" />
        <span v-else>{{ initials }}</span>
      </div>

      <div class="tpb-plate__text">
        <component :is="headingTag" class="tpb-name">{{ profile.name ?? t('userCard.anonymous') }}</component>

        <p class="tpb-where">
          <template v-if="country">
            <span class="tpb-where__flag">{{ country.flag }}</span>
            <span>{{ [profile.city, country.name].filter(Boolean).join(', ') }}</span>
          </template>
          <template v-else-if="profile.city">
            <v-icon icon="mdi-map-marker-outline" size="15" />
            <span>{{ profile.city }}</span>
          </template>
          <span v-else class="tpb-where--absent">{{ t('traderProfile.noLocationSet') }}</span>
        </p>

        <!-- The record, in the collector's register: monospace, uppercase,
             widely tracked (DESIGN.md, The Mono Identifier Rule), matching the
             ledger lines on the deck and community pages. -->
        <p class="tpb-ledger">
          <span v-if="joinedText">{{ joinedText }}</span>
          <span v-if="completedTrades > 0">
            {{ t('traderProfile.tradesCompleted', { count: completedTrades }, completedTrades) }}
          </span>
          <span v-if="ratingCount > 0" class="tpb-ledger__rated">
            <v-icon icon="mdi-star" size="13" aria-hidden="true" />
            <span class="tpb-ledger__score">{{ profile.avg_rating }}</span>
            <span>({{ t('traderProfile.reviewCount', { count: ratingCount }, ratingCount) }})</span>
          </span>
          <span v-else>{{ t('traderProfile.unrated') }}</span>
        </p>
      </div>

      <!-- Where the matches list puts it: on the identity line, not three
           screens below the binder. -->
      <button v-if="canPropose && !barren" type="button" class="tpb-propose" @click="emit('propose')">
        <v-icon icon="mdi-swap-horizontal" size="17" />
        {{ t('traderProfile.proposeTrade') }}
      </button>
    </header>

    <!-- ── The table ──────────────────────────────────────────────────────
         Both sides of the trade, and the seam where they meet. Drawn whenever
         somebody could actually propose, including when the answer is "nothing
         lines up" — that is an answer to the page's question, and drawing
         nothing would leave the reader to guess whether it had been asked. -->
    <!-- ── The table ──────────────────────────────────────────────────────
         Give, join, get — the same seam the matches list draws for every
         trader, at page scale and with the real piles in it. The two sides are
         tinted in their own colour and the arms between them are dashed until
         cards actually travel, so the shape of the trade is legible before any
         label is read. -->
    <section
      v-if="canPropose && hasLists"
      class="tpb-table"
      :aria-label="t('traderProfile.tableLabel')"
    >
      <div class="tpb-axis">
        <div class="tpb-side" data-side="get">
          <p class="tpb-axis__label">
            {{ t('userCard.youGet') }}
            <span v-if="incoming" class="tpb-axis__n tabular-nums">{{ table.youGet.length }}</span>
          </p>
          <div v-if="incoming" class="tpb-thumbs">
            <img
              v-for="card in table.youGet.slice(0, ARM_MAX)"
              :key="`get-${card.id}`"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              :title="cardTitle(card)"
              class="tpb-thumb"
              loading="lazy"
              decoding="async"
            />
            <span v-if="table.youGet.length > ARM_MAX" class="tpb-more tabular-nums">
              +{{ table.youGet.length - ARM_MAX }}
            </span>
          </div>
          <p v-else class="tpb-nothing">{{ t('userCard.emptyYouGet') }}</p>
        </div>

        <div class="tpb-seam" :class="{ 'is-mutual': mutual }">
          <span class="tpb-seam__arm" :class="{ 'is-live': incoming }" />
          <span class="tpb-seam__glyph"><v-icon :icon="seamGlyph" size="17" /></span>
          <span class="tpb-seam__arm" :class="{ 'is-live': outgoing }" />
        </div>

        <div class="tpb-side" data-side="give">
          <p class="tpb-axis__label">
            {{ t('userCard.theyGet') }}
            <span v-if="outgoing" class="tpb-axis__n tabular-nums">{{ table.youGive.length }}</span>
          </p>
          <div v-if="outgoing" class="tpb-thumbs">
            <img
              v-for="card in table.youGive.slice(0, ARM_MAX)"
              :key="`give-${card.id}`"
              :src="cardImage(card.image_id)"
              :alt="card.name"
              :title="cardTitle(card)"
              class="tpb-thumb"
              loading="lazy"
              decoding="async"
            />
            <span v-if="table.youGive.length > ARM_MAX" class="tpb-more tabular-nums">
              +{{ table.youGive.length - ARM_MAX }}
            </span>
          </div>
          <p v-else class="tpb-nothing">{{ t('userCard.emptyTheyGet') }}</p>
        </div>
      </div>

      <!-- A constraint on the trade, so it sits under the trade rather than in
           the facts about the person. -->
      <p v-if="scopeNote" class="tpb-note">
        <v-icon icon="mdi-map-marker-radius-outline" size="14" aria-hidden="true" />
        <span>{{ scopeNote }}<template v-if="scopeMismatch"> {{ scopeMismatch }}</template></span>
      </p>
    </section>

    <!-- Signed out, there is no table to draw: the viewer has no lists to
         compare against. This takes the table's slot rather than leaving a
         hole, because a shared link landing on a stranger's page is the single
         best moment to explain what the site is for. -->
    <section v-else-if="!viewerId && tradePile.length" class="tpb-signin">
      <p class="tpb-signin__lead">
        {{ t('traderProfile.signedOutLead', { count: tradePile.length }, tradePile.length) }}
      </p>
      <button type="button" class="tpb-signin__cta" @click="emit('auth-required')">
        {{ t('traderProfile.signedOutCta') }}
      </button>
    </section>

    <!-- What they are after: the other half of a trade. -->
    <TraderAnnounces :trader-id="traderId" @count="announceCount = $event" />

    <!-- Where they play. Two people in the same shop are an easier trade. -->
    <TraderCommunities :trader-id="traderId" @count="communityCount = $event" />

    <!-- ── Nothing here ───────────────────────────────────────────────────
         Ten of fourteen accounts. Says so once and points somewhere, instead
         of three tabs reading zero over an empty panel. -->
    <section v-if="barren" class="tpb-blank">
      <p class="tpb-blank__lead">{{ t('traderProfile.blankTitle') }}</p>
      <p class="tpb-blank__body">
        {{ agoText
           ? t('traderProfile.blankBodyJoined', { name: profile.name ?? t('userCard.anonymous'), when: agoText })
           : t('traderProfile.blankBody', { name: profile.name ?? t('userCard.anonymous') }) }}
      </p>
      <!-- The Trade Center's match list needs a session, so a signed-out
           visitor is sent to sign in rather than through a door that is locked
           on the other side. -->
      <router-link v-if="viewerId" class="tpb-blank__cta" :to="{ name: 'TradeCenter', params: { locale, tab: 'matches' } }">
        {{ t('traderProfile.blankCta') }}
        <v-icon icon="mdi-arrow-right" size="15" aria-hidden="true" />
      </router-link>
      <button v-else type="button" class="tpb-blank__cta" @click="emit('auth-required')">
        {{ t('traderProfile.signedOutCta') }}
        <v-icon icon="mdi-arrow-right" size="15" aria-hidden="true" />
      </button>
    </section>

    <template v-if="hasTabs">
      <!-- Tab row. Each tab is coloured by which side of the trade its panel
           holds — their binder is what you could get, their wishlist is what
           they want off you — so the strip repeats the arms above rather than
           painting all three the same. -->
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
          class="tpb-tab"
          :data-tone="tab.tone"
          :aria-selected="activeTab === tab.key"
          :aria-controls="panelId(tab.key)"
          :tabindex="activeTab === tab.key ? 0 : -1"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span class="tpb-tab__n tabular-nums">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Trade pile -->
      <div v-if="activeTab === 'pile'" :id="panelId('pile')" role="tabpanel" :aria-labelledby="tabId('pile')" tabindex="0" class="tpb-panel">
        <CardBinder :cards="tradePile" :empty-label="t('traderProfile.noCardsForTrade')" />
      </div>

      <!-- Wishlist. Pink, because these are cards somebody wants. -->
      <div v-else-if="activeTab === 'wish'" :id="panelId('wish')" role="tabpanel" :aria-labelledby="tabId('wish')" tabindex="0" class="tpb-panel tpb-panel--want">
        <CardBinder :cards="wishlist" :empty-label="t('traderProfile.wishlistEmpty')" />
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
        <p v-else class="tpb-rev__empty">{{ t('traderProfile.noReviewsYet') }}</p>
      </div>
    </template>

  </div>

  <!-- Request failed. Distinct from "not found", and the only one of the two
       worth retrying, so it gets its own action rather than the host slot. -->
  <div v-else-if="loadError" class="tpb-dead" role="alert">
    <v-icon icon="mdi-wifi-off" size="34" />
    <p class="tpb-dead__msg">{{ t('traderProfile.loadFailed') }}</p>
    <button type="button" class="tpb-dead__action" @click="retry">
      <v-icon icon="mdi-refresh" size="16" />
      {{ t('traderProfile.retry') }}
    </button>
  </div>

  <!-- No such trader. The way out depends on where you are, so the host
       supplies it: a page sends you somewhere, a dialog just closes. -->
  <div v-else class="tpb-dead">
    <v-icon icon="mdi-account-off-outline" size="34" />
    <p class="tpb-dead__msg">{{ t('traderProfile.traderNotFound') }}</p>
    <slot name="not-found-action" />
  </div>
</template>

<style scoped>
/* ── Tokens ────────────────────────────────────────────────────────────────
   The landing page's register, scoped to this page and prefixed so it cannot
   collide with the equivalents on the community, deck and account pages. Custom
   properties inherit through scoped-style boundaries, so the children —
   CardBinder, TraderAnnounces, TraderCommunities — resolve these too.

   The star colour is the one exception and is documented on the declaration. */
.tpb {
  --tpb-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --tpb-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --tpb-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --tpb-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  /* The app's rating amber, centralised here rather than repeated as a raw hex
     the way it was twice in this file. Two values, because the one everywhere
     else uses reads at 1.95:1 on the light theme's white — under the 3:1 floor
     a graphical object needs, and the star is the only thing carrying the
     score. The dark value is the app's existing #F59E0B, unchanged. */
  --tpb-star: #B45309;

  /* Which way cards move, as one colour the whole page can read: the seam
     glyph, the propose button and every focus ring on this surface take it, so
     the page agrees with itself about what kind of trade this is. */
  --kind: var(--c-trade);

  display: flex; flex-direction: column;
}
html.dark .tpb { --tpb-star: #F59E0B; }

.tpb[data-kind="you_get"]  { --kind: var(--c-trade); }
.tpb[data-kind="you_give"] { --kind: var(--c-accent); }
.tpb[data-kind="mutual"]   { --kind: var(--c-mutual); }
.tpb[data-kind="none"]     { --kind: var(--c-muted); }

/* ── Who ───────────────────────────────────────────────────────────────────
   Wrapping row: the text column may shrink, so a long handle wraps under the
   avatar instead of squeezing it off the line. */
/* Avatar, identity, action — the matches row's head, at page scale. The
   button drops to its own line before the name is ever squeezed. */
.tpb-plate { display: flex; align-items: center; gap: 18px 20px; flex-wrap: wrap; }

.tpb-face {
  width: 76px; height: 76px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 20px; overflow: hidden;
  font-size: 1.75rem; font-weight: 700; letter-spacing: -0.02em; user-select: none;
  background: color-mix(in srgb, var(--c-trade) 18%, transparent);
  color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 34%, transparent);
  box-shadow: var(--tpb-lit);
}
.tpb-face img { width: 100%; height: 100%; object-fit: cover; }

.tpb-plate__text { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1 1 220px; }

/* The display face, pushed hard and used exactly once: the trader's name is the
   only thing on the page set at hero size. Wraps rather than truncates — a name
   is the one thing here that must be readable in full — and is capped at two
   lines so a pathological handle cannot push the table off-screen. */
.tpb-name {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.6rem, 3.6vw, 2.35rem);
  font-weight: 700; line-height: 1.04; letter-spacing: -0.035em;
  color: var(--c-text);
  overflow-wrap: anywhere;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

.tpb-where {
  margin: 0; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 0.9375rem; color: var(--c-muted); min-width: 0;
}
.tpb-where .v-icon { color: var(--c-muted); flex-shrink: 0; }
.tpb-where__flag { font-size: 1rem; line-height: 1; }
.tpb-where--absent { opacity: 0.75; }

/* The record. Four bordered stat tiles became a text line, and now a ledger:
   how long they have been here, what they have finished, and what people said.
   Nothing in it is repeated by the tabs below. */
.tpb-ledger {
  margin: 2px 0 0; padding: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.11em; text-transform: uppercase;
  color: var(--c-muted);
}
.tpb-ledger > span { display: inline-flex; align-items: center; gap: 5px; }
/* A separator drawn by the line itself, so it can never start a wrapped row. */
.tpb-ledger > span:not(:last-child)::after {
  content: "·"; margin-left: 6px;
  color: color-mix(in srgb, var(--c-muted) 72%, transparent);
}
.tpb-ledger__rated .v-icon { color: var(--tpb-star); }
.tpb-ledger__score { color: var(--c-text); font-variant-numeric: tabular-nums; }

/* ── The table ─────────────────────────────────────────────────────────────
   The matches list's row, at page scale. Same panel (one tonal step under the
   background, a hairline, and a 1px top highlight rather than a drop shadow),
   same two tinted sides, same dashed seam that goes solid where cards travel.
   The two surfaces show the same fact, so they are the same drawing. */
.tpb-table {
  margin-top: 26px;
  padding: clamp(14px, 2vw, 20px);
  background: var(--tpb-panel);
  border: 1px solid var(--tpb-line-soft);
  border-radius: 18px;
  box-shadow: var(--tpb-lit);
}

.tpb-axis { display: flex; align-items: stretch; gap: 4px; }

.tpb-side {
  display: flex; flex-direction: column; gap: 10px;
  flex: 1; min-width: 0;
  padding: 13px 15px;
  border-radius: 13px;
  border: 1px solid var(--tpb-line-soft);
}
.tpb-side[data-side="get"]  { background: color-mix(in srgb, var(--c-trade) 6%, transparent); }
.tpb-side[data-side="give"] { background: color-mix(in srgb, var(--c-accent) 6%, transparent); }

.tpb-axis__label {
  display: flex; align-items: center; gap: 8px; margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.14em; text-transform: uppercase;
}
.tpb-side[data-side="get"]  .tpb-axis__label { color: var(--c-trade); }
.tpb-side[data-side="give"] .tpb-axis__label { color: var(--c-accent); }
/* No pill behind the count, for the reason the matches row gives: a chip
   tinted in the same hue as its own text subtracts contrast from the one
   number that matters. Dropping the tracking separates it from the label. */
.tpb-axis__n { letter-spacing: 0; }

.tpb-thumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.tpb-thumb {
  height: 84px; width: 57px; flex-shrink: 0; display: block;
  border-radius: 5px; object-fit: cover; background: var(--c-surface-2);
  outline: 1px solid var(--tpb-line);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.tpb-thumb:hover { transform: translateY(-3px) scale(1.06); }

.tpb-more {
  align-self: center; padding: 3px 9px; border-radius: 999px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem; font-weight: 700;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 14%, transparent);
}

/* An empty side is the reason this is not a mutual match, so it names which
   half is missing rather than saying "None". */
.tpb-nothing {
  margin: 0; align-self: flex-start; max-width: 26ch;
  font-size: 0.8125rem; line-height: 1.45; color: var(--c-muted);
}

.tpb-seam {
  display: flex; align-items: center; flex: 0 0 auto;
  width: clamp(48px, 7%, 84px);
  /* The arrow takes the colour of the direction it points, so it agrees with
     the arm it sits on instead of floating above the pair in neutral. */
  color: var(--kind);
}
.tpb-seam__arm { flex: 1; height: 1px; border-top: 1px dashed var(--tpb-line); }
.tpb-seam__arm.is-live { border-top-style: solid; }
.tpb-seam__arm:first-child.is-live { border-top-color: var(--c-trade); }
.tpb-seam__arm:last-child.is-live  { border-top-color: var(--c-accent); }
.tpb-seam__glyph {
  display: grid; place-items: center;
  width: 32px; height: 32px; flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--tpb-line);
  background: var(--tpb-panel);
}
/* Closed on both sides: the only state teal marks. */
.tpb-seam.is-mutual .tpb-seam__glyph {
  border-color: transparent;
  background: var(--c-mutual);
  color: var(--c-on-accent);
}

.tpb-note {
  margin: 13px 2px 1px;
  display: flex; align-items: flex-start; gap: 6px;
  font-size: 0.8125rem; line-height: 1.45; color: var(--c-muted);
}
.tpb-note .v-icon { flex-shrink: 0; margin-top: 2px; color: var(--c-muted); }

/* The action, on the identity line. It used to sit in a bordered footer strip
   below three screens of binder — the furthest possible point from the moment
   somebody decides to trade. */
.tpb-propose {
  flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 13px;
  background: var(--kind); color: var(--c-on-accent);
  border: 1.5px solid transparent; cursor: pointer;
  font-size: 14px; font-weight: 700; white-space: nowrap;
  transition: opacity 0.15s ease, transform 0.15s ease;
}
/* Nothing lines up yet — you may still know something the lists do not, so the
   button stays, but it stops shouting. */
.tpb[data-kind="none"] .tpb-propose {
  background: transparent; color: var(--c-trade);
  border-color: color-mix(in srgb, var(--c-trade) 45%, transparent);
}
.tpb-propose:hover { opacity: 0.9; transform: translateY(-1px); }
.tpb-propose:focus-visible { outline: 2px solid var(--kind); outline-offset: 2px; }

/* Phones: the axis rotates. The two piles stack and the seam runs between
   them, so give-join-get survives the turn instead of being squeezed sideways. */
@media (max-width: 640px) {
  .tpb-table { margin-top: 20px; }
  .tpb-axis { flex-direction: column; }
  .tpb-seam {
    flex-direction: row; width: auto; height: 30px;
    justify-content: center; gap: 12px;
  }
  .tpb-seam__arm { max-width: 70px; }
}

/* The button keeps its own width on a phone, for the reason the matches row
   gives: stretched across the plate it becomes a slab between the name and the
   trade it is proposing, and it asks for the decision before showing the
   evidence. It wraps to its own line and stays a 44px target. */
@media (max-width: 560px) {
  .tpb-propose { padding: 0 18px; }
}

/* ── Nothing here ──────────────────────────────────────────────────────────
   A dashed edge rather than a solid panel: this is a page waiting for content,
   not a container holding some. */
.tpb-blank {
  margin-top: 26px; padding: 34px 22px;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  text-align: center;
  border: 1px dashed var(--tpb-line); border-radius: 20px;
}
.tpb-blank__lead {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.125rem; font-weight: 700; letter-spacing: -0.015em;
  color: var(--c-text);
}
.tpb-blank__body {
  margin: 0; max-width: 46ch;
  font-size: 0.875rem; line-height: 1.55; color: var(--c-muted);
}
.tpb-blank__cta {
  margin-top: 6px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 42px; padding: 0 18px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 34%, transparent);
  color: var(--c-trade); font-size: 13.5px; font-weight: 700; text-decoration: none;
  transition: background 0.15s ease;
}
.tpb-blank__cta:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.tpb-blank__cta:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* ── Signed-out invitation ─────────────────────────────────────────────────
   Quieter than the table: that one reports a fact worth acting on, this one
   asks for something. Same slot, less voice. */
.tpb-signin {
  margin-top: 26px; padding: 15px 18px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 18px; flex-wrap: wrap;
  border-radius: 18px;
  border: 1px solid var(--tpb-line);
  background: var(--tpb-panel);
  box-shadow: var(--tpb-lit);
}
.tpb-signin__lead { margin: 0; font-size: 0.9375rem; color: var(--c-text); }
.tpb-signin__cta {
  flex-shrink: 0;
  display: inline-flex; align-items: center;
  min-height: 40px; padding: 0 17px; border-radius: 12px;
  background: var(--c-trade); color: var(--c-on-accent); border: none; cursor: pointer;
  font-size: 13px; font-weight: 700; white-space: nowrap;
  transition: opacity 0.15s ease;
}
.tpb-signin__cta:hover { opacity: 0.9; }
.tpb-signin__cta:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (max-width: 560px) {
  .tpb-signin { margin-top: 20px; }
  .tpb-signin__cta { width: 100%; justify-content: center; }
}

/* ── Tabs ──────────────────────────────────────────────────────────────────
   Scrolls rather than clipping: at 375px three translated labels overflowed
   silently and "Reviews" was unreachable. The rule under them is an inset
   shadow, not a border — inside a scroll container a 1px overhang makes
   scrollHeight exceed clientHeight and grows a stray vertical scrollbar. */
.tpb-tabs {
  margin-top: 30px;
  display: flex; gap: 0;
  box-shadow: inset 0 -1px 0 var(--tpb-line);
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--tpb-line) transparent;
  -webkit-overflow-scrolling: touch;
}
.tpb-tabs::-webkit-scrollbar { height: 3px; }
.tpb-tabs::-webkit-scrollbar-thumb { background: var(--tpb-line); border-radius: 99px; }

.tpb-tab {
  --tone: var(--c-text);
  flex-shrink: 0;
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px; white-space: nowrap;
  background: transparent; border: none; cursor: pointer;
  font-size: 0.9375rem; font-weight: 700; color: var(--c-muted);
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.tpb-tab[data-tone="trade"]  { --tone: var(--c-trade); }
.tpb-tab[data-tone="accent"] { --tone: var(--c-accent); }
.tpb-tab:hover { color: var(--c-text); }
.tpb-tab[aria-selected="true"] { color: var(--c-text); border-bottom-color: var(--tone); }

.tpb-tab__n {
  padding: 2px 8px; border-radius: 7px;
  font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.02em;
  background: color-mix(in srgb, var(--c-muted) 14%, transparent);
  color: var(--c-muted);
}
.tpb-tab[aria-selected="true"] .tpb-tab__n {
  background: color-mix(in srgb, var(--tone) 15%, transparent);
  color: var(--tone);
}

@media (max-width: 560px) {
  .tpb-tabs { margin-top: 24px; }
  .tpb-tab { padding: 13px 12px; font-size: 0.875rem; gap: 6px; }
}
@media (pointer: coarse) { .tpb-tab { min-height: 48px; } }

.tpb-panel { margin-top: 20px; }
/* The wishlist panel is cards somebody wants, so the binder's own accents
   follow the tab that opened it. */
.tpb-panel--want { --cb-tone: var(--c-accent); }

/* ── Reviews ───────────────────────────────────────────────────────────────
   Most ratings carry no comment, so the score line has to stand on its own
   rather than look like a card missing its body. Bordered rows, no tiles. */
.tpb-rev { list-style: none; margin: 0; padding: 0; }
.tpb-rev__item { padding: 11px 2px; border-bottom: 1px solid var(--tpb-line); }
.tpb-rev__item:first-child { border-top: 1px solid var(--tpb-line); }
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
.tpb-rev__stars .v-icon { color: var(--tpb-star); }
.tpb-rev__when {
  flex-shrink: 0; font-size: 12px; color: var(--c-muted);
  font-variant-numeric: tabular-nums;
}
.tpb-rev__comment {
  margin: 7px 0 0 31px; font-size: 13.5px; line-height: 1.55; color: var(--c-text);
}
.tpb-rev__empty { margin: 0; padding: 26px 0; text-align: center; font-size: 0.875rem; color: var(--c-muted); }
@media (max-width: 560px) { .tpb-rev__comment { margin-left: 0; } }

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

/* ── Skeleton ──────────────────────────────────────────────────────────────
   Tracks the plate at both sizes so nothing jumps when the profile lands. */
.tpb-skel-face { width: 76px; height: 76px; border-radius: 20px; }
.tpb-skel-lines { gap: 10px; }
.tpb-skel-cards { margin-top: 30px; }
@media (max-width: 560px) {
  .tpb-plate { gap: 14px; align-items: flex-start; }
  .tpb-face, .tpb-skel-face { width: 58px; height: 58px; border-radius: 16px; font-size: 1.35rem; }
  .tpb-where { font-size: 0.875rem; }
  /* At this width every ledger item takes its own line, so the separator can
     only ever end one — a dot hanging off the right of three consecutive
     lines. The line break separates them instead. */
  .tpb-ledger { gap: 3px 14px; }
  .tpb-ledger > span:not(:last-child)::after { content: none; }
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
  min-height: 42px; padding: 0 17px; border-radius: 12px;
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c-trade) 34%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.tpb-dead__action:hover { background: color-mix(in srgb, var(--c-trade) 24%, transparent); }
.tpb-dead__action .v-icon { color: var(--c-trade); }
.tpb-dead__action:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
@media (pointer: coarse) { .tpb-dead__action { min-height: 48px; } }

/* ── Reduced motion ────────────────────────────────────────────────────────
   Kill the specific decorative animations, not every transition on the page.
   The skeleton pulse is the worst offender, running on a dozen elements at
   once. */
@media (prefers-reduced-motion: reduce) {
  .animate-pulse { animation: none; }
  .tpb-thumb, .tpb-thumb:hover { transition: none; transform: none; }
  .tpb-propose, .tpb-signin__cta, .tpb-tab, .tpb-blank__cta, .tpb-dead__action { transition: none; }
  .tpb-propose:hover { transform: none; }
}
</style>
