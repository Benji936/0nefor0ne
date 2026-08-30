<script setup>
// The proposals page: every trade you are in, filed by whose turn it is.
//
// It used to be filed by who started the trade -- Incoming, Outgoing -- with a
// section header under the chips restating whichever chip was lit. Two problems.
// The header was a copy of the control above it, and the grouping stopped being
// true when the staged workflow arrived: a trade you sent can be waiting on you
// to confirm a revision, and "Outgoing" reads as "waiting for the other side".
// See lib/proposalQueue.js.
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import ProposalRow from "@/components/trade/ProposalRow.vue";
import { QUEUE_GROUPS, groupProposals, queueCounts, resolveGroup } from "@/lib/proposalQueue";

const { t } = useI18n();
const route = useRoute();

// Every in-app link in this app carries the locale it was opened in.
const locale = computed(() => route.params.locale || "en");

const props = defineProps({
  login:           { type: Object,  default: null },
  loading:         { type: Boolean, default: false },
  incomingPending: { type: Array,   default: () => [] },
  outgoingPending: { type: Array,   default: () => [] },
  acceptedTrades:  { type: Array,   default: () => [] },
  history:         { type: Array,   default: () => [] },
  currentUserId:   { type: String,  default: null },
});

// accept / decline / counter moved to the trade page, which performs them
// itself; ProposalRow no longer emits them for this tab to forward.
const emit = defineEmits(["cancel", "complete", "edit", "openProfile"]);

// The host still splits its proposals four ways for its own tab badge, so they
// arrive here as four arrays and are put back together before being sorted by
// turn. One list in, one grouping out — no row can land in two piles.
const all = computed(() => [
  ...props.incomingPending, ...props.outgoingPending,
  ...props.acceptedTrades,  ...props.history,
]);

const piles  = computed(() => groupProposals(all.value));
const counts = computed(() => queueCounts(piles.value));
const total  = computed(() => all.value.length);

/* Three of the four piles have a role in the system -- doing something about a
   trade is amethyst, a finished one is teal, a trade that fell through is pink
   (DESIGN.md, The Three-Role Rule). "Their move" has no role: it is the state
   where there is nothing to do, so its segment lights up neutral. Muted was
   tried and is what a segment cannot be: muted text on a muted tint measured
   4.43:1 in the dark theme. */
const tone = {
  yours:  "var(--c-trade)",
  theirs: "var(--c-text)",
  done:   "var(--c-mutual)",
  closed: "var(--c-accent)",
};

// The segment and the pill on every row inside it say the same words, from the
// same key: the label on the control is the label on the thing it selects.
const segments = computed(() => {
  const label = {
    yours:  t('proposal.yourMove'),
    theirs: t('proposal.theirMove'),
    done:   t('proposals.done'),
    closed: t('proposals.closed'),
  };
  return QUEUE_GROUPS.map((key) => ({
    key,
    label: label[key],
    count: counts.value[key],
    tone:  tone[key],
  }));
});

const activeGroup = ref(null);

// Picks the opening pile, and hands over when the one on screen empties — with
// no "everything" segment to fall back on, an emptied pile would otherwise be a
// blank page under a segment reading 0.
watch(counts, (c) => { activeGroup.value = resolveGroup(c, activeGroup.value); },
  { immediate: true, deep: true });

const rows = computed(() => piles.value[activeGroup.value] ?? []);

// The page's one sentence: what is actually waiting on the reader.
const lede = computed(() => counts.value.yours > 0
  ? t('proposals.waitingOnYou', { count: counts.value.yours }, counts.value.yours)
  : t('proposals.nothingWaiting'));
</script>

<template>
  <!-- Not logged in -->
  <div v-if="!login" class="pq-blank">
    <v-icon icon="mdi-lock-outline" size="34" color="var(--c-muted)" />
    <p class="pq-blank__line">{{ t('proposals.loginRequired') }}</p>
  </div>

  <!-- Skeleton. Shaped like the strip it becomes: head line, deal, verb. -->
  <div v-else-if="loading" class="pq">
    <div class="pq-list">
      <div v-for="i in 3" :key="i" class="pq-sk" :style="{ opacity: 1 - (i - 1) * 0.22 }">
        <div class="pq-sk__head">
          <span class="pq-sk__bit" style="width: 34px; height: 34px; border-radius: 999px" />
          <span class="pq-sk__bit" style="width: 34%; height: 13px" />
          <span class="pq-sk__bit" style="width: 86px; height: 22px; border-radius: 999px; margin-left: auto" />
        </div>
        <div class="pq-sk__deal" />
      </div>
    </div>
  </div>

  <!-- Nothing at all. An empty screen is an invitation, so it carries the way
       out of itself rather than describing where one might be. -->
  <div v-else-if="total === 0" class="pq-blank">
    <span class="pq-blank__mark"><v-icon icon="mdi-swap-horizontal" size="26" color="var(--c-muted)" /></span>
    <p class="pq-blank__title">{{ t('proposals.noProposalsTitle') }}</p>
    <p class="pq-blank__line">{{ t('proposals.noProposalsDesc') }}</p>
    <router-link
      class="pq-blank__go"
      :to="{ name: 'TradeCenter', params: { locale, tab: 'matches' } }"
    >
      <v-icon icon="mdi-account-search-outline" size="16" aria-hidden="true" />
      {{ t('proposals.findTraders') }}
    </router-link>
  </div>

  <div v-else class="pq">
    <header class="pq-head">
      <h1 class="pq-head__eyebrow">{{ t('tradeCenter.proposals') }}</h1>
      <p class="pq-head__lede">{{ lede }}</p>
    </header>

    <!--
      One pile at a time, so this is a segmented control rather than a row of
      chips: a chip set says "combine these", and there is nothing to combine.
      Empty piles stay in place, disabled, so the control does not change shape
      under the pointer as trades move between piles.
    -->
    <div class="pq-bar" role="group" :aria-label="t('tradeCenter.proposals')">
      <button
        v-for="s in segments"
        :key="s.key"
        type="button"
        class="pq-seg"
        :class="{ 'is-on': activeGroup === s.key }"
        :style="{ '--pq-tone': s.tone }"
        :disabled="s.count === 0"
        :aria-pressed="String(activeGroup === s.key)"
        @click="activeGroup = s.key"
      >
        <span class="pq-seg__label">{{ s.label }}</span>
        <span class="pq-seg__n tabular-nums">{{ s.count }}</span>
      </button>
    </div>

    <div class="pq-list">
      <ProposalRow
        v-for="p in rows" :key="p.id"
        :proposal="p"
        :current-user-id="currentUserId"
        @edit="emit('edit', p)"
        @cancel="emit('cancel', p)"
        @complete="emit('complete', p)"
        @openProfile="emit('openProfile', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
/* The landing page's surface vocabulary -- a panel ground one tonal step under
   the surface, borders at partial alpha -- so arriving here from the trade page
   does not feel like arriving at a different product. The rows read these. */
.pq {
  --pq-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --pq-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --pq-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --pq-mono: ui-monospace, "Cascadia Code", SFMono-Regular, Menlo, monospace;

  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Head ─────────────────────────────────────────────────────────────────
   Not a hero. The heading is set in the collector's register the rest of the
   app labels sections in (DESIGN.md, The Mono Identifier Rule), and the one
   sentence under it does the talking. */
.pq-head { display: flex; flex-direction: column; gap: 5px; }

.pq-head__eyebrow {
  margin: 0;
  font-family: var(--pq-mono);
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--c-muted);
}
.pq-head__lede {
  margin: 0;
  font-family: "Space Grotesk", system-ui, -apple-system, sans-serif;
  font-size: clamp(1.15rem, 2.4vw, 1.5rem);
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.025em;
  color: var(--c-text);
  text-wrap: balance;
}

/* ── The segmented bar ────────────────────────────────────────────────── */
.pq-bar {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--pq-line);
  border-radius: 999px;
  background: var(--pq-panel);
  overflow-x: auto;
  scrollbar-width: none;
}
.pq-bar::-webkit-scrollbar { display: none; }

.pq-seg {
  flex: 1 1 auto;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 38px;
  padding: 0 15px;
  border: 0; border-radius: 999px;
  background: none;
  cursor: pointer;
  color: var(--c-muted);
  white-space: nowrap;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.pq-seg:hover:not(:disabled) { color: var(--c-text); background: var(--c-surface-2); }
.pq-seg:focus-visible { outline: 2px solid var(--c-trade); outline-offset: -2px; }
.pq-seg:disabled { opacity: 0.42; cursor: default; }

/* The selected segment is a raised pill in plain surface, not a tint of its own
   hue. A 13% tint read well but put the label at 4.48:1 on the dark theme --
   in dark mode a bright tone lightens the ground it has to be legible against,
   so the tint eats its own contrast. Surface is the ground the palette was
   tuned for; the hue lives in the label and the ring instead. */
.pq-seg.is-on {
  background: var(--c-surface);
  color: var(--pq-tone);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--pq-tone) 42%, transparent);
}

.pq-seg__label {
  font-family: var(--pq-mono);
  font-size: 0.66rem; font-weight: 700;
  letter-spacing: 0.13em; text-transform: uppercase;
}
.pq-seg__n {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--c-text) 9%, transparent);
  font-size: 0.66rem; font-weight: 700;
}
/* One step under the raised pill, so the count reads as inset in it. Not
   another tint of the segment's own hue -- stacking the two put the count at
   3.96:1 on the light theme. */
.pq-seg.is-on .pq-seg__n {
  background: var(--pq-panel);
  color: var(--pq-tone);
}

/* ── List ─────────────────────────────────────────────────────────────── */
.pq-list { display: flex; flex-direction: column; gap: 10px; }

/* ── Skeleton ─────────────────────────────────────────────────────────── */
.pq-sk {
  display: flex; flex-direction: column; gap: 12px;
  padding: 14px 16px 16px;
  border: 1px solid var(--pq-line, var(--c-border));
  border-radius: 16px;
  background: var(--pq-panel, var(--c-surface));
}
.pq-sk__head { display: flex; align-items: center; gap: 11px; }
.pq-sk__bit { display: block; border-radius: 6px; background: var(--c-skeleton); }
.pq-sk__deal { height: 108px; border-radius: 12px; background: var(--c-skeleton); }
.pq-sk__bit, .pq-sk__deal { animation: pq-pulse 1.6s ease-in-out infinite; }

@keyframes pq-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }

/* ── Empty and locked ─────────────────────────────────────────────────── */
.pq-blank {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px;
  padding: 64px 0;
  text-align: center;
}
.pq-blank__mark {
  display: grid; place-items: center;
  width: 54px; height: 54px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}
.pq-blank__title { margin: 0; font-size: 1rem; font-weight: 700; color: var(--c-text); }
.pq-blank__line { margin: 0; max-width: 34ch; font-size: 0.85rem; line-height: 1.55; color: var(--c-muted); }

.pq-blank__go {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 40px; margin-top: 6px; padding: 0 18px;
  border-radius: 10px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; text-decoration: none;
  transition: filter 0.16s ease;
}
.pq-blank__go:hover { filter: brightness(1.08); }
.pq-blank__go:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Four segments will not fit a phone on one line, and the bar hides its
   scrollbar, so a trader would have no way of knowing Done and Closed were
   there. Two by two instead — nothing to discover by swiping. */
@container (max-width: 560px) {
  /* A grid, not wrapped flex: flex sizes from content, and the longest label
     ("Votre tour" in French) then claims a row of its own and the bar comes out
     1 / 2 / 1. Two fixed columns, with the label tightened enough to sit in
     one. */
  .pq-bar {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: 18px;
    overflow: visible;
  }
  .pq-seg { border-radius: 14px; padding: 0 9px; }
  .pq-seg__label { letter-spacing: 0.08em; }
}

@media (pointer: coarse) {
  .pq-seg { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .pq-seg, .pq-blank__go { transition: none; }
  .pq-sk__bit, .pq-sk__deal { animation: none; }
}
</style>
