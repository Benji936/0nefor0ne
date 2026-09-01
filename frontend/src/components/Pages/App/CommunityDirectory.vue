<script setup>
/**
 * The directory: 4,451 places you could walk into, across 44 countries.
 *
 * This is a gazetteer, not a feed, and a gazetteer is read by place. The page
 * used to open on a title that repeated the nav item you had just clicked, a
 * subtitle, and a toolbar of five controls — a search box that only searched
 * shop names, a four-way kind filter, a country dropdown, Near me, and a remote
 * -duel toggle. Underneath that sat page 1 of 186, which is to say: the shops
 * whose names begin with a digit.
 *
 * So the header is the answer instead of the label. The <h1> is a sentence
 * computed from what is actually on screen — "4,451 places", "199 places in
 * Germany", "6 places within 25 km" — and the one control that produces it is
 * the finder below it, a single field that searches names, towns and countries
 * with your own position as the crosshair inside it. Kind and remote duel are
 * chips underneath, quiet, because on this data three of the four kind options
 * return one row or none.
 *
 * Filter state stays in the URL (kind/country/remote/search) so a shared link
 * reproduces the same view; `page` is tracked separately from the rest so
 * paging never gets caught by the "any filter changed -> reset to page 0" watch.
 */
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchDirectory, fetchMyCommunities } from "@/lib/community";
import { getCurrentSession, onAuthChange, signInWithDiscord } from "@/lib/supabaseClient";
import { toQueryParams, fromQueryParams } from "@/lib/communityFilters";
import { resolveCountry } from "@/lib/countries";
import {
  communitiesNear, eventsNear, unclaimedNear, requestPosition, filterNear,
  RADII, DEFAULT_RADIUS, GEO_DENIED, GEO_UNAVAILABLE, GEO_UNSUPPORTED,
} from "@/lib/near";
import CommunityCard from "@/components/community/CommunityCard.vue";
import CommunityEditDialog from "@/components/community/CommunityEditDialog.vue";
import NearbyEvents from "@/components/community/NearbyEvents.vue";
import UnclaimedNearby from "@/components/community/UnclaimedNearby.vue";

const PAGE_SIZE = 24;

const route = useRoute();
const router = useRouter();
const { t, locale: i18nLocale } = useI18n();

const initial = fromQueryParams(route.query);
const filters = reactive({
  kind: initial.kind,
  country: initial.country,
  region: initial.region,
  remoteDuel: initial.remoteDuel,
  q: initial.q,
});
const page = ref(Math.max(0, initial.page));

// Local draft for the finder so typing doesn't fire a request per keystroke;
// committed into `filters.q` after a short pause.
const searchDraft = ref(initial.q);

const rows = ref([]);
// null until the first answer arrives, so the heading can hold its tongue
// rather than announce "no places" for the second before the data lands.
const count = ref(null);
const loading = ref(true);

const totalPages = computed(() => Math.max(1, Math.ceil((count.value ?? 0) / PAGE_SIZE)));

// Three kinds, no "All". An all-chip is only ever "no filter", which pressing
// the lit chip again already does — and a four-way segmented control implied a
// choice among four populated sets when, today, Groups matches nothing at all.
const KIND_OPTIONS = computed(() => [
  { value: "store",   label: t("community.kindStore") },
  { value: "discord", label: t("community.kindDiscord") },
  { value: "group",   label: t("community.kindGroup") },
]);

function pickKind(value) {
  filters.kind = filters.kind === value ? "" : value;
}

// Bumped on every load(); a response only commits if it's still the most
// recent request, so a slow earlier fetch can never clobber a later one.
let requestId = 0;

async function load() {
  const myRequest = ++requestId;
  loading.value = true;
  try {
    const { rows: r, count: c } = await fetchDirectory({
      ...filters, locale: i18nLocale.value, page: page.value, pageSize: PAGE_SIZE,
    });
    if (myRequest !== requestId) return;
    rows.value = r;
    count.value = c;

    // If the requested page is past the last valid page (e.g. a filter
    // change shrank the result set, or a stale/tampered URL), snap back to
    // the last valid page and refetch once. After snapping, page.value ===
    // lastPage, so this condition is false on the next run and the
    // recursion terminates.
    const lastPage = c > 0 ? Math.ceil(c / PAGE_SIZE) - 1 : 0;
    if (page.value > lastPage) {
      page.value = lastPage;
      syncUrl();
      return load();
    }
  } catch (e) {
    if (myRequest !== requestId) return;
    console.error("CommunityDirectory: fetchDirectory failed", e);
    rows.value = [];
    count.value = 0;
  } finally {
    if (myRequest === requestId) loading.value = false;
  }
}

function syncUrl() {
  router.replace({ query: toQueryParams({ ...filters, page: page.value }) });
}

// Any real filter change resets to page 0. This only fires for kind/country/
// region/remoteDuel/q since `page` is a separate ref below.
watch(filters, () => {
  page.value = 0;
  syncUrl();
  load();
}, { deep: true });

watch(page, () => {
  syncUrl();
  load();
});

let searchTimer = null;
watch(searchDraft, (v) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { filters.q = v.trim(); }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

function toggleRemote() {
  filters.remoteDuel = !filters.remoteDuel;
}

/* ── Near me ────────────────────────────────────────────────────────────────
 * A mode rather than a filter, and deliberately absent from the URL. The query
 * string is what someone shares; a position is not something to put in a link,
 * and restoring the mode from a URL would fire a location prompt at page load
 * for a reader who never asked for one.
 *
 * The results come from three RPCs rather than the directory query, because
 * distance is not something PostgREST can order by. See lib/near.js.
 */
const nearOn = ref(false);
const nearPos = ref(null);
const nearRadius = ref(DEFAULT_RADIUS);
const nearRows = ref([]);
const nearEvents = ref([]);
const nearUnclaimed = ref([]);
const nearLoading = ref(false);
const nearError = ref("");

const GEO_MESSAGES = {
  [GEO_DENIED]: "community.nearDenied",
  [GEO_UNAVAILABLE]: "community.nearUnavailable",
  [GEO_UNSUPPORTED]: "community.nearUnsupported",
};
const nearErrorText = computed(() =>
  nearError.value ? t(GEO_MESSAGES[nearError.value] || "community.nearFailed") : "");

// The kind, search and remote-duel filters still apply in near mode; country
// does not, because a position already answers where. Rather than leave a set
// country quietly doing nothing, turning the mode on clears it.
const nearVisible = computed(() => filterNear(nearRows.value, { ...filters, locale: i18nLocale.value }));
const anyFilter = computed(() => Boolean(filters.kind || filters.q || filters.remoteDuel));

// Events belong to the communities shown below them. Unfiltered they answer
// "what is happening near me"; once a filter narrows the grid, an event whose
// host is no longer on screen would contradict it. Only narrowed when a filter
// is actually set, since the two queries cap separately and a host past the
// limit would otherwise cost its event for no reason.
const nearVisibleEvents = computed(() => {
  if (!anyFilter.value) return nearEvents.value;
  const hosts = new Set(nearVisible.value.map((r) => r.id));
  return nearEvents.value.filter((e) => hosts.has(e.community_id));
});

let nearRequestId = 0;
async function loadNear() {
  if (!nearPos.value) return;
  const myRequest = ++nearRequestId;
  nearLoading.value = true;
  nearError.value = "";
  const opts = { ...nearPos.value, km: nearRadius.value };
  try {
    // The unclaimed list is only shown when the first query comes back empty,
    // but fetching it afterwards would make the empty state arrive in two
    // stages: a blank, then an offer.
    const [rows, events, unclaimed] = await Promise.all([
      communitiesNear(opts),
      eventsNear(opts),
      unclaimedNear(opts),
    ]);
    if (myRequest !== nearRequestId) return;
    nearRows.value = rows;
    nearEvents.value = events;
    nearUnclaimed.value = unclaimed;
  } catch (e) {
    if (myRequest !== nearRequestId) return;
    console.error("CommunityDirectory: near search failed", e);
    nearRows.value = [];
    nearEvents.value = [];
    nearUnclaimed.value = [];
    nearError.value = "failed";
  } finally {
    if (myRequest === nearRequestId) nearLoading.value = false;
  }
}

async function toggleNear() {
  if (nearOn.value) { nearOn.value = false; return; }

  nearOn.value = true;
  nearError.value = "";
  filters.country = "";

  // The position is asked for once and kept for the session: changing the
  // radius should not re-prompt, and neither should turning the mode off and
  // on again while comparing it against the full list.
  if (nearPos.value) { loadNear(); return; }

  nearLoading.value = true;
  try {
    nearPos.value = await requestPosition();
  } catch (e) {
    nearError.value = e?.message || "failed";
    nearLoading.value = false;
    return;
  }
  loadNear();
}

watch(nearRadius, () => { if (nearOn.value) loadNear(); });

/* ── The answer ─────────────────────────────────────────────────────────────
 * The page's heading, computed from what is on screen. It is the only thing on
 * the page set at hero size, and it is never decorative: it states the count,
 * and what that count is of, including when the count is zero.
 */
const nfmt = computed(() => new Intl.NumberFormat(i18nLocale.value));

// The country a shared ?country= link is pinned to, resolved through the same
// list the rows were written with so the chip can carry its flag.
const countryChip = computed(() =>
  filters.country ? (resolveCountry(filters.country, i18nLocale.value) ?? { name: filters.country, flag: "" }) : null);

const answerCount = computed(() => (nearOn.value ? nearVisible.value.length : count.value));

// Kind and remote duel have no words of their own in the heading, and they used
// to fall through to "No places yet" — which, with 4,451 places on file and one
// of them a Discord server, was the heading telling a plain lie the moment
// somebody pressed Groups. The same fall-through is what near mode needs when a
// filter, not the radius, is what emptied the list.
const filteredOut = computed(() => {
  if (nearOn.value) return nearRows.value.length > 0 && nearVisible.value.length === 0;
  return Boolean(filters.kind || filters.remoteDuel);
});

// Held back only until the very first answer. After that the last known number
// stays put while a new one is fetched, so typing into the finder does not make
// the heading strobe.
const answerReady = computed(() => (nearOn.value ? !nearLoading.value && !nearErrorText.value : count.value !== null));

// Before the very first answer there is no number to state, and the skeleton
// that stood in for one left prerendered pages shipping an <h1> containing
// nothing but a pulsing span. Crawlers read that as a page with no heading.
// So the first render says what the page is for, which is true at any count,
// and only *later* waits behind the skeleton: once an answer has been given,
// swapping back to a sentence would be the strobe the skeleton exists to stop.
const hasAnswered = ref(false);
watch(answerReady, (ready) => { if (ready) hasAnswered.value = true; }, { immediate: true });

// Most-specific first: a radius beats a query, a query beats a country, and
// anything at all beats the bare count.
const answer = computed(() => {
  const n = answerCount.value ?? 0;
  const args = { n: nfmt.value.format(n) };
  if (filteredOut.value) return t("community.foundFiltered", args, n);
  if (nearOn.value)      return t("community.foundNear", { ...args, km: nearRadius.value }, n);
  if (filters.q)         return t("community.foundFor", { ...args, q: filters.q }, n);
  if (filters.country)   return t("community.foundIn", { ...args, place: countryChip.value.name }, n);
  return t("community.foundAll", args, n);
});

const rangeLabel = computed(() => {
  const total = count.value ?? 0;
  const from = page.value * PAGE_SIZE + 1;
  return t("community.pageRange", {
    from: nfmt.value.format(from),
    to: nfmt.value.format(Math.min(from + PAGE_SIZE - 1, total)),
    total: nfmt.value.format(total),
  });
});

const narrowed = computed(() => Boolean(filters.kind || filters.q || filters.country || filters.remoteDuel));

function clearFilters() {
  filters.kind = "";
  filters.country = "";
  filters.remoteDuel = false;
  searchDraft.value = "";
  filters.q = "";
}

function goToPage(p) {
  if (p < 0 || p >= totalPages.value) return;
  page.value = p;
}

const createOpen = ref(false);

function openCreate() { createOpen.value = true; }

// Newly created community: send the owner straight to its (freshly minted)
// profile page rather than refreshing the directory list.
function onCreated(row) {
  router.push({ name: "communityProfile", params: { locale: route.params.locale || "en", slug: row.slug } });
}

// meta.community.* rather than the on-page copy: directoryTitle is the eyebrow
// above the heading and carries no brand, which left this the one page in the
// site shipping a <title> that never said whose site it was. The meta keys
// existed for this all along and were simply not wired up.
useHead(computed(() => {
  const loc = route.params?.locale || "en";
  const title = t("meta.community.title", {}, { locale: loc });
  const desc = t("meta.community.desc", {}, { locale: loc });
  return { title, meta: [{ name: "description", content: desc }] };
}));

// Viewer identity drives each card's follow state. Tracked here (rather than
// per card) so the grid resolves the session once.
const currentUserId = ref(null);
let stopAuth = null;

// An account can own one community. Once it does, "Add yours" is a button that
// would open a form only to refuse at the end of it, so it becomes a way back
// to the community they already have.
const myCommunity = ref(null);

async function loadMine() {
  if (!currentUserId.value) { myCommunity.value = null; return; }
  try { myCommunity.value = (await fetchMyCommunities())[0] ?? null; }
  catch (e) { console.error("CommunityDirectory: fetchMyCommunities failed", e); }
}
watch(currentUserId, loadMine, { immediate: true });

const mineRoute = computed(() => ({
  name: "communityProfile",
  params: { locale: route.params.locale || "en", slug: myCommunity.value?.slug },
}));

async function onFollowAuthRequired() {
  try { await signInWithDiscord(); }
  catch (e) { console.error("sign-in failed", e); }
}

onMounted(async () => {
  load();
  const session = await getCurrentSession();
  currentUserId.value = session?.user?.id ?? null;
  stopAuth = onAuthChange((s) => { currentUserId.value = s?.user?.id ?? null; });
});
onBeforeUnmount(() => { if (typeof stopAuth === "function") stopAuth(); });
</script>

<template>
  <div class="cd">

    <!-- ── The header is the answer ──────────────────────────────────────────
         The page's own name is the small line; the loud line is the count of
         what is on screen and what it is a count of. It used to be the other
         way round, with an <h1> repeating the nav item the reader had just
         clicked and a subtitle explaining what a directory is. -->
    <header class="cd-hero">
      <div class="cd-hero__top">
        <p class="cd-eyebrow">{{ t('community.directoryTitle') }}</p>
        <router-link v-if="myCommunity" class="cd-add" :to="mineRoute">
          <v-icon icon="mdi-storefront-outline" size="16" />
          {{ t('community.yoursAlready') }}
        </router-link>
        <button v-else type="button" class="cd-add" @click="openCreate">
          <v-icon icon="mdi-plus" size="16" />
          {{ t('community.addYours') }}
        </button>
      </div>

      <h1 class="cd-answer" aria-live="polite">
        <template v-if="answerReady">{{ answer }}</template>
        <span v-else-if="hasAnswered" class="cd-answer__sk animate-pulse motion-reduce:animate-none" />
        <template v-else>{{ t('community.directoryHeading') }}</template>
      </h1>

      <!-- The finder. One field for the three things a place is findable by —
           what it is called, what town it is in, what country — with your own
           position as the crosshair inside it, because where you are standing
           is just another place. It replaces a name-only search box and a
           44-entry country dropdown that sat next to it contradicting it. -->
      <div class="cd-finder" :class="{ 'is-near': nearOn }">
        <button
          type="button"
          class="cd-finder__near"
          :aria-pressed="nearOn"
          @click="toggleNear"
        >
          <v-icon :icon="nearOn ? 'mdi-crosshairs-gps' : 'mdi-crosshairs'" size="17" />
          <span class="cd-finder__nearlabel">{{ t('community.nearMe') }}</span>
        </button>
        <input
          v-model="searchDraft"
          type="search"
          class="cd-finder__field"
          :placeholder="t('community.searchPlaceholder')"
          :aria-label="t('community.searchPlaceholder')"
        />
        <button
          v-if="searchDraft"
          type="button"
          class="cd-finder__x"
          :aria-label="t('community.clearSearch')"
          @click="searchDraft = ''"
        >
          <v-icon icon="mdi-close" size="15" />
        </button>
      </div>

      <div class="cd-chips" role="group" :aria-label="t('community.directoryTitle')">
        <button
          v-for="opt in KIND_OPTIONS"
          :key="opt.value"
          type="button"
          class="cd-chip"
          :class="{ 'is-on': filters.kind === opt.value }"
          :aria-pressed="filters.kind === opt.value"
          @click="pickKind(opt.value)"
        >{{ opt.label }}</button>

        <button
          type="button"
          class="cd-chip"
          :class="{ 'is-on': filters.remoteDuel }"
          :aria-pressed="filters.remoteDuel"
          @click="toggleRemote"
        >
          <v-icon icon="mdi-web" size="14" />{{ t('community.remoteDuel') }}
        </button>

        <!-- A country still arrives on shared links, so it still has to be
             visible and removable. It has no picker any more: typing the
             country into the finder is how you get one. -->
        <button
          v-if="countryChip && !nearOn"
          type="button"
          class="cd-chip is-on"
          @click="filters.country = ''"
        >
          {{ countryChip.flag }} {{ countryChip.name }}
          <v-icon icon="mdi-close" size="13" />
        </button>

        <!-- One slot, two questions. A country and a position both answer
             "where", so the radius takes the country's place rather than
             sitting beside it contradicting it. -->
        <label v-if="nearOn" class="cd-chip cd-chip--select">
          <span class="cd-chip__label">{{ t('community.nearRadius') }}</span>
          <select v-model.number="nearRadius" class="cd-chip__field">
            <option v-for="km in RADII" :key="km" :value="km">{{ t('community.nearKm', { km }) }}</option>
          </select>
        </label>

        <button v-if="narrowed" type="button" class="cd-clear" @click="clearFilters">
          <v-icon icon="mdi-close" size="13" />{{ t('community.clearFilters') }}
        </button>
      </div>

      <!-- Said once, in the mode it applies to. A reader who knows their town
           has forty shops and sees three deserves to know why, and it is the
           same sentence that explains what a subscription buys. -->
      <p v-if="nearOn && !nearErrorText" class="cd-note">
        <v-icon icon="mdi-check-decagram" size="13" class="cd-note__verified" />
        {{ t('community.nearOnlyVerified') }}
      </p>
    </header>

    <!-- ── Near me ──────────────────────────────────────
         A separate branch rather than the same list fed differently: the
         results are ordered by distance, capped rather than paged, and carry
         events above them. Bending the paged branch into that shape would
         leave both harder to read than either. -->
    <template v-if="nearOn">
      <div v-if="nearErrorText" class="cd-blank">
        <div class="cd-blank__mark">
          <v-icon icon="mdi-crosshairs-off" size="24" style="color: var(--c-muted)" />
        </div>
        <p class="cd-blank__title">{{ nearErrorText }}</p>
        <!-- The mode produced nothing, and the only other way out is noticing
             the crosshair is still lit. Say the way back instead. -->
        <button type="button" class="cd-clear" @click="toggleNear">
          {{ t('community.nearShowAll') }}
        </button>
      </div>

      <div v-else-if="nearLoading" class="cd-grid">
        <div v-for="i in 4" :key="i" class="cd-sk">
          <span class="cd-sk__bar cd-sk__bar--name animate-pulse motion-reduce:animate-none" />
          <span class="cd-sk__bar cd-sk__bar--meta animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <template v-else>
        <NearbyEvents :events="nearVisibleEvents" />

        <div v-if="nearVisible.length" class="cd-grid">
          <CommunityCard
            v-for="c in nearVisible"
            :key="c.id"
            :community="c"
            :km="c.km"
            :current-user-id="currentUserId"
            @auth-required="onFollowAuthRequired"
          />
        </div>

        <!-- Nothing verified within the radius. The unclaimed shops nearby are
             the only thing worth putting here: the reader standing next to one
             is the likeliest person to own it. Given straight, not sunk in the
             middle of a blank state — the heading above has already said the
             search came back empty, and this is the answer, not an apology. -->
        <template v-else-if="nearRows.length === 0">
          <UnclaimedNearby v-if="nearUnclaimed.length" :rows="nearUnclaimed" />
          <div v-else class="cd-blank">
            <div class="cd-blank__mark">
              <v-icon icon="mdi-map-marker-off-outline" size="24" style="color: var(--c-muted)" />
            </div>
            <button type="button" class="cd-clear" @click="toggleNear">
              {{ t('community.nearShowAll') }}
            </button>
          </div>
        </template>

        <!-- Rows exist, the filters excluded them. The heading has already said
             so; all this owes the reader is the way back. -->
        <div v-else class="cd-blank">
          <div class="cd-blank__mark">
            <v-icon icon="mdi-filter-remove-outline" size="24" style="color: var(--c-muted)" />
          </div>
          <button type="button" class="cd-clear" @click="clearFilters">
            <v-icon icon="mdi-close" size="13" />{{ t('community.clearFilters') }}
          </button>
        </div>
      </template>
    </template>

    <template v-else>

      <div v-if="loading && !rows.length" class="cd-grid">
        <div v-for="i in 8" :key="i" class="cd-sk">
          <span class="cd-sk__bar cd-sk__bar--name animate-pulse motion-reduce:animate-none" />
          <span class="cd-sk__bar cd-sk__bar--meta animate-pulse motion-reduce:animate-none" />
        </div>
      </div>

      <div v-else-if="rows.length === 0" class="cd-blank">
        <div class="cd-blank__mark">
          <v-icon :icon="narrowed ? 'mdi-filter-remove-outline' : 'mdi-storefront-outline'" size="24" style="color: var(--c-muted)" />
        </div>
        <button v-if="narrowed" type="button" class="cd-clear" @click="clearFilters">
          <v-icon icon="mdi-close" size="13" />{{ t('community.clearFilters') }}
        </button>
        <router-link v-else-if="myCommunity" class="cd-add" :to="mineRoute">
          <v-icon icon="mdi-storefront-outline" size="16" />
          {{ t('community.yoursAlready') }}
        </router-link>
        <button v-else type="button" class="cd-add" @click="openCreate">
          <v-icon icon="mdi-plus" size="16" />
          {{ t('community.addYours') }}
        </button>
      </div>

      <div v-else class="cd-grid" :aria-busy="loading">
        <CommunityCard
          v-for="c in rows"
          :key="c.id"
          :community="c"
          :current-user-id="currentUserId"
          @auth-required="onFollowAuthRequired"
        />
      </div>

      <!-- The pager says which slice you are on, in words. It used to say
           "1 / 186", which is a number of pages nobody was ever going to walk. -->
      <div v-if="rows.length > 0 && totalPages > 1" class="cd-pager">
        <button type="button" class="cd-pager__btn" :disabled="loading || page <= 0" :aria-label="t('community.pagePrev')" @click="goToPage(page - 1)">
          <v-icon icon="mdi-chevron-left" size="19" />
        </button>
        <span class="cd-pager__range tabular-nums">{{ rangeLabel }}</span>
        <button type="button" class="cd-pager__btn" :disabled="loading || page >= totalPages - 1" :aria-label="t('community.pageNext')" @click="goToPage(page + 1)">
          <v-icon icon="mdi-chevron-right" size="19" />
        </button>
      </div>

    </template>

    <CommunityEditDialog v-model="createOpen" @saved="onCreated" />

  </div>
</template>

<style scoped>
/* Borrowed from the landing page (its --lp-* set), as the account, collection,
   matches, home and announce pages already do: panels sit one tonal step under
   the page rather than above it, hairlines are a fraction of the border token,
   and depth is a 1px top highlight instead of a drop shadow — lit from above,
   per DESIGN.md's Flat-By-Default Rule.
   Declared on the page root, so the cards, the events row and the unclaimed
   list all read the same ground rather than three that drift apart. */
.cd {
  --cd-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --cd-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --cd-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --cd-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 22px 0 56px;
  max-width: 1180px;
  margin: 0 auto;
}
@media (min-width: 768px) { .cd { padding-top: 30px; } }

/* ── Header ───────────────────────────────────────── */
.cd-hero { display: flex; flex-direction: column; gap: 16px; }
.cd-hero__top { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }

/* The page's own name, in the collector's register: monospace, uppercase,
   widely tracked (DESIGN.md, The Mono Identifier Rule), matching every other
   page in this pass. */
.cd-eyebrow {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-muted);
}

/* The one display moment on the page, and the only thing set at hero size. */
.cd-answer {
  margin: 0;
  min-height: 1.1em;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.9rem, 4.4vw, 3rem);
  font-weight: 700;
  line-height: 1.04;
  letter-spacing: -0.035em;
  color: var(--c-text);
  text-wrap: balance;
}
.cd-answer__sk {
  display: inline-block;
  width: min(11ch, 60vw);
  height: 0.72em;
  border-radius: 7px;
  background: var(--c-skeleton);
  vertical-align: baseline;
}

/* Outlined in the header, filled in a blank state. The page's primary action is
   finding a place; adding one serves the few readers who run a shop, and a
   filled amethyst pill next to the heading was competing with it. In a blank
   state it becomes the one thing left to do, so there it fills. */
.cd-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 8px 15px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: transparent;
  color: var(--c-trade);
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, filter 0.16s ease;
}
.cd-add:hover {
  background: color-mix(in srgb, var(--c-trade) 14%, transparent);
  border-color: var(--c-trade);
}
.cd-add:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; }

.cd-blank .cd-add {
  margin-left: 0;
  border-color: transparent;
  background: var(--c-trade);
  color: var(--c-on-accent);
}
.cd-blank .cd-add:hover { filter: brightness(1.08); background: var(--c-trade); }

/* ── The finder ───────────────────────────────────── */
.cd-finder {
  display: flex;
  align-items: stretch;
  max-width: 640px;
  border: 1px solid var(--cd-line);
  border-radius: 14px;
  background: var(--cd-panel);
  box-shadow: var(--cd-lit);
  transition: border-color 0.16s ease;
}
.cd-finder:focus-within { border-color: var(--c-trade); }
/* The field itself has no outline of its own — an outline inside a bordered
   instrument reads as a box in a box — so the instrument wears the ring. Keyed
   to the field with :has() rather than to :focus-within, so it does not double
   up with the ring on the crosshair or the clear button inside it; and to
   :focus rather than :focus-visible, because a text field owes you a mark of
   where you are typing whether you arrived by key or by pointer. */
.cd-finder:has(.cd-finder__field:focus) {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}

/* Your own position, inside the instrument that answers "where" rather than
   parked in a row of toggles beside it. Amethyst when lit, never teal: asking
   where you are is an action you took, not an agreement anybody reached
   (DESIGN.md, The Agreement Rule). */
.cd-finder__near {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 13px;
  border-right: 1px solid var(--cd-line-soft);
  border-radius: 13px 0 0 13px;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--c-muted);
  cursor: pointer;
  transition: color 0.16s ease, background 0.16s ease;
}
.cd-finder__near:hover { color: var(--c-text); }
.cd-finder__near:focus-visible { outline: 2px solid var(--c-trade); outline-offset: -2px; }
.cd-finder.is-near .cd-finder__near {
  background: var(--c-trade);
  color: var(--c-on-accent);
  border-right-color: transparent;
}

.cd-finder__field {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  font-size: 0.92rem;
  color: var(--c-text);
  background: transparent;
  border: 0;
  outline: none;
}
.cd-finder__field::placeholder { color: var(--c-muted); }
.cd-finder__field::-webkit-search-cancel-button { display: none; }

.cd-finder__x {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 38px;
  color: var(--c-muted);
  cursor: pointer;
  border-radius: 0 13px 13px 0;
  transition: color 0.16s ease;
}
.cd-finder__x:hover { color: var(--c-text); }
.cd-finder__x:focus-visible { outline: 2px solid var(--c-trade); outline-offset: -2px; }

/* ── Chips ────────────────────────────────────────── */
.cd-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }

.cd-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--cd-line-soft);
  background: transparent;
  color: var(--c-muted);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.cd-chip:hover { color: var(--c-text); border-color: var(--cd-line); }
.cd-chip:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
/* Amethyst for every lit chip, because each one is a narrowing the reader
   chose. The remote-duel toggle used to light teal, which is the agreement
   chain's colour and not available to anything else. */
.cd-chip.is-on {
  background: color-mix(in srgb, var(--c-trade) 15%, transparent);
  border-color: color-mix(in srgb, var(--c-trade) 45%, transparent);
  color: var(--c-trade);
}

.cd-chip--select { padding: 0 0 0 12px; cursor: default; gap: 7px; }
.cd-chip__label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.64rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.cd-chip__field {
  padding: 6px 12px 6px 0;
  border: 0;
  background: transparent;
  color: var(--c-text);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  outline: none;
}
.cd-chip__field:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 6px; }

/* The same clear control the matches and announce pages use. */
.cd-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--cd-line-soft);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.cd-clear:hover { color: var(--c-text); border-color: var(--cd-line); }
.cd-clear:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

.cd-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-muted);
}
/* The one teal on this page, and it is the verified badge this sentence is
   pointing at, drawn in the badge's own colour. Named for what it is so the
   palette guard can tell it apart from teal used as decoration. */
.cd-note__verified { color: var(--c-mutual); flex-shrink: 0; }

/* ── Grid ─────────────────────────────────────────── */
.cd-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(258px, 1fr));
  gap: 12px;
}
/* A page turn keeps the old rows on screen while the next set is fetched;
   swapping them for skeletons would flash the whole layout away and back. It
   said "working" by dimming the grid, which put the card text at 2.5:1 — on the
   one screen somebody is reading while they wait. The waiting is said at the
   control instead: the pager's buttons go disabled, and the grid carries
   aria-busy for anyone not looking at it. */

.cd-sk {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 14px;
  height: 92px;
  padding: 16px;
  border: 1px solid var(--cd-line-soft);
  border-radius: 15px;
  background: var(--cd-panel);
}
.cd-sk__bar { display: block; border-radius: 6px; background: var(--c-skeleton); }
.cd-sk__bar--name { height: 15px; width: 72%; }
.cd-sk__bar--meta { height: 11px; width: 46%; }

/* ── Blank states ─────────────────────────────────── */
.cd-blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 20px;
  text-align: center;
}
.cd-blank__mark {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 17px;
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}
.cd-blank__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--c-text);
}

/* ── Pager ────────────────────────────────────────── */
.cd-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding-top: 4px;
}
.cd-pager__btn {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  border: 1px solid var(--cd-line);
  background: var(--cd-panel);
  box-shadow: var(--cd-lit);
  color: var(--c-text);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.cd-pager__btn:hover:not(:disabled) { border-color: var(--c-trade); color: var(--c-trade); }
.cd-pager__btn:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.cd-pager__btn:disabled { color: var(--c-muted); border-color: var(--cd-line-soft); cursor: default; }
.cd-pager__range {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--c-muted);
}

@media (max-width: 560px) {
  /* The label goes, the crosshair stays: the button keeps its accessible name
     from the text, which is still in the DOM for a screen reader. */
  .cd-finder__nearlabel { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .cd-finder__near { padding: 0 11px; }
  .cd-grid { grid-template-columns: 1fr; }
  /* Wrapped onto its own line it was right-aligned against nothing. */
  .cd-add { margin-left: 0; }
}

</style>
