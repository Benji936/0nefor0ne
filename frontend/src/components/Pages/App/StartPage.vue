<!-- StartPage.vue — the first run.

     Signing up used to return people to the landing page: the marketing site
     for the product they had just joined. Following it into the app was worse,
     because every surface that gives NoBinder its value is derived from
     cards the account does not have yet — a match is your trade pile
     intersected with somebody else's wish list, so a new account matches
     nothing, has no proposals, and shows two empty collection sections.

     So this is not a tour. Explaining the navigation would be narrating empty
     rooms. It is the shortest path to a populated account: what you will trade,
     what you want, then straight into Matches with real results in it.

     Nothing here blocks. Skip is on every step, Back never loses what was
     added, and the cards are written to the collection as they are entered
     rather than batched at the end — quitting halfway keeps everything.

     Rendered chromeless (App.vue hides the rail and navbar for this route) so
     the one decision on screen is the one being asked for. -->
<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import AddCard from "@/components/library/AddCard.vue";
import BulkAddCards from "@/components/library/BulkAddCards.vue";
import DeckImport from "@/components/library/DeckImport.vue";
import { getClient, getCurrentSession } from "@/lib/supabaseClient";
import { cardImage } from "@/lib/cardImage";
import { fetchMatches } from "@/lib/matches";
import { STEPS, normalizeStep, nextStep, prevStep, writeSkipped } from "@/lib/onboarding";

const props = defineProps({
  login: { type: Object, default: null },
});
const emit = defineEmits(["requireAuth"]);

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const locale = computed(() => route.params.locale || "en");

useHead({ title: t("onboarding.metaTitle"), meta: [{ name: "robots", content: "noindex" }] });

// ── Step, held in the URL ──────────────────────────────────────────────────
// So the browser Back button walks the flow instead of leaving it, and so a
// half-finished run can be linked to. scrollBehavior already leaves the scroll
// alone on same-path changes, so this does not yank the page around.
const step = computed(() => normalizeStep(route.query.step));
const stepNo = computed(() => STEPS.indexOf(step.value) + 1);
const isDone = computed(() => step.value === "done");
/** Which pile this step fills. The `done` step fills neither. */
const mode = computed(() => (step.value === "wish" ? "wish" : "trade"));

function goStep(next) {
  if (!next) return;
  router.push({ query: { ...route.query, step: next } });
}

// ── The two piles ──────────────────────────────────────────────────────────
const tradeCards = ref([]);
const wishCards = ref([]);
const loading = ref(true);
const loadError = ref(false);
const signedOut = ref(false);
/** Whose collection this is. Settled once, then used by every reload. */
const userId = ref(null);

const current = computed(() => (mode.value === "wish" ? wishCards.value : tradeCards.value));

async function loadCards() {
  const uid = userId.value;
  if (!uid) return;
  loading.value = true;
  loadError.value = false;
  const { data, error } = await getClient()
    .from("Card")
    .select("id, name, image_id, wish, quantity, status")
    .eq("trader", uid)
    .neq("status", "traded");
  loading.value = false;
  if (error) {
    // Say so rather than rendering an empty pile: "you have added nothing" and
    // "we could not read what you added" look identical here, and the second
    // one would have people adding the same cards twice.
    console.error("StartPage: could not load the collection", error);
    loadError.value = true;
    return;
  }
  const live = (data ?? []).filter((c) => (c.quantity ?? 0) > 0 || c.status === "locked");
  tradeCards.value = live.filter((c) => !c.wish);
  wishCards.value = live.filter((c) => c.wish);
}

// Settle the session here rather than waiting on the `login` prop.
//
// This page can be opened by URL, which mounts it before App has restored the
// session — so a null prop means "not known yet", not "signed out", and a page
// that waits for it to become non-null waits forever for a visitor who is
// genuinely signed out. Asking Supabase directly gives a real answer either way.
onMounted(async () => {
  const settled = await getCurrentSession();
  const uid = settled?.user?.id ?? props.login?.user?.id ?? null;
  if (!uid) {
    signedOut.value = true;
    loading.value = false;
    return;
  }
  userId.value = uid;
  await loadCards();
});

// And keep following the prop, so signing in from the dialog while standing on
// this page fills the piles in without a reload.
watch(() => props.login?.user?.id, (id, was) => {
  if (!id || id === was) return;
  signedOut.value = false;
  userId.value = id;
  loadCards();
});

// ── Adding ────────────────────────────────────────────────────────────────
const query = ref("");
const showDeckImport = ref(false);
const addCardRef = ref(null);
const bulkAddRef = ref(null);

function openSearch() {
  addCardRef.value?.open(query.value);
  query.value = "";
}

function openBulk() {
  bulkAddRef.value?.open();
}

/** Every add path lands here. Re-reading is cheaper than reconciling three
 *  different shapes (one row, an inserted count, a deck's worth). */
function onAdded() {
  loadCards();
}

// ── Finishing ─────────────────────────────────────────────────────────────
const matchCount = ref(null);

async function loadMatches() {
  try {
    const users = await fetchMatches();
    matchCount.value = Array.isArray(users) ? users.length : 0;
  } catch (err) {
    // The done step still works without this; it just drops the line that says
    // how many people you matched.
    console.error("StartPage: could not count matches", err);
    matchCount.value = null;
  }
}

watch(isDone, (done) => { if (done) loadMatches(); }, { immediate: true });

function skip() {
  writeSkipped(typeof localStorage !== "undefined" ? localStorage : null);
  router.replace(`/${locale.value}/dashboard`);
}

function finish() {
  router.replace(`/${locale.value}/trade/matches`);
}

function advance() {
  const next = nextStep(step.value);
  if (next) goStep(next);
  else finish();
}

const back = computed(() => prevStep(step.value));

// ── Copy ──────────────────────────────────────────────────────────────────
const heading = computed(() => t(`onboarding.${step.value}.title`));
const blurb = computed(() => t(`onboarding.${step.value}.blurb`));
const continueLabel = computed(() =>
  current.value.length > 0 ? t("onboarding.continue") : t("onboarding.continueEmpty")
);
</script>

<template>
  <div class="ob-page">
    <div class="ob-frame">
      <!-- ── Header: where you are, and the way out ── -->
      <header class="ob-head">
        <img src="/logo.png" alt="NoBinder" class="ob-logo" />

        <ol class="ob-dots" :aria-label="t('onboarding.progressLabel')">
          <li
            v-for="(s, i) in STEPS"
            :key="s"
            class="ob-dot"
            :class="{ 'ob-dot--on': i < stepNo, 'ob-dot--now': i === stepNo - 1 }"
            :aria-current="i === stepNo - 1 ? 'step' : undefined"
          >
            <span class="ob-sr">{{ t(`onboarding.${s}.short`) }}</span>
          </li>
        </ol>

        <button v-if="!isDone && !signedOut" type="button" class="ob-skip" @click="skip">
          {{ t("onboarding.skip") }}
          <v-icon icon="mdi-arrow-right" size="14" />
        </button>
      </header>

      <!-- ── Signed out ──
           Reachable by URL, and there is nothing to set up without an account.
           Says so instead of sitting on skeletons forever waiting for a session
           that is never coming. -->
      <main v-if="signedOut" class="ob-main">
        <h1 class="ob-title">{{ t("onboarding.signedOut.title") }}</h1>
        <p class="ob-blurb">{{ t("onboarding.signedOut.blurb") }}</p>
        <div class="ob-alts">
          <button type="button" class="ob-btn ob-btn--go" @click="emit('requireAuth')">
            {{ t("onboarding.signedOut.cta") }}
          </button>
          <router-link :to="`/${locale}/`" class="ob-btn ob-btn--ghost ob-btn--link">
            {{ t("onboarding.signedOut.browse") }}
          </router-link>
        </div>
      </main>

      <!-- ── Steps 1 & 2: fill a pile ── -->
      <main v-else-if="!isDone" class="ob-main">
        <p class="ob-eyebrow">{{ t("onboarding.stepOf", { n: stepNo, total: STEPS.length }) }}</p>
        <h1 class="ob-title">{{ heading }}</h1>
        <p class="ob-blurb">{{ blurb }}</p>

        <form class="ob-search" @submit.prevent="openSearch">
          <v-icon icon="mdi-magnify" size="20" class="ob-search__ico" />
          <input
            v-model="query"
            class="ob-search__input"
            type="text"
            :placeholder="t('onboarding.searchPlaceholder')"
            :aria-label="t('onboarding.searchPlaceholder')"
          />
          <button type="submit" class="ob-search__go">{{ t("onboarding.searchGo") }}</button>
        </form>

        <div class="ob-alts">
          <button type="button" class="ob-alt" @click="openBulk">
            <v-icon icon="mdi-playlist-plus" size="18" />
            {{ t("onboarding.pasteList") }}
          </button>
          <button
            type="button"
            class="ob-alt"
            :aria-expanded="showDeckImport"
            @click="showDeckImport = !showDeckImport"
          >
            <v-icon :icon="showDeckImport ? 'mdi-chevron-up' : 'mdi-file-import-outline'" size="18" />
            {{ t("onboarding.importDeck") }}
          </button>
        </div>

        <div v-if="showDeckImport" class="ob-deck">
          <DeckImport :login="login" @requireAuth="emit('requireAuth')" @added="onAdded" />
        </div>

        <!-- ── What is in the pile so far ── -->
        <section class="ob-pile" :aria-label="t(`onboarding.${step}.pileLabel`)">
          <div class="ob-pile__head">
            <span class="ob-pile__title">{{ t(`onboarding.${step}.pileLabel`) }}</span>
            <span class="ob-pile__count">{{ t("onboarding.added", { count: current.length }, current.length) }}</span>
          </div>

          <div v-if="loading" class="ob-strip">
            <div v-for="i in 5" :key="i" class="ob-thumb ob-thumb--sk" />
          </div>

          <p v-else-if="loadError" class="ob-pile__empty ob-pile__empty--err">
            <v-icon icon="mdi-alert-circle-outline" size="16" />
            {{ t("onboarding.loadFailed") }}
          </p>

          <p v-else-if="current.length === 0" class="ob-pile__empty">
            {{ t(`onboarding.${step}.pileEmpty`) }}
          </p>

          <ul v-else class="ob-strip">
            <li v-for="card in current" :key="card.id" class="ob-thumb">
              <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy" />
              <span v-if="(card.quantity ?? 1) > 1" class="ob-thumb__qty">×{{ card.quantity }}</span>
            </li>
          </ul>
        </section>
      </main>

      <!-- ── Step 3: the payoff ── -->
      <main v-else class="ob-main ob-main--done">
        <div class="ob-tick"><v-icon icon="mdi-check" size="34" /></div>
        <h1 class="ob-title">{{ heading }}</h1>
        <p class="ob-blurb">{{ blurb }}</p>

        <dl class="ob-tally">
          <div class="ob-tally__cell">
            <dt>{{ t("onboarding.trade.short") }}</dt>
            <dd>{{ tradeCards.length }}</dd>
          </div>
          <div class="ob-tally__cell">
            <dt>{{ t("onboarding.wish.short") }}</dt>
            <dd>{{ wishCards.length }}</dd>
          </div>
        </dl>

        <p v-if="matchCount !== null" class="ob-verdict">
          <template v-if="matchCount > 0">
            <v-icon icon="mdi-account-multiple-outline" size="18" />
            {{ t("onboarding.done.matches", { count: matchCount }, matchCount) }}
          </template>
          <template v-else>
            <v-icon icon="mdi-clock-outline" size="18" />
            {{ t("onboarding.done.noMatchesYet") }}
          </template>
        </p>
      </main>

      <!-- ── Footer: Back never loses anything, Continue is always available ── -->
      <footer v-if="!signedOut" class="ob-foot">
        <button v-if="back" type="button" class="ob-btn ob-btn--ghost" @click="goStep(back)">
          <v-icon icon="mdi-arrow-left" size="16" />
          {{ t("onboarding.back") }}
        </button>
        <span class="ob-foot__gap" />
        <button v-if="isDone" type="button" class="ob-btn ob-btn--ghost" @click="skip">
          {{ t("onboarding.done.toCollection") }}
        </button>
        <button type="button" class="ob-btn ob-btn--go" @click="advance">
          {{ isDone ? t("onboarding.done.cta") : continueLabel }}
          <v-icon icon="mdi-arrow-right" size="16" />
        </button>
      </footer>
    </div>

    <!-- Headless: these supply their own dialogs, this page supplies the buttons. -->
    <AddCard ref="addCardRef" :mode="mode" :headless="true" @added="onAdded" />
    <BulkAddCards
      ref="bulkAddRef"
      :mode="mode"
      :headless="true"
      @added="onAdded"
      @requireAuth="emit('requireAuth')"
    />
  </div>
</template>

<style scoped>
/* Plain CSS rather than utilities: Vuetify's reset zeroes several Tailwind
   spacing classes in this app, and a first-run screen is the worst place to
   discover that. */
.ob-page {
  min-height: 100vh;
  background: var(--c-bg);
  display: flex;
  justify-content: center;
  padding: 24px 16px 48px;
}

.ob-frame {
  width: 100%;
  max-width: 720px;
  display: flex;
  flex-direction: column;
}

/* ── Header ─────────────────────────────────────────────────────────── */
.ob-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 24px;
}

.ob-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  flex-shrink: 0;
}

.ob-dots {
  display: flex;
  align-items: center;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.ob-dot {
  width: 28px;
  height: 4px;
  border-radius: 999px;
  background: var(--c-border);
  transition: background 200ms ease;
}

.ob-dot--on { background: var(--c-trade); }
.ob-dot--now { box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 22%, transparent); }

.ob-skip {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: 0;
  padding: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-muted);
  cursor: pointer;
  border-radius: 8px;
  transition: color 200ms ease, background 200ms ease;
}

.ob-skip:hover { color: var(--c-text); background: var(--c-surface-2); }

/* ── Body ───────────────────────────────────────────────────────────── */
.ob-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ob-eyebrow {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.ob-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.25;
  font-weight: 800;
  color: var(--c-text);
}

.ob-blurb {
  margin: 0;
  font-size: 16px;
  line-height: 1.6;
  max-width: 52ch;
  color: var(--c-muted);
}

/* ── Search row ─────────────────────────────────────────────────────── */
.ob-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 14px;
  border-radius: 14px;
  background: var(--c-surface-2);
  border: 1px solid var(--c-border);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

.ob-search:focus-within {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-trade) 20%, transparent);
}

.ob-search__ico { color: var(--c-muted); flex-shrink: 0; }

.ob-search__input {
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  outline: none;
  color: var(--c-text);
  /* 16px keeps iOS Safari from zooming the viewport on focus. */
  font-size: 16px;
  padding: 10px 0;
}

.ob-search__input::placeholder { color: var(--c-muted); opacity: 0.85; }

.ob-search__go {
  flex-shrink: 0;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 10px;
  background: var(--c-trade);
  color: var(--c-on-accent);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: filter 200ms ease;
}

.ob-search__go:hover { filter: brightness(1.08); }

/* ── The other two ways in ──────────────────────────────────────────── */
.ob-alts { display: flex; flex-wrap: wrap; gap: 8px; }

.ob-alt {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 16px;
  border-radius: 12px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
  color: var(--c-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 200ms ease, border-color 200ms ease;
}

.ob-alt:hover { background: var(--c-surface-2); border-color: var(--c-muted); }

.ob-deck { margin-top: 4px; }

/* ── The pile so far ────────────────────────────────────────────────── */
.ob-pile {
  margin-top: 8px;
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
}

.ob-pile__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ob-pile__title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-text);
}

.ob-pile__count { font-size: 13px; font-weight: 600; color: var(--c-muted); }

.ob-pile__empty {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--c-muted);
}

.ob-pile__empty--err { color: var(--c-accent); }

.ob-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.ob-thumb {
  position: relative;
  width: 60px;
  aspect-ratio: 59 / 86;
  border-radius: 6px;
  overflow: hidden;
  background: var(--c-surface-2);
}

.ob-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

.ob-thumb--sk { background: var(--c-skeleton); animation: ob-pulse 1.4s ease-in-out infinite; }

.ob-thumb__qty {
  position: absolute;
  right: 2px;
  bottom: 2px;
  padding: 1px 5px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: rgb(0 0 0 / 0.72);
  color: #fff;
}

/* ── Done ───────────────────────────────────────────────────────────── */
.ob-main--done { align-items: flex-start; }

.ob-tick {
  width: 60px;
  height: 60px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--c-trade) 16%, transparent);
  color: var(--c-trade);
}

.ob-tally { display: flex; gap: 12px; margin: 4px 0 0; }

.ob-tally__cell {
  min-width: 120px;
  padding: 14px 18px;
  border-radius: 14px;
  border: 1px solid var(--c-border);
  background: var(--c-surface);
}

.ob-tally dt {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.ob-tally dd { margin: 4px 0 0; font-size: 26px; font-weight: 800; color: var(--c-text); }

.ob-verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--c-text);
}

/* ── Footer ─────────────────────────────────────────────────────────── */
.ob-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid var(--c-border);
}

.ob-foot__gap { flex: 1; }

.ob-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 200ms ease, filter 200ms ease, border-color 200ms ease;
}

.ob-btn--ghost {
  background: none;
  border-color: var(--c-border);
  color: var(--c-muted);
}

.ob-btn--ghost:hover { background: var(--c-surface-2); color: var(--c-text); }

.ob-btn--go {
  background: var(--c-trade);
  color: var(--c-on-accent);
}

.ob-btn--go:hover { filter: brightness(1.08); }

/* The signed-out branch offers a link where the steps offer a button. */
.ob-btn--link { text-decoration: none; }

/* Keyboard focus has to stay obvious on every control here — this screen is
   reachable with nothing but Tab and Enter. */
.ob-skip:focus-visible,
.ob-alt:focus-visible,
.ob-btn:focus-visible,
.ob-search__go:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}

.ob-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@keyframes ob-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .ob-thumb--sk { animation: none; }
  .ob-dot, .ob-search, .ob-alt, .ob-btn, .ob-skip { transition: none; }
}

@media (max-width: 560px) {
  .ob-title { font-size: 23px; }
  .ob-blurb { font-size: 15px; }
  .ob-search { flex-wrap: wrap; padding: 8px; }
  .ob-search__ico { display: none; }
  .ob-search__input { padding: 8px 6px; }
  .ob-search__go { width: 100%; }
  .ob-alt { flex: 1; justify-content: center; }
  .ob-thumb { width: 52px; }
  .ob-tally__cell { flex: 1; min-width: 0; }
  .ob-foot { flex-wrap: wrap; }
  .ob-btn--go { flex: 1; justify-content: center; }
}
</style>
