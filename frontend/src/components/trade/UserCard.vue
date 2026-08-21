<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";

const { t } = useI18n();

const props = defineProps({
  user: { type: Object, required: true },
});

const emit = defineEmits(["openTrade", "openProfile"]);

/** Thumbnails shown per side before the rest collapses into a +N chip. Rows
 *  keep a predictable height so a long list stays scannable. */
const MAX_THUMBS = 7;

const initials = computed(() => {
  const name = props.user.name?.trim();
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]?.toUpperCase() ?? "").slice(0, 2).join("");
});

const location = computed(() => [props.user.city, props.user.country].filter(Boolean).join(", "));

const verified = computed(() => (props.user.avgRating ?? 0) >= 4.0);

/** Which way cards actually move. The seam reads straight off these: an arm is
 *  lit only when something travels along it, so a one-way match looks one-way
 *  rather than being labelled one-way. */
const incoming = computed(() => props.user.theyHaveCount > 0);
const outgoing = computed(() => props.user.theyWantCount > 0);
const mutual   = computed(() => incoming.value && outgoing.value);

/** The row's one colour. Teal only when both directions are live — that is the
 *  moment two people line up, which is the only thing teal marks (DESIGN.md,
 *  The Agreement Rule). */
const kindColor = computed(() => {
  if (mutual.value) return "var(--c-mutual)";
  return incoming.value ? "var(--c-trade)" : "var(--c-accent)";
});

const seamGlyph = computed(() => {
  if (mutual.value) return "mdi-swap-horizontal";
  return incoming.value ? "mdi-arrow-left" : "mdi-arrow-right";
});
</script>

<template>
  <!--
    One match, one row: who they are, then the two piles facing each other
    across the seam. Sorted by overlap upstream, so a list keeps the ranking a
    grid would scatter.
  -->
  <div
    class="mt-row"
    :style="{ '--kind': kindColor }"
    @click="emit('openTrade', user)"
  >
    <!-- Who -->
    <div class="mt-head">
      <button
        type="button"
        class="mt-who"
        :title="t('proposal.viewProfile')"
        @click.stop="emit('openProfile', user.id)"
      >
        <span class="mt-avatar">
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            :alt="user.name ?? t('userCard.anonymous')"
          />
          <span v-else>{{ initials }}</span>
        </span>

        <span class="mt-who__text">
          <span class="mt-name">
            {{ user.name ?? t('userCard.anonymous') }}
            <v-icon
              v-if="verified"
              icon="mdi-check-decagram"
              size="14"
              :title="t('userCard.verifiedTrader')"
              style="color: var(--c-mutual); flex-shrink: 0"
            />
          </span>
          <span class="mt-meta">
            <span v-if="location" class="mt-meta__item">
              <v-icon icon="mdi-map-marker-outline" size="12" />{{ location }}
            </span>
            <span v-if="user.avgRating" class="mt-meta__item mt-meta__rating">
              <v-icon icon="mdi-star" size="12" />{{ user.avgRating }}
            </span>
          </span>
        </span>
      </button>

      <v-btn
        variant="flat"
        prepend-icon="mdi-swap-horizontal"
        class="mt-propose shrink-0"
        :style="{ backgroundColor: kindColor, color: 'var(--c-on-accent)' }"
        @click.stop="emit('openTrade', user)"
      >{{ t('userCard.propose') }}</v-btn>
    </div>

    <!-- The seam: give, join, get. Labelled from your side of the table —
         "they have" is the pile you are receiving from, which reads backwards
         when you are the one deciding. -->
    <div class="mt-axis">
      <div class="mt-side mt-side--in">
        <p class="mt-axis__label">
          {{ t('userCard.youGet') }}
          <span v-if="incoming" class="mt-axis__n tabular-nums">{{ user.theyHaveCount }}</span>
        </p>
        <div v-if="user.theyHave.length" class="mt-thumbs">
          <img
            v-for="card in user.theyHave.slice(0, MAX_THUMBS)"
            :key="`have-${card.image_id}-${card.extension}`"
            :src="cardImage(card.image_id)"
            :alt="card.name"
            class="mt-thumb"
            loading="lazy"
          />
          <span v-if="user.theyHave.length > MAX_THUMBS" class="mt-more tabular-nums">
            +{{ user.theyHave.length - MAX_THUMBS }}
          </span>
        </div>
        <p v-else class="mt-nothing">{{ t('userCard.emptyYouGet') }}</p>
      </div>

      <div class="mt-seam" :class="{ 'is-mutual': mutual }">
        <span class="mt-seam__arm" :class="{ 'is-live': incoming }" />
        <span class="mt-seam__glyph"><v-icon :icon="seamGlyph" size="15" /></span>
        <span class="mt-seam__arm" :class="{ 'is-live': outgoing }" />
      </div>

      <div class="mt-side mt-side--out">
        <p class="mt-axis__label">
          {{ t('userCard.theyGet') }}
          <span v-if="outgoing" class="mt-axis__n tabular-nums">{{ user.theyWantCount }}</span>
        </p>
        <div v-if="user.theyWant.length" class="mt-thumbs">
          <img
            v-for="card in user.theyWant.slice(0, MAX_THUMBS)"
            :key="`want-${card.image_id}-${card.extension}`"
            :src="cardImage(card.image_id)"
            :alt="card.name"
            class="mt-thumb"
            loading="lazy"
          />
          <span v-if="user.theyWant.length > MAX_THUMBS" class="mt-more tabular-nums">
            +{{ user.theyWant.length - MAX_THUMBS }}
          </span>
        </div>
        <p v-else class="mt-nothing">{{ t('userCard.emptyTheyGet') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Borrowed from the landing page, as the account and collection pages already
   do: the row sits one tonal step under the app background, hairlines are a
   fraction of the border token, and depth is a 1px top highlight rather than a
   drop shadow (DESIGN.md, The Flat-By-Default Rule). */
.mt-row {
  --mt-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --mt-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --mt-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);

  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: clamp(14px, 2vw, 20px);
  background: var(--mt-panel);
  border: 1px solid var(--mt-line-soft);
  border-radius: 18px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.mt-row:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--kind) 45%, transparent);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent),
              0 14px 34px color-mix(in srgb, var(--kind) 20%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  .mt-row { transition: border-color 0.2s ease; }
  .mt-row:hover { transform: none; }
}

/* ── Who ── */
.mt-head { display: flex; align-items: center; gap: 12px; }

.mt-who {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  cursor: pointer;
}
.mt-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 999px;
  overflow: hidden;
  background: var(--c-surface-2);
  color: var(--c-text);
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 14px;
  font-weight: 700;
}
.mt-avatar img { width: 100%; height: 100%; object-fit: cover; }

.mt-who__text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.mt-name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.015em;
  color: var(--c-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mt-who:hover .mt-name { text-decoration: underline; text-underline-offset: 3px; }

.mt-meta { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mt-meta__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.76rem;
  color: var(--c-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mt-meta__rating { color: var(--c-mutual); font-weight: 600; flex-shrink: 0; }

.mt-propose { min-height: 42px; font-size: 13px; border-radius: 11px !important; }

/* ── The seam ─────────────────────────────────────────────────────────────
   Give, join, get — the landing page's trade showcase at full scale, with the
   real piles in it. An arm lights only when cards actually travel along it, so
   a one-way match looks one-way instead of being labelled one-way. */
.mt-axis {
  display: flex;
  align-items: stretch;
  gap: 4px;
}
.mt-side {
  display: flex;
  flex-direction: column;
  gap: 9px;
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border-radius: 13px;
  border: 1px solid var(--mt-line-soft);
}
.mt-side--in  { background: color-mix(in srgb, var(--c-trade) 6%, transparent); }
.mt-side--out { background: color-mix(in srgb, var(--c-accent) 6%, transparent); }

.mt-axis__label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.mt-side--in  .mt-axis__label { color: var(--c-trade); }
.mt-side--out .mt-axis__label { color: var(--c-accent); }
/* No pill behind it. A chip tinted in the same hue as its own text sat at
   4.01:1 on the side's tint — the tint and the label are the same colour, so
   the chip was subtracting contrast from the one number that matters. Dropping
   the tracking is enough to tell the count from the label. */
.mt-axis__n { letter-spacing: 0; }

.mt-thumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.mt-thumb {
  height: 72px;
  width: 49px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: cover;
  background: var(--c-surface-2);
  outline: 1px solid var(--mt-line);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.mt-thumb:hover { transform: translateY(-3px) scale(1.06); }
@media (prefers-reduced-motion: reduce) {
  .mt-thumb, .mt-thumb:hover { transition: none; transform: none; }
}
.mt-more {
  align-self: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 14%, transparent);
}

/* An empty side is the reason this is not a mutual match, so it says which
   half is missing rather than "None". */
.mt-nothing {
  margin: 0;
  align-self: flex-start;
  max-width: 22ch;
  font-size: 0.76rem;
  line-height: 1.45;
  color: var(--c-muted);
}

.mt-seam {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  width: clamp(44px, 7%, 76px);
  /* The arrow is the colour of the direction it points, so it agrees with the
     arm it sits on rather than floating above the pair in neutral. */
  color: var(--kind);
}
.mt-seam__arm {
  flex: 1;
  height: 1px;
  border-top: 1px dashed var(--mt-line);
}
.mt-seam__arm.is-live { border-top-style: solid; }
.mt-seam__arm:first-child.is-live { border-top-color: var(--c-trade); }
.mt-seam__arm:last-child.is-live  { border-top-color: var(--c-accent); }
.mt-seam__glyph {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--mt-line);
  background: var(--mt-panel);
}
/* Closed on both sides: the only state teal marks. */
.mt-seam.is-mutual .mt-seam__glyph {
  border-color: transparent;
  background: var(--c-mutual);
  color: var(--c-on-accent);
}

.mt-row :where(button, .mt-who):focus-visible {
  outline: 2px solid var(--kind);
  outline-offset: 2px;
  border-radius: 10px;
}

/* Phones: the axis rotates. The two piles stack and the seam runs between them,
   so give-join-get survives the turn instead of being squeezed sideways. */
@media (max-width: 640px) {
  .mt-axis { flex-direction: column; }
  .mt-seam {
    flex-direction: row;
    width: auto;
    height: 26px;
    justify-content: center;
    gap: 10px;
  }
  .mt-seam__arm { max-width: 60px; }
  /* The button keeps its own width here. Stretched to the row it swallowed the
     name beside it, and a full-width primary action repeated down a list is
     louder than the list. */
  .mt-propose { padding: 0 14px !important; }
  .mt-name { font-size: 0.95rem; }
  /* Let the rating drop below rather than truncate the town out of the line —
     where somebody is is the second thing you decide on after who they are. */
  .mt-meta { flex-wrap: wrap; gap: 3px 10px; }
}
</style>
