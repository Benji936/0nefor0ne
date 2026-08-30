<script setup>
// The trade conversation, docked to the corner of the trade page.
//
// It has been three things. A modal stacked on the proposals modal, which is
// part of why the trade got its own page. A panel in the page's rail, where it
// sat under three panels that move as the trade advances, so it moved down the
// page every time the trade did. Then the foot of the main column, where you
// had to scroll past everything to reach it and lost sight of the cards you
// were discussing on the way.
//
// The thing all three got wrong is that this is the only live surface on a page
// that is otherwise a record. A conversation has to be reachable from wherever
// you are reading, has to be able to say that something arrived, and must not
// take the cards off the screen -- every message here is about a card that is
// on the page.
//
// So: a handle that stays put while the page scrolls, and a panel that opens
// beside the trade rather than over it. No scrim on a desktop, where the two
// piles sit to its left and stay readable. A scrim on a phone, where nothing is
// visible behind it anyway and the dismiss target needs to be obvious.
//
// The panel stays mounted while collapsed, hidden and inert. That keeps the
// realtime subscription live -- which is what lets the handle count arrivals --
// and it means a half-typed message survives closing the sleeve.
import { ref, computed, watch, nextTick, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import TradeChatPanel from "@/components/trade/TradeChatPanel.vue";

const props = defineProps({
  proposal:      { type: Object, default: null },
  currentUserId: { type: String, default: null },
  // Hosts close the sleeve when they raise a dialog of their own, so the page
  // never ends up with a panel behind a modal that cannot be reached.
  suspended:     { type: Boolean, default: false },
});

const { t } = useI18n();

const open      = ref(false);
const handleRef = ref(null);
const panelRef  = ref(null);

const name = computed(() => props.proposal?.counterparty_name ?? t('common.anonymous'));

// Cancelled, declined and completed trades keep their conversation as a record.
const writable = computed(() =>
  ["pending", "accepted"].includes(props.proposal?.status));

const label = computed(() => writable.value
  ? t('tradeChat.openWith', { name: name.value })
  : t('tradeChat.readOnlyWith', { name: name.value }));

/* ── What arrived while you were not looking ───────────────────────────────
   Counted in this session only, because nothing in the schema records what a
   trader has read -- there is no read_at and no last_read anywhere. A count
   that resets on reload is honest about that; a badge claiming to know what
   you have seen would not be. The copy says "since you opened this page" for
   the same reason. Persisting it is one migration away, and the handle has
   the room for it already. */
const total  = ref(null);   // null until the first load lands
const unseen = ref(0);

function onCount(n) {
  if (total.value === null || n < total.value) { total.value = n; return; }
  if (n > total.value && !open.value) unseen.value += n - total.value;
  total.value = n;
}

async function show() {
  open.value = true;
  unseen.value = 0;
  await nextTick();
  // The composer, because opening a conversation is almost always to answer
  // it. On a read-only trade there is no composer, so the panel takes focus.
  const input = panelRef.value?.querySelector("input");
  (input ?? panelRef.value)?.focus?.();
}

function hide({ restoreFocus = true } = {}) {
  if (!open.value) return;
  open.value = false;
  if (restoreFocus) nextTick(() => handleRef.value?.focus?.());
}

function onKeydown(e) {
  if (e.key === "Escape") { e.stopPropagation(); hide(); }
}

// A host raising its own dialog takes the sleeve down with it. Focus is not
// restored to the handle here -- the dialog wants it.
watch(() => props.suspended, (s) => { if (s) hide({ restoreFocus: false }); });

// Navigating between trades on the same mounted page must not leave the
// previous conversation open with the next trade's cards behind it.
watch(() => props.proposal?.id, () => {
  hide({ restoreFocus: false });
  total.value = null;
  unseen.value = 0;
});

onBeforeUnmount(() => { open.value = false; });
</script>

<template>
  <div v-if="proposal" class="cs">
    <!-- Phone only: the panel covers the page, so it gets something to close
         against. On a desktop the page stays live and there is no scrim. -->
    <div v-if="open" class="cs__scrim" @click="hide()" />

    <button
      ref="handleRef"
      type="button"
      class="cs__handle"
      :class="{ 'is-hidden': open }"
      :aria-expanded="open"
      aria-controls="trade-chat-sleeve"
      @click="show"
    >
      <v-icon icon="mdi-message-outline" size="17" aria-hidden="true" />
      <span class="cs__handle-label">{{ label }}</span>
      <span v-if="unseen" class="cs__new" :title="t('tradeChat.sinceOpened')">
        {{ t('tradeChat.newCount', { count: unseen }, unseen) }}
      </span>
    </button>

    <!-- Kept in the tree while closed so the subscription stays live and a
         half-written message survives. `inert` takes it out of the tab order
         and off the accessibility tree in the same breath. -->
    <section
      id="trade-chat-sleeve"
      ref="panelRef"
      class="cs__panel"
      :class="{ 'is-open': open }"
      :inert="!open || undefined"
      :aria-hidden="!open || undefined"
      role="dialog"
      aria-modal="false"
      aria-labelledby="trade-chat-sleeve-title"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <header class="cs__head">
        <span class="cs__face" aria-hidden="true">
          <img v-if="proposal.counterparty_avatar_url" :src="proposal.counterparty_avatar_url" alt="" />
          <span v-else>{{ name[0].toUpperCase() }}</span>
        </span>
        <span class="cs__who">
          <strong id="trade-chat-sleeve-title">{{ name }}</strong>
          <small>{{ t('tradeChat.visibleToBoth') }}</small>
        </span>
        <button type="button" class="cs__close" :aria-label="t('tradeChat.closeChat')" @click="hide()">
          <v-icon icon="mdi-close" size="18" />
        </button>
      </header>

      <div class="cs__body">
        <TradeChatPanel
          :open="true"
          :proposal="proposal"
          :current-user-id="currentUserId"
          :standalone="true"
          @count="onCount"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Borrows the trade page's surface vocabulary rather than redeclaring it, with
   fallbacks so the sleeve still draws correctly under a host that sets none. */
.cs {
  --cs-panel: var(--td-panel, var(--c-surface));
  --cs-line: var(--td-line, var(--c-border));
  --cs-mono: ui-monospace, "Cascadia Code", SFMono-Regular, Menlo, monospace;
}

/* ── The handle ───────────────────────────────────────────────────────────
   Named for the person, in the register the rest of the page labels things in
   (DESIGN.md, The Mono Identifier Rule) rather than a floating bubble that
   could belong to any product. Amethyst: talking is how you move a trade
   along, which is offering, not agreeing -- teal stays on the seam. */
.cs__handle {
  position: fixed;
  z-index: 40;
  right: 20px;
  bottom: 20px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: calc(100vw - 40px);
  padding: 11px 18px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-trade);
  cursor: pointer;
  font-family: var(--cs-mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  box-shadow: 0 10px 30px color-mix(in srgb, var(--c-bg) 55%, transparent);
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease, background-color 0.16s ease;
}
.cs__handle:hover { background: var(--c-surface-2); }
.cs__handle:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; }
.cs__handle.is-hidden { opacity: 0; transform: translateY(8px) scale(0.96); pointer-events: none; }

.cs__handle-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.cs__new {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--c-trade);
  color: var(--c-on-accent);
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
}

/* ── The panel ───────────────────────────────────────────────────────────── */
.cs__scrim {
  position: fixed;
  inset: 0;
  z-index: 41;
  background: color-mix(in srgb, var(--c-bg) 62%, transparent);
}

.cs__panel {
  position: fixed;
  z-index: 42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--cs-panel);
  border: 1px solid var(--cs-line);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--c-bg) 62%, transparent);
  /* Closed: still rendered, so the subscription runs and a draft survives.
     Visibility is stepped rather than transitioned, and only its *timing*
     changes between the two states: it flips to visible at once on the way in,
     so the composer can take focus in the same tick, and waits for the fade on
     the way out so the panel does not blink away. */
  visibility: hidden;
  opacity: 0;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease,
    visibility 0s linear 0.22s;
}
.cs__panel.is-open {
  visibility: visible;
  opacity: 1;
  transform: none;
  transition:
    transform 0.22s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.18s ease,
    visibility 0s linear 0s;
}

/* Phone: a sheet up from the bottom edge, under the thumb. */
.cs__panel {
  right: 0;
  bottom: 0;
  left: 0;
  height: min(78dvh, 620px);
  border-width: 1px 0 0;
  border-radius: 20px 20px 0 0;
  transform: translateY(14px);
}

/* Desktop: a column at the right edge, clear of the page, with the two piles
   still lit to its left. */
@media (min-width: 1024px) {
  .cs__scrim { display: none; }
  .cs__panel {
    left: auto;
    right: 20px;
    bottom: 20px;
    width: clamp(340px, 26vw, 420px);
    height: min(640px, calc(100dvh - 104px));
    border-width: 1px;
    border-radius: 18px;
    transform: translateY(10px) scale(0.985);
    transform-origin: bottom right;
  }
}

.cs__head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--cs-line);
}
.cs__face {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--c-trade) 18%, transparent);
  color: var(--c-trade);
  font-weight: 800;
  font-size: 0.85rem;
}
.cs__face img { width: 100%; height: 100%; object-fit: cover; }

.cs__who { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.cs__who strong {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cs__who small {
  font-family: var(--cs-mono);
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.cs__close {
  flex: none;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--c-muted);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.cs__close:hover { background: var(--c-surface-2); color: var(--c-text); }
.cs__close:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.cs__body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.cs__body > * { flex: 1; min-height: 0; }

@media (pointer: coarse) {
  .cs__handle { padding: 14px 20px; }
  .cs__close { width: 44px; height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .cs__handle { transition: none; transform: none; }
  .cs__panel,
  .cs__panel.is-open { transition: visibility 0s linear 0s; transform: none; }
}
</style>
