<script setup>
/**
 * The board: every announce that is currently up, offers and wants together.
 *
 * A classified board has one fact no other page in this app has — it is two
 * boards in one. Half the notes say "I have this", half say "I am after this",
 * and which half is thick this week decides what is worth posting. So the
 * filter is not a segmented pill floating above the grid: it IS that split,
 * two panels sized by their own counts (see .an-bar). Pressing one narrows the
 * board to it; the widths keep telling the truth about the whole board either
 * way, which is why they are computed from `announces` and not from what is
 * showing.
 *
 * Teal appears nowhere on this page. Looking For used to be teal, and wanting
 * is pink — teal is the agreement chain and nothing else (DESIGN.md, The
 * Agreement Rule). With that corrected, amethyst means offering and pink means
 * wanting on every surface here, including the card hover glows and the post
 * button, which takes the colour of the kind it is about to create.
 */
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AnnounceCard from "@/components/trade/AnnounceCard.vue";
import UpcomingEventsRow from "@/components/community/UpcomingEventsRow.vue";
import { ANNOUNCE_KIND } from "@/lib/announceKind";
import { ANNOUNCE_TTL_DAYS } from "@/lib/announceExpiry";

const props = defineProps({
  login:     { type: Object,  default: null },
  loading:   { type: Boolean, default: false },
  announces: { type: Array,   default: () => [] },
});

const emit = defineEmits(["openCreate", "openDetail", "requireAuth"]);
const { t } = useI18n();

// null means both halves. Otherwise one ANNOUNCE_KIND.
const kindFilter  = ref(null);
const searchQuery = ref("");

const currentUserId = computed(() => props.login?.user?.id ?? null);

// Rows written before the kind column existed default to 'sell' in the
// database, so this is belt-and-braces for optimistic local inserts.
const kindOf = (a) => a.kind ?? ANNOUNCE_KIND.SELL;

// Ownership needs the id, not just equality: a community announce posted from
// Discord has a null seller, and `null === null` would hand every one of them
// to a signed-out visitor as their own.
const isMine = (a) => !!currentUserId.value && a.seller === currentUserId.value;

const total = computed(() => props.announces.length);

// The two halves, measured over the whole board rather than over what is
// filtered — a bar that re-proportioned itself to the selection would only
// ever be able to show 100%.
const sides = computed(() => {
  const sell = props.announces.filter((a) => kindOf(a) === ANNOUNCE_KIND.SELL).length;
  return [
    { key: ANNOUNCE_KIND.SELL,        label: t("announces.filterSelling"),    n: sell,
      color: "var(--c-trade)" },
    { key: ANNOUNCE_KIND.LOOKING_FOR, label: t("announces.filterLookingFor"), n: total.value - sell,
      color: "var(--c-accent)" },
  ];
});

// Stacked on a phone the segment widths are gone, so each row draws its share
// as a fill instead. Kept as a percentage string so the template can hand it
// straight to a custom property.
const share = (n) => `${total.value ? Math.round((n / total.value) * 100) : 0}%`;

const isLf = computed(() => kindFilter.value === ANNOUNCE_KIND.LOOKING_FOR);
const narrowed = computed(() => !!kindFilter.value || !!searchQuery.value.trim());

function pickSide(key) {
  // Pressing the open half closes it, which is the fast way back to the whole
  // board. The clear control next to the search box is the obvious way.
  kindFilter.value = kindFilter.value === key ? null : key;
}

function clearFilters() {
  kindFilter.value = null;
  searchQuery.value = "";
}

const shown = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return props.announces.filter((a) => {
    if (kindFilter.value && kindOf(a) !== kindFilter.value) return false;
    if (!q) return true;
    return (a.title || "").toLowerCase().includes(q)
      || (a.description || "").toLowerCase().includes(q)
      || (a.archetype   || "").toLowerCase().includes(q)
      || (a.want_detail || "").toLowerCase().includes(q);
  });
});

// The search box narrows your own row too. It used to run on the board only,
// so searching left three unrelated posts of yours pinned above one match and
// read as a broken filter.
const mine  = computed(() => shown.value.filter(isMine));
const board = computed(() => shown.value.filter((a) => !isMine(a)));

// The create button defaults to the open half's kind (Looking For when that
// half is open, Selling otherwise, including when the whole board is showing).
// The dialog's own kind toggle still lets the user switch afterwards.
function openCreate() {
  // Browsing is open to everyone; posting is not. A guest who presses this gets
  // the login dialog rather than a create form that would fail on submit.
  if (!props.login?.user) return emit("requireAuth");
  emit("openCreate", isLf.value ? ANNOUNCE_KIND.LOOKING_FOR : ANNOUNCE_KIND.SELL);
}
</script>

<template>
  <!-- No signed-out padlock here. The board is public: announces are readable
       by anon in the database, and this is the page a stranger arriving from
       the landing nav lands on. What needs a session is posting and
       contacting, and each of those asks at the point it is pressed. -->
  <div class="an">

    <!-- ── The split ─────────────────────────────────────────────────────
         Two panels, each grown by its own count. What is thick on the board
         this week is the first thing the page says, and pressing a half is
         how you narrow to it. -->
    <div class="an-head">
      <div v-if="loading" class="an-bar">
        <div v-for="i in 2" :key="i" class="an-side an-side--sk animate-pulse motion-reduce:animate-none" />
      </div>

      <div v-else-if="total" class="an-bar" role="group" :aria-label="t('announces.onTheBoard')">
        <button
          v-for="s in sides"
          :key="s.key"
          type="button"
          class="an-side"
          :class="{ 'is-on': kindFilter === s.key, 'is-dim': kindFilter && kindFilter !== s.key }"
          :style="{ '--kind': s.color, '--grow': Math.max(s.n, 0), '--share': share(s.n) }"
          :aria-pressed="kindFilter === s.key"
          @click="pickSide(s.key)"
        >
          <span class="an-side__label">{{ s.label }}</span>
          <span class="an-side__n tabular-nums">{{ s.n }}</span>
        </button>
      </div>

      <div class="an-tools">
        <div class="an-search">
          <v-icon icon="mdi-magnify" size="16" class="an-search__icon" />
          <input
            v-model="searchQuery"
            type="search"
            class="an-search__input"
            :placeholder="t('announces.search')"
            :aria-label="t('announces.search')"
          />
        </div>

        <button v-if="narrowed" type="button" class="an-clear" @click="clearFilters">
          <v-icon icon="mdi-close" size="13" />{{ t('announces.filterAll') }}
        </button>

        <!-- Amethyst offers, pink wants: the button wears the colour of the
             post it is about to open. -->
        <button
          type="button"
          class="an-post"
          :style="{ '--kind': isLf ? 'var(--c-accent)' : 'var(--c-trade)' }"
          @click="openCreate"
        >
          <v-icon icon="mdi-plus" size="17" />
          {{ isLf ? t('announces.newLookingFor') : t('announces.newAnnounce') }}
        </button>
      </div>
    </div>

    <!-- Loading: the shape of the grid, so nothing jumps when it lands. -->
    <div v-if="loading" class="an-grid">
      <div v-for="i in 8" :key="i" class="an-sk animate-pulse motion-reduce:animate-none" />
    </div>

    <template v-else>
      <!-- Self-hiding: renders nothing when no events are coming up, so it
           costs no vertical space on a quiet week. -->
      <UpcomingEventsRow :user-id="currentUserId" />

      <!-- Nothing up at all. The one place worth teaching how long a post
           lasts, because it is the question you have before you write one. -->
      <div v-if="total === 0" class="an-blank">
        <div class="an-blank__mark">
          <v-icon icon="mdi-bulletin-board" size="26" color="var(--c-muted)" />
        </div>
        <p class="an-blank__title">{{ t('announces.noAnnouncesTitle') }}</p>
        <p class="an-blank__body">{{ t('announces.noAnnouncesDesc', { days: ANNOUNCE_TTL_DAYS }) }}</p>
        <button type="button" class="an-post" style="--kind: var(--c-trade)" @click="openCreate">
          <v-icon icon="mdi-plus" size="17" />{{ t('announces.newAnnounce') }}
        </button>
      </div>

      <template v-else>
        <!-- Yours: the same tile as the board, in the same grid. It used to be
             a horizontal scroller, which hid every post past the third — and
             yours are the ones you came here to renew or edit. -->
        <section v-if="mine.length" class="an-section">
          <p class="an-eyebrow">
            {{ t('announces.myAnnounces') }}
            <span class="an-eyebrow__n tabular-nums">{{ mine.length }}</span>
          </p>
          <div class="an-grid">
            <AnnounceCard
              v-for="a in mine"
              :key="a.id"
              :announce="a"
              :current-user-id="currentUserId"
              @click="emit('openDetail', a)"
            />
          </div>
        </section>

        <section class="an-section">
          <p v-if="board.length" class="an-eyebrow">
            {{ t('announces.onTheBoard') }}
            <span class="an-eyebrow__n tabular-nums">{{ board.length }}</span>
          </p>

          <!-- The open half is empty. Posting into it is the answer, so the
               button says which half it will post to. -->
          <div v-if="shown.length === 0 && kindFilter && !searchQuery.trim()" class="an-blank">
            <p class="an-blank__title">
              {{ isLf ? t('announces.noLookingForTitle') : t('announces.noSellingTitle') }}
            </p>
            <p class="an-blank__body">
              {{ isLf ? t('announces.noLookingForDesc') : t('announces.noAnnouncesDesc', { days: ANNOUNCE_TTL_DAYS }) }}
            </p>
            <button
              type="button"
              class="an-post"
              :style="{ '--kind': isLf ? 'var(--c-accent)' : 'var(--c-trade)' }"
              @click="openCreate"
            >
              <v-icon icon="mdi-plus" size="17" />
              {{ isLf ? t('announces.newLookingFor') : t('announces.newAnnounce') }}
            </button>
          </div>

          <!-- Nothing matched what was typed. -->
          <div v-else-if="shown.length === 0" class="an-blank an-blank--sm">
            <p class="an-blank__body">{{ t('announces.noSearchResults') }}</p>
            <button type="button" class="an-clear" @click="clearFilters">
              <v-icon icon="mdi-close" size="13" />{{ t('announces.filterAll') }}
            </button>
          </div>

          <!-- Yours are the only ones up. -->
          <p v-else-if="board.length === 0" class="an-note">{{ t('announces.onlyYours') }}</p>

          <div v-else class="an-grid">
            <AnnounceCard
              v-for="a in board"
              :key="a.id"
              :announce="a"
              :current-user-id="currentUserId"
              @click="emit('openDetail', a)"
            />
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
/* Borrowed from the landing page (its --lp-* set), as the account, collection,
   matches and home pages already do: panels sit one tonal step under the page
   rather than above it, hairlines are a fraction of the border token, and depth
   is a 1px top highlight instead of a drop shadow — lit from above, per
   DESIGN.md's Flat-By-Default Rule.
   Read by AnnounceCard through :deep below, so the tiles and the board they
   sit on share one ground. */
.an {
  --an-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --an-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --an-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --an-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

  display: flex;
  flex-direction: column;
  gap: clamp(26px, 4vw, 38px);
  padding-bottom: 48px;
}

.an-head { display: flex; flex-direction: column; gap: 14px; }

/* ── The split ─────────────────────────────────────────────────────────── */
.an-bar { display: flex; gap: 8px; }

.an-side {
  /* Both halves are given a kind inline; this is only so the skeleton, which is
     not, still has a colour to mix against rather than a declaration that is
     invalid at computed-value time. */
  --kind: var(--c-trade);

  /* The measurement. `--grow` is the raw count, so a board of 34 offers and 12
     wants is drawn 34:12; the min-width stops an extreme skew from squeezing
     the thin half down to an unreadable sliver. */
  flex: var(--grow, 1) 0 0;
  min-width: 9.5rem;

  position: relative;
  display: flex;
  align-items: center;
  /* Label and count stay a pair at the left edge rather than sitting at
     opposite ends of the panel. The proportion is read from where the panel
     stops; pushing the number out there too left it stranded half a screen
     from the word it belongs to. */
  justify-content: flex-start;
  gap: 10px;
  padding: 13px 16px;
  border-radius: 13px;
  /* Tinted in its own kind, not left on the page's own ground. The length of
     each band is the measurement here, so the eye has to be able to find where
     one stops — and a 1px hairline at 1.49:1 is not enough to carry a number.
     The tint is faint enough that the label on it still clears AA. */
  border: 1px solid color-mix(in srgb, var(--kind) 26%, transparent);
  background: color-mix(in srgb, var(--kind) 10%, var(--an-panel));
  box-shadow: var(--an-lit);
  cursor: pointer;
  text-align: left;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}
.an-side:hover { border-color: color-mix(in srgb, var(--kind) 55%, transparent); }
.an-side:focus-visible { outline: 2px solid var(--kind); outline-offset: 2px; }

.an-side__label {
  position: relative;
  min-width: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.an-side__n {
  position: relative;
  flex-shrink: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--kind);
}

/* Open. The half you are looking at is filled with its own colour. */
.an-side.is-on { background: var(--kind); border-color: transparent; box-shadow: none; }
.an-side.is-on .an-side__label,
.an-side.is-on .an-side__n { color: var(--c-on-accent); }
.an-side.is-on:hover { filter: brightness(1.06); }

/* Closed while the other half is open. Drained back to the page's own ground
   and stripped of its colour, but never by an opacity — that would take the one
   number on the control down with it. */
.an-side.is-dim {
  background: var(--an-panel);
  border-color: var(--an-line);
}
.an-side.is-dim .an-side__n { color: var(--c-muted); }

.an-side--sk {
  flex: 1 0 0;
  height: 48px;
  border-color: transparent;
  background: var(--c-skeleton);
  box-shadow: none;
  cursor: default;
}

/* ── Tools ─────────────────────────────────────────────────────────────── */
.an-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }

.an-search { position: relative; flex: 1 1 210px; max-width: 360px; }
.an-search__icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--c-muted);
}
.an-search__input {
  width: 100%;
  padding: 10px 12px 10px 36px;
  border-radius: 12px;
  font-size: 0.86rem;
  color: var(--c-text);
  background: var(--an-panel);
  border: 1px solid var(--an-line);
  outline: none;
  transition: border-color 0.15s ease;
}
.an-search__input::placeholder { color: var(--c-muted); }
.an-search__input:hover { border-color: color-mix(in srgb, var(--c-trade) 40%, transparent); }
.an-search__input:focus-visible { border-color: var(--c-trade); outline: 2px solid var(--c-trade); outline-offset: 1px; }

/* Same shape as the matches tab's clear control, so the two tabs answer a
   narrowed list the same way. */
.an-clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--c-muted);
  background: transparent;
  border: 1px solid var(--an-line-soft);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.an-clear:hover { color: var(--c-text); border-color: var(--an-line); }
.an-clear:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }

.an-post {
  --kind: var(--c-trade);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  padding: 10px 17px;
  border-radius: 12px;
  font-size: 0.84rem;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  background: var(--kind);
  color: var(--c-on-accent);
  transition: filter 0.15s ease;
}
.an-post:hover { filter: brightness(1.08); }
.an-post:focus-visible { outline: 2px solid var(--kind); outline-offset: 3px; }

/* ── Sections ──────────────────────────────────────────────────────────── */
.an-section { display: flex; flex-direction: column; gap: 16px; }

/* Section labels in the collector's own register: monospace, uppercase, widely
   tracked (DESIGN.md, The Mono Identifier Rule), matching the account,
   collection, matches and home pages. */
.an-eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--an-line-soft);
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.an-eyebrow__n { letter-spacing: 0; color: var(--c-text); }

.an-note { margin: 0; font-size: 0.86rem; color: var(--c-muted); }

.an-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}

.an-sk {
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  background: var(--c-skeleton);
}

/* ── Blank states ──────────────────────────────────────────────────────── */
.an-blank {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 60px 20px;
  text-align: center;
}
.an-blank--sm { padding: 34px 20px; }
.an-blank__mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--c-muted) 12%, transparent);
}
.an-blank__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.12rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--c-text);
}
.an-blank__body {
  margin: 0;
  max-width: 38ch;
  font-size: 0.88rem;
  line-height: 1.55;
  color: var(--c-muted);
}
.an-blank .an-post { margin-left: 0; }

@media (max-width: 560px) {
  /* Stacked, the widths no longer carry the split, so each half draws its own
     share as a fill behind the label instead. Same fact, told with a length
     either way. */
  .an-bar { flex-direction: column; }
  .an-side { min-width: 0; overflow: hidden; }
  .an-side::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: var(--share, 0%);
    /* Rounded where the row starts, square where the measurement stops — a
       rounded far edge would read as a pill sitting in the row rather than as
       a length running out. Clipped by the row at 100%. */
    border-radius: 12px 0 0 12px;
    background: color-mix(in srgb, var(--kind) 18%, transparent);
  }
  .an-side.is-on::before { display: none; }

  .an-post { margin-left: 0; flex: 1 1 auto; justify-content: center; }
  .an-grid { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
}
</style>
