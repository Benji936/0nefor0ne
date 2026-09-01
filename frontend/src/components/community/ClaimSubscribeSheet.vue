<script setup>
// The moment somebody is asked for a card number.
//
// It used to be the third step of a 480px dialog: a paragraph, a compact plan
// chooser, and a purple button sitting next to Cancel in a form footer. Three
// things were wrong with that, and none of them was the styling.
//
// It never said what was being bought. The reasons to verify -- turning up when
// a collector nearby searches, posting events, the mark, placement -- are
// written down, but on the /verify route, which a claimer never sees. So the
// dialog asked for money and described the purchase as "Choose how to pay".
//
// It never said which shop. The name was on the page behind the scrim.
//
// And it whispered the offer. "Free for a year" is the entire argument, and it
// was set at 14.5px between two paragraphs of the same weight.
//
// So this is full-bleed and opaque rather than a panel over a dimmed page: a
// decision about money is not a thing you make with a directory listing still
// legible behind it. The type does the persuading -- the free period is the
// largest thing on the screen, because it is the largest fact -- and the only
// ornament is the one that is not ornament: the shop's own directory row with
// the verified mark going from hollow to lit. VerifiedPreview was written for
// exactly that ("the thing being bought, shown rather than described"), and
// the claim flow was the one route buying it blind.
//
// Colour follows DESIGN.md without bending it. Amethyst is the commitment,
// used once. Teal appears only on the mark, which is the colour the directory
// already draws a verified community in -- not a green-for-go, so The
// Agreement Rule holds. Pink is absent: this is neither wanting nor cancelling.
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { FREE_DAYS, formatPrice } from "@/lib/communityPricing";
import PlanChooser from "@/components/community/PlanChooser.vue";
import PlatformIcon from "@/components/community/PlatformIcon.vue";
import VerifiedPreview from "@/components/community/VerifiedPreview.vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  community:  { type: Object,  required: true },
  /** A communityPricing() result: { currency, year, month } */
  pricing:    { type: Object,  required: true },
  /** 'year' | 'month' */
  interval:   { type: String,  default: "year" },
  submitting: { type: Boolean, default: false },
  error:      { type: String,  default: "" },
});
const emit = defineEmits(["update:modelValue", "update:interval", "confirm"]);
const { t, locale } = useI18n();

const plan = computed(() => props.pricing?.[props.interval] ?? { amount: 0 });

/**
 * The date the card is actually charged.
 *
 * Said out loud, which most paywalls do not do. "Cancel any time" asks to be
 * trusted; a date can be checked, written down, and put in a calendar, and it
 * is the answer to the question somebody handing over a card is actually
 * asking. Derived from FREE_DAYS, which is the same number the Edge Function
 * sends Stripe as trial_period_days -- so this is the real date rather than a
 * marketing approximation of it.
 */
const chargeDate = computed(() => {
  const days = FREE_DAYS[props.interval] ?? FREE_DAYS.year;
  const when = new Date(Date.now() + days * 86_400_000);
  try {
    return new Intl.DateTimeFormat(locale.value, { day: "numeric", month: "long", year: "numeric" }).format(when);
  } catch {
    return when.toISOString().slice(0, 10);
  }
});

const priceLine = computed(() =>
  t(`communityVerify.plans.${props.interval}.then`, {
    price: formatPrice(plan.value.amount, props.pricing.currency, locale.value),
  }));

// Ordered strongest first: the two that bring a stranger through the door,
// then the one that lets you play with them, then how the listing looks.
//
// Discord carries `platform` instead of `icon` because mdi has no discord glyph
// in the bundled font -- it renders as an empty gap. PlatformIcon draws it as
// an inline SVG that inherits currentColor, which is the same fix
// ClaimCommunityDialog already uses on its sign-in button.
const unlocks = [
  { icon: "mdi-map-marker-radius", key: "communityVerify.unlockNear" },
  { icon: "mdi-calendar-plus",     key: "communityVerify.unlockEvents" },
  { platform: "discord",           key: "communityVerify.unlockDiscord" },
  { icon: "mdi-check-decagram",    key: "communityVerify.unlockBadge" },
  { icon: "mdi-sort-variant",      key: "communityVerify.unlockRanking" },
];

/**
 * The mark lights once, a beat after the sheet settles.
 *
 * One orchestrated moment rather than motion scattered over the page: the only
 * thing that moves is the only thing being sold. Held off until the entrance
 * transition is done, or the change happens while the row is still sliding and
 * reads as part of the slide instead of as a state change.
 */
const lit = ref(false);
let timer = null;

watch(() => props.modelValue, (open) => {
  clearTimeout(timer);
  if (!open) { lit.value = false; return; }
  const reduced = typeof window !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) { lit.value = true; return; }   // the end state, without the trip
  lit.value = false;
  timer = setTimeout(() => { lit.value = true; }, 620);
}, { immediate: true });

onBeforeUnmount(() => clearTimeout(timer));

function close() { emit("update:modelValue", false); }
</script>

<template>
  <!-- A fade, not the bottom slide the small dialogs use. Vuetify's
       dialog-bottom-transition never completes on a fullscreen dialog: the
       content stays parked at translateY(100%) with the enter-from class still
       on it. A full-page takeover also reads better arriving in place than
       sliding up like a sheet. -->
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    fullscreen
    transition="fade-transition"
  >
    <div class="cs">
      <!-- Who is being claimed, kept in the corner rather than made a title.
           The reader knows which shop they clicked; they need it confirmed,
           not announced. -->
      <header class="cs__top">
        <p class="cs__who">
          <span class="cs__eyebrow">{{ t('claimSheet.eyebrow') }}</span>
          <span class="cs__shop">{{ community.name }}</span>
        </p>
        <button type="button" class="cs__close" :aria-label="t('common.close')" @click="close">
          <v-icon icon="mdi-close" size="20" />
        </button>
      </header>

      <div class="cs__cols">
        <!-- Three blocks, not two, because a phone wants them in a different
             order from a desktop. Stacked, the shop and the offer come first
             and the reasons come last: somebody who has just proved they own
             the place is deciding whether to pay, not being introduced to the
             product. Side by side, the reasons rejoin the preview in the left
             column. Grid areas do the reordering, so the DOM keeps the order a
             screen reader should hear -- what it is, what it costs, then why. -->
        <section class="cs__stage">
          <VerifiedPreview :community="community" :verified="lit" class="cs__preview" />
        </section>

        <section class="cs__decide" aria-labelledby="cs-offer">
          <!-- The offer, at the size the offer deserves. This line was 14.5px
               and buried; it is the argument, so it is the headline. -->
          <p class="cs__offer" id="cs-offer">
            {{ t(`communityVerify.plans.${interval}.free`) }}
          </p>
          <p class="cs__then mono">{{ priceLine }}</p>

          <PlanChooser
            :model-value="interval"
            :pricing="pricing"
            class="cs__chooser"
            @update:model-value="emit('update:interval', $event)"
          />

          <div v-if="error" class="cs__error" role="alert">
            <v-icon icon="mdi-alert-circle-outline" size="15" aria-hidden="true" />
            {{ error }}
          </div>

          <button type="button" class="cs__go" :disabled="submitting" @click="emit('confirm')">
            <v-progress-circular v-if="submitting" indeterminate size="17" width="2" />
            <template v-else>
              <v-icon icon="mdi-credit-card-outline" size="17" aria-hidden="true" />
              {{ t(`communityVerify.plans.${interval}.action`) }}
            </template>
          </button>

          <!-- A date, not a reassurance. "Cancel any time" asks to be believed;
               31 August 2027 can be written in a diary. -->
          <p class="cs__when">{{ t('claimSheet.chargeOn', { date: chargeDate }) }}</p>

          <button type="button" class="cs__back" :disabled="submitting" @click="close">
            {{ t('community.cancel') }}
          </button>
        </section>

        <section class="cs__why" aria-labelledby="cs-unlocks">
          <h2 id="cs-unlocks" class="cs__label">{{ t('communityVerify.unlocksTitle') }}</h2>
          <ul class="cs__unlocks">
            <li v-for="u in unlocks" :key="u.key">
              <PlatformIcon v-if="u.platform" :platform="u.platform" :size="15" class="cs__unlockIcon" />
              <v-icon v-else :icon="u.icon" size="15" aria-hidden="true" />
              <span>{{ t(u.key) }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </v-dialog>
</template>

<style scoped>
/* Opaque and full-bleed. The three-surface stack does the depth; there is no
   scrim because there is nothing behind worth seeing through to. */
.cs {
  min-height: 100dvh;
  background: var(--c-bg);
  color: var(--c-text);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.cs__top {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 20px 22px 0;
  flex-shrink: 0;
}
.cs__who { margin: 0; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cs__eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--c-muted);
}
.cs__shop {
  font-size: 15px; font-weight: 800; line-height: 1.25;
  color: var(--c-text);
  overflow-wrap: anywhere;
}
.cs__close {
  margin-left: auto; flex-shrink: 0;
  width: 38px; height: 38px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.cs__close:hover { background: var(--c-surface-2); color: var(--c-text); }
.cs__close:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Grid rather than flex, for one reason: align-content centres the whole block
   of rows in the viewport while align-items keeps the two columns top-aligned
   to each other. Centring them as flex items instead centres each one
   independently, and because the decision column is much taller than the
   preview column that reads as two things that missed each other. */
.cs__cols {
  flex: 1;
  width: 100%; max-width: 1040px; margin: 0 auto;
  padding: 22px 22px 40px;
  display: grid; grid-template-columns: 1fr;
  grid-template-areas: "stage" "decide" "why";
  align-content: center; align-items: start;
  gap: 26px;
}
.cs__stage  { grid-area: stage; }
.cs__decide { grid-area: decide; }
.cs__why    { grid-area: why; }

/* ── What it turns on ──────────────────────────────────────────────────── */
/* VerifiedPreview ships 26px of its own bottom margin; this only widens it
   to match the column rather than stacking a second gap on top. */
/* VerifiedPreview ships 26px of its own bottom margin, which the grid gap
   would double. Zero it and let the gap do the spacing. */
.cs__preview { max-width: 100%; margin-bottom: 0; }

.cs__label {
  margin: 0 0 12px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--c-muted);
}
.cs__unlocks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 11px; }
.cs__unlocks li {
  display: flex; align-items: flex-start; gap: 10px;
  font-size: 13.5px; line-height: 1.55; color: var(--c-text);
  max-width: 46ch;
}
/* Both glyph kinds share one rule: PlatformIcon renders an <svg>, not a
   .v-icon, and would otherwise miss the colour and the optical nudge. */
.cs__unlocks .v-icon,
.cs__unlocks .cs__unlockIcon { color: var(--c-trade); flex-shrink: 0; margin-top: 2px; }

/* ── The decision ──────────────────────────────────────────────────────── */
.cs__decide { display: flex; flex-direction: column; align-items: flex-start; }

/* The offer. Weight and size carry it -- no gradient text, no glow. */
.cs__offer {
  margin: 0;
  font-size: clamp(2rem, 6vw, 3.25rem);
  font-weight: 800;
  line-height: 1.02;
  letter-spacing: -0.025em;
  color: var(--c-text);
  max-width: 13ch;
  /* The line lengths differ per plan and per language -- "Free for a month",
     "Sechs Monate gratis", "Six mois gratuits" -- so let the browser split them
     evenly rather than leaving one word stranded on the second line. */
  text-wrap: balance;
}
/* Mono for the money, the way set codes are mono: a figure you check rather
   than a phrase you read. */
.cs__then {
  margin: 12px 0 0;
  font-size: 13.5px; font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--c-muted);
}
.mono { font-family: ui-monospace, "Cascadia Code", SFMono-Regular, Menlo, monospace; }

.cs__chooser { margin-top: 26px; }

.cs__error {
  display: flex; align-items: center; gap: 7px;
  margin-top: 18px; padding: 10px 13px; border-radius: 10px;
  background: color-mix(in srgb, var(--c-accent) 14%, transparent);
  color: var(--c-accent);
  font-size: 12.5px; font-weight: 600;
}

/* One commitment, one amethyst. Nothing else on the page is this colour. */
.cs__go {
  display: flex; align-items: center; justify-content: center; gap: 9px;
  margin-top: 24px;
  width: 100%; max-width: 340px;
  min-height: 50px; padding: 0 26px;
  border-radius: 13px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 14.5px; font-weight: 800; letter-spacing: 0.01em;
  cursor: pointer;
  /* Opacity rather than a lighter purple. DESIGN.md's button-trade-hover
     (#B56EFF) is the dark theme's value, and hardcoding it lightened the
     button under white label text in light mode. Every other primary in the
     app dims instead, so this matches them and works in both themes. */
  transition: opacity .15s ease, transform .15s ease;
}
.cs__go:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
.cs__go:focus-visible { outline: 2px solid var(--c-text); outline-offset: 3px; }
.cs__go:disabled { opacity: .45; pointer-events: none; }
.cs__go :deep(.v-progress-circular) { color: var(--c-on-accent); }

.cs__when {
  margin: 13px 0 0;
  font-size: 12.5px; line-height: 1.55; color: var(--c-muted);
  max-width: 40ch;
}

.cs__back {
  margin-top: 22px; padding: 6px 0;
  background: none; border: none;
  font-size: 13px; font-weight: 600; color: var(--c-muted);
  cursor: pointer;
  transition: color .15s ease;
}
.cs__back:hover { color: var(--c-text); }
.cs__back:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }
.cs__back:disabled { opacity: .45; pointer-events: none; }

/* ── Wide ──────────────────────────────────────────────────────────────── */
@media (min-width: 860px) {
  .cs__top { padding: 28px 40px 0; }
  /* On a tall desktop window the whole decision used to sit against the top
     edge with half a screen of nothing beneath it, which read as a page that
     had failed to load rather than as a considered one. */
  .cs__cols {
    grid-template-columns: minmax(0, 44fr) minmax(0, 56fr);
    grid-template-areas:
      "stage decide"
      "why   decide";
    grid-template-rows: auto auto;
    column-gap: 72px; row-gap: 26px;
    padding: 40px 40px 56px;
  }
  /* The decision spans both rows and pins to the top of them, so it starts on
     the preview's line instead of floating to the middle of a tall column. */
  .cs__decide { align-self: start; }
  .cs__stage  { padding-top: 6px; }
  .cs__offer  { font-size: clamp(2.5rem, 3.6vw, 3.4rem); }
}

@media (prefers-reduced-motion: reduce) {
  .cs__go { transition: opacity .15s ease; }
  .cs__go:hover:not(:disabled) { transform: none; }
}
</style>
