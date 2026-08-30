<script setup>
// One trade, as a line in a queue.
//
// This used to be a tall card: a header, two tinted half-panels of fanned art,
// a footer of buttons, and a rating form hanging off the bottom. It stood about
// 330px, so a laptop showed two of them, and the question the page exists to
// answer -- which of these is waiting on me -- was 12px of muted text at the
// bottom of each one.
//
// Now it is a strip. Who, when, and whose turn it is on the top line; the two
// piles facing each other across the same seam the trade page uses, so the list
// and the trade read as the same object at two zoom levels; and one button
// saying the verb. The prose line only appears when it says something the
// button does not.
import { ref, computed } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage } from "@/lib/cardImage";
import { getClient } from "@/lib/supabaseClient";
import { timeAgo } from "@/lib/notifications";
import { pendingWaitKey } from "@/lib/tradePending";
import { tradeNextAction, tradePhase } from "@/lib/tradeWorkflow";
import { isYourMove, isOpen, isDone } from "@/lib/proposalQueue";

const { t, locale } = useI18n();

const props = defineProps({
  proposal:      { type: Object, required: true },
  currentUserId: { type: String, default: null },
});

// accept / decline / counter used to come out of the detail dialog this row
// hosted. That dialog is a page now, and the page performs those itself, so the
// row emits only the actions its own footer offers.
const emit = defineEmits(["cancel", "complete", "edit", "openProfile"]);

const name = computed(() => props.proposal.counterparty_name ?? t('common.anonymous'));
const initials = computed(() => name.value[0].toUpperCase());

const open      = computed(() => isOpen(props.proposal.status));
const yourMove  = computed(() => isYourMove(props.proposal));
const completed = computed(() => isDone(props.proposal.status));
const isAccepted = computed(() => props.proposal.status === "accepted");
// Legacy proposals have no workflow_phase, and only their proposer may edit.
const canEdit = computed(() =>
  props.proposal.status === "pending" && props.proposal.i_am_proposer && !props.proposal.workflow_phase);

const waitKey        = computed(() => pendingWaitKey(props.proposal));
const workflowAction = computed(() => tradeNextAction(props.proposal));

/* Which stop of the trade this is at -- the same four the trade page draws as
   its spine, so a row and the page it opens name the stage identically.
 *
 * Not the turn, even though the page is sorted on the turn: inside the "Your
 * move" pile every row would then wear a pill reading YOUR MOVE, which is the
 * old design's habit of restating the control above the list. The turn is said
 * where it is not already known -- by the verb on the button, and by the prose
 * line on a trade that is waiting on somebody else.
 *
 * Teal starts at exchange, the first stop that exists only because both sides
 * lined up (DESIGN.md, The Agreement Rule). Agreeing is still an offer being
 * moved along, so it is amethyst. */
const STAGES = {
  selection: { key: "selection", labelKey: "tradeDetail.phaseSelection", tone: "var(--c-muted)"  },
  agreement: { key: "agreement", labelKey: "tradeDetail.phaseAgreement", tone: "var(--c-trade)"  },
  exchange:  { key: "exchange",  labelKey: "tradeDetail.phaseExchange",  tone: "var(--c-mutual)" },
  completed: { key: "done",      labelKey: "tradeDetail.phaseDone",      tone: "var(--c-mutual)" },
};

const stage = computed(() => {
  const s = props.proposal.status;
  // A trade that stopped never reached a stop, so it names its ending instead.
  if (s === "declined")  return { key: "closed", label: t('proposal.declined'),  tone: "var(--c-accent)" };
  if (s === "cancelled") return { key: "closed", label: t('proposal.cancelled'), tone: "var(--c-accent)" };
  // The same fold the trade page's spine performs (TradeDetailPage.vue,
  // phaseStops): a legacy proposal has no workflow_phase, and deciding whether
  // to do the deal is agreeing. Folded the same way in both places on purpose —
  // a row and the page it opens must not name the stage differently.
  const phase = tradePhase(props.proposal);
  const found = STAGES[phase === "negotiation" ? "agreement" : phase] ?? STAGES.agreement;
  return { key: found.key, label: t(found.labelKey), tone: found.tone };
});

// Selection is the one stage where an empty side means "you have not picked
// yet" rather than "nothing is going that way".
const inSelection = computed(() => tradePhase(props.proposal) === "selection");

/* The primary button. `to` opens the trade; `act` performs it here.
   Teal on the three steps of the agreement chain -- accept, confirm the
   revision, confirm your side -- and amethyst on the two that are still an
   offer being moved along (DESIGN.md, The Agreement Rule). */
const step = computed(() => {
  // A settled trade has no next step. Without this, pendingWaitKey still
  // answers for a completed row -- it only reads i_am_proposer and the photo
  // flags, which outlive the trade -- and a finished trade offered
  // "Review & accept".
  if (!open.value) {
    return { label: t('proposal.viewTrade'), icon: "mdi-arrow-right", tone: "ghost" };
  }
  if (isAccepted.value && !props.proposal.i_confirmed) {
    return { label: t('proposal.confirmYourSide'), icon: "mdi-handshake-outline", tone: "mutual", act: "complete" };
  }
  if (workflowAction.value === "chooseReturnCards") {
    return { label: t('tradeDetail.chooseReturnCards'), icon: "mdi-cards-outline", tone: "trade" };
  }
  if (workflowAction.value === "confirmAgreement") {
    return { label: t('tradeDetail.confirmAgreement'), icon: "mdi-handshake-outline", tone: "mutual" };
  }
  if (workflowAction.value === "reviewTrade" && waitKey.value === "yoursToReview") {
    return { label: t('proposal.reviewAndAccept'), icon: "mdi-check-circle-outline", tone: "mutual" };
  }
  if (workflowAction.value === "reviewTrade" && waitKey.value === "photoYoursMissing") {
    return { label: t('proposal.uploadPhotosBtn'), icon: "mdi-camera-outline", tone: "trade" };
  }
  return { label: t('proposal.viewTrade'), icon: "mdi-arrow-right", tone: "ghost" };
});

/* The row's one line of prose, and only when the button does not already carry
   it. On a trade waiting on the other side the button just says "View trade",
   so the sentence is the whole point; on one waiting on you the verb says it,
   and the only thing left worth adding is why a photo is being asked for. */
const note = computed(() => {
  if (!open.value) return null;
  if (!yourMove.value) {
    if (isAccepted.value) return t('proposal.waitingForConfirm', { name: name.value });
    if (workflowAction.value === "waitingForSelection") return t('tradeDetail.waitingForReturnSelection', { name: name.value });
    if (workflowAction.value === "waitingForAgreement") return t('tradeDetail.waitingAgreement', { name: name.value });
    return t(`proposal.${waitKey.value}`, { name: name.value });
  }
  if (workflowAction.value === "chooseReturnCards") return t('tradeDetail.chooseReturnCardsHelp', { name: name.value });
  if (waitKey.value === "photoYoursMissing" && workflowAction.value === "reviewTrade") {
    return t('proposal.photoYoursMissing', { name: name.value });
  }
  return null;
});

const sides = computed(() => [
  { key: "give", label: t('tradeDetail.youGive'),    cards: props.proposal.i_give    ?? [], tone: "var(--c-accent)" },
  { key: "get",  label: t('tradeDetail.youReceive'), cards: props.proposal.i_receive ?? [], tone: "var(--c-trade)"  },
]);

// The trade opens as a page, not a dialog. Built here rather than with :to on
// each control so the row's entry points cannot drift apart.
const detailHref = computed(() => `/${locale.value}/trade/${props.proposal.id}`);

/* ── Rating ───────────────────────────────────────────────────────────────
   Completed trades only, and the only place in the app a trader can be rated
   -- the trade page has no rating -- so it stays on the row. What changed is
   that it no longer opens as a form: a finished pile used to be a column of
   star widgets and text inputs. Now the row offers a button, and the form is
   what that button opens. */
const myRating       = ref(null);
const rateOpen       = ref(false);
const hoverStar      = ref(0);
const pendingScore   = ref(0);
const ratingComment  = ref('');
const ratingSubmitting = ref(false);

async function loadMyRating() {
  if (props.proposal.status !== 'completed' || !props.currentUserId) return;
  const { data } = await getClient()
    .from('trader_rating')
    .select('score, comment')
    .eq('trade_id', props.proposal.id)
    .eq('rater_id', props.currentUserId)
    .maybeSingle();
  myRating.value = data ?? null;
}
loadMyRating();

async function submitRating() {
  if (!pendingScore.value || !props.currentUserId) return;
  ratingSubmitting.value = true;
  const { data } = await getClient()
    .from('trader_rating')
    .insert({
      trade_id: props.proposal.id,
      rater_id: props.currentUserId,
      ratee_id: props.proposal.counterparty_id,
      score: pendingScore.value,
      comment: ratingComment.value.trim() || null,
    })
    .select('score, comment')
    .single();
  myRating.value = data;
  ratingSubmitting.value = false;
  closeRating();
}

function closeRating() {
  rateOpen.value = false;
  pendingScore.value = 0;
  ratingComment.value = '';
  hoverStar.value = 0;
}
</script>

<template>
  <article
    class="pr"
    :data-stage="stage.key"
    :data-mine="yourMove || undefined"
    :style="{ '--pr-stage': stage.tone }"
  >

    <!-- Who, when, and whose move. -->
    <header class="pr__head">
      <span
        class="pr__face"
        :data-role="proposal.i_am_proposer ? 'mine' : 'theirs'"
        aria-hidden="true"
        @click="emit('openProfile', proposal.counterparty_id)"
      >
        <img v-if="proposal.counterparty_avatar_url" :src="proposal.counterparty_avatar_url" alt="" />
        <span v-else>{{ initials }}</span>
      </span>

      <!-- The avatar is the same target and aria-hidden, so this is the single
           stop a keyboard or a screen reader lands on. -->
      <button
        type="button"
        class="pr__name"
        :aria-label="t('proposal.viewProfileOf', { name })"
        @click="emit('openProfile', proposal.counterparty_id)"
      >{{ name }}</button>

      <span class="pr__stage">{{ stage.label }}</span>

      <!-- Its own row under the name, so it has the width of the card rather
           than what is left beside the pill -- in French at 320px it was
           breaking into three bulleted lines. The separators are drawn by CSS:
           a literal "·" between spans strands itself at the end of a line. -->
      <span class="pr__sub">
        <span class="pr__id">#{{ proposal.id }}</span>
        <span>{{ proposal.i_am_proposer ? t('proposal.youProposed') : t('proposal.proposedToYou') }}</span>
        <span>{{ timeAgo(proposal.created_at, t) }}</span>
      </span>
    </header>

    <div class="pr__body">
      <!--
        A real <a>, not a click handler on a div: the region holds only images
        and tooltip wrappers, so nothing interactive is nested illegally, and
        middle-click, open-in-new-tab and tab-to-focus all behave. The button
        beside it is the same destination said in words.
      -->
      <router-link :to="detailHref" class="pr__deal" :aria-label="t('proposal.openTradeAria', { id: proposal.id })">
        <template v-for="(side, i) in sides" :key="side.key">
        <!-- The seam sits between the piles in the markup, not after them, so
             the stacked layout reads give / seam / get without needing the grid
             to reorder it. -->
        <span v-if="i === 1" class="pr__seam" aria-hidden="true">
          <span class="pr__seam-line" />
          <span class="pr__seam-disc">
            <v-icon :icon="isAccepted || completed ? 'mdi-handshake-outline' : 'mdi-swap-horizontal'" size="15" />
          </span>
          <span class="pr__seam-line" />
        </span>

        <section
          class="pr__side"
          :class="`pr__side--${side.key}`"
          :style="{ '--pr-side': side.tone }"
        >
          <p class="pr__sidehead">
            {{ side.label }}
            <span v-if="side.cards.length" class="pr__n tabular-nums">{{ side.cards.length }}</span>
          </p>

          <!-- Every card, scrolling rather than a +N count: what is in the
               trade is the one thing this row must not summarise away. -->
          <div
            v-if="side.cards.length"
            class="pr__fan"
            :style="{ '--pr-lap': `${Math.min(34, 6 + side.cards.length * 3.5)}px` }"
          >
            <v-tooltip v-for="(card, i) in side.cards" :key="card.id" :text="card.name" location="top">
              <template #activator="{ props: tip }">
                <span v-bind="tip" class="pr__card" :style="{ zIndex: i + 1 }">
                  <img :src="cardImage(card.image_id)" :alt="card.name" loading="lazy" decoding="async" />
                  <span v-if="card.quantity > 1" class="pr__qty tabular-nums">×{{ card.quantity }}</span>
                </span>
              </template>
            </v-tooltip>
          </div>
          <!-- A slot the shape of the card that is missing, rather than the
               word "None" floating in the space one would have taken. -->
          <p v-else class="pr__empty">
            <span class="pr__slot" />
            {{ inSelection ? t('proposal.notChosenYet') : t('proposal.none') }}
          </p>
        </section>
        </template>
      </router-link>

      <div class="pr__act">
        <button
          v-if="step.act === 'complete'"
          type="button"
          class="pr__go"
          :data-tone="step.tone"
          @click="emit('complete', proposal)"
        >
          <v-icon :icon="step.icon" size="16" aria-hidden="true" />
          {{ step.label }}
        </button>
        <router-link v-else :to="detailHref" class="pr__go" :data-tone="step.tone">
          <!-- A verb takes its icon in front; "View trade" is a destination,
               so its arrow trails the way a link's does. -->
          <v-icon v-if="step.tone !== 'ghost'" :icon="step.icon" size="16" aria-hidden="true" />
          {{ step.label }}
          <v-icon v-if="step.tone === 'ghost'" :icon="step.icon" size="16" aria-hidden="true" />
        </router-link>

        <div v-if="canEdit || isAccepted" class="pr__minor">
          <button v-if="canEdit" type="button" class="pr__link" @click="emit('edit', proposal)">
            {{ t('proposal.editOffer') }}
          </button>
          <button v-if="isAccepted" type="button" class="pr__link pr__link--warn" @click="emit('cancel', proposal)">
            {{ t('proposal.cancelTrade') }}
          </button>
        </div>
      </div>
    </div>

    <p v-if="note" class="pr__note">
      <v-icon
        v-if="waitKey === 'photoYoursMissing' && yourMove"
        icon="mdi-camera-plus-outline" size="14" aria-hidden="true"
      />
      {{ note }}
    </p>

    <!-- Rating, completed trades only. -->
    <div v-if="completed" class="pr__rate">
      <template v-if="myRating">
        <span class="pr__stars" :aria-label="t('proposal.starLabel', { n: myRating.score }, myRating.score)">
          <v-icon
            v-for="s in 5" :key="s"
            :icon="s <= myRating.score ? 'mdi-star' : 'mdi-star-outline'"
            size="15" aria-hidden="true"
          />
        </span>
        <span v-if="myRating.comment" class="pr__ratenote">{{ myRating.comment }}</span>
        <span v-else class="pr__ratenote">{{ t('proposal.youRated', { name }) }}</span>
      </template>

      <button
        v-else-if="!rateOpen"
        type="button" class="pr__link pr__link--rate"
        @click="rateOpen = true"
      >
        <v-icon icon="mdi-star-outline" size="15" aria-hidden="true" />
        {{ t('proposal.rate', { name }) }}
      </button>

      <template v-else>
        <div class="pr__rateform">
          <div class="pr__starrow" role="radiogroup" :aria-label="t('proposal.rateTrader', { name })">
            <!-- A 20px glyph inside a 44px target. Rating happens on a phone,
                 at a table, right after a trade; a 20px tap is a mis-tap and a
                 wrong rating nobody can take back. -->
            <button
              v-for="s in 5" :key="s"
              type="button" class="pr__star" role="radio"
              :aria-checked="pendingScore === s"
              :aria-label="t('proposal.starLabel', { n: s }, s)"
              @click="pendingScore = s"
              @mouseenter="hoverStar = s" @mouseleave="hoverStar = 0"
              @focus="hoverStar = s" @blur="hoverStar = 0"
            >
              <v-icon
                :icon="s <= (hoverStar || pendingScore) ? 'mdi-star' : 'mdi-star-outline'"
                size="20"
                :style="{ color: s <= (hoverStar || pendingScore) ? 'var(--c-mutual)' : 'var(--c-muted)' }"
              />
            </button>
          </div>

          <input
            v-model="ratingComment"
            class="pr__ratein"
            maxlength="140"
            :placeholder="t('proposal.ratingPlaceholder')"
            :aria-label="t('proposal.ratingPlaceholder')"
          />

          <div class="pr__rateact">
            <button type="button" class="pr__link" @click="closeRating">{{ t('common.cancel') }}</button>
            <button
              type="button" class="pr__go pr__go--sm" data-tone="mutual"
              :disabled="!pendingScore || ratingSubmitting"
              @click="submitRating"
            >{{ t('proposal.submit') }}</button>
          </div>
        </div>
      </template>
    </div>
  </article>
</template>

<style scoped>
/* Surface vocabulary read from the page, with fallbacks so the row still draws
   correctly under a host that sets none. */
.pr {
  --pr-panel: var(--pq-panel, var(--c-surface));
  --pr-line: var(--pq-line, var(--c-border));
  --pr-line-soft: var(--pq-line-soft, var(--c-border));
  --pr-mono: ui-monospace, "Cascadia Code", SFMono-Regular, Menlo, monospace;

  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px 15px 14px;
  border: 1px solid var(--pr-line);
  border-radius: 16px;
  background: var(--pr-panel);
  /* A 1px lit top edge rather than an outer shadow: flat at rest
     (DESIGN.md, The Flat-By-Default Rule). */
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-text) 7%, transparent);
  transition: border-color 0.18s ease;
}
/* A trade waiting on you gets a border in the colour of doing something about
   it. Every other row stays neutral, so within any pile the ones asking for
   something are the only things drawing an eye -- which also means the "Your
   move" pile reads as a block rather than as five identical labels. */
.pr[data-mine] { border-color: color-mix(in srgb, var(--c-trade) 42%, transparent); }
.pr:hover { border-color: color-mix(in srgb, var(--pr-stage) 55%, var(--pr-line)); }

/* ── Head ─────────────────────────────────────────────────────────────── */
/* Face and name and stage on one line, the metadata on its own beneath —
   so the sub line gets the whole card's width instead of the sliver left
   between the name and the pill. */
.pr__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 3px 11px;
}

.pr__face {
  grid-row: 1 / span 2;
  width: 34px; height: 34px;
  display: grid; place-items: center;
  overflow: hidden;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 800; font-size: 0.85rem;
  color: var(--c-on-accent);
  background: var(--c-trade);
}
.pr__face[data-role="theirs"] { background: var(--c-accent); }
.pr__face img { width: 100%; height: 100%; object-fit: cover; }

.pr__name {
  grid-column: 2; grid-row: 1;
  /* Hugs its text. As a stretched grid item its focus ring ran the width of
     the column, which reads as a text field rather than a name you can click. */
  justify-self: start;
  min-width: 0; max-width: 100%;
  padding: 0; border: 0; background: none;
  font: inherit; font-weight: 700; font-size: 0.92rem;
  color: var(--c-text); text-align: left; cursor: pointer;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pr__name:hover { text-decoration: underline; text-underline-offset: 2px; }
.pr__name:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 4px; }

.pr__sub {
  grid-column: 2 / -1; grid-row: 2;
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  font-size: 0.72rem; color: var(--c-muted);
}
.pr__sub > span { white-space: nowrap; }
.pr__sub > span + span::before { content: "·"; margin-right: 6px; }
/* The trade's number is an identifier, so it is set like one
   (DESIGN.md, The Mono Identifier Rule). */
.pr__id { font-family: var(--pr-mono); font-weight: 700; letter-spacing: 0.02em; }

.pr__stage {
  grid-column: 3; grid-row: 1;
  padding: 5px 11px;
  border: 1px solid color-mix(in srgb, var(--pr-stage) 38%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--pr-stage) 11%, transparent);
  color: var(--pr-stage);
  font-family: var(--pr-mono);
  font-size: 0.62rem; font-weight: 700;
  letter-spacing: 0.13em; text-transform: uppercase;
  white-space: nowrap;
}

/* ── Body: the deal, then the verb ────────────────────────────────────── */
.pr__body { display: flex; flex-direction: column; gap: 10px; }

.pr__deal {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  padding: 10px 12px 8px;
  border: 1px solid var(--pr-line-soft);
  border-radius: 12px;
  background: color-mix(in srgb, var(--c-bg) 45%, transparent);
  text-decoration: none;
  color: inherit;
  transition: background-color 0.18s ease, border-color 0.18s ease;
}
.pr__deal:hover {
  background: color-mix(in srgb, var(--c-bg) 70%, transparent);
  border-color: var(--pr-line);
}
.pr__deal:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.pr__side { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

.pr__sidehead {
  display: flex; align-items: center; gap: 7px;
  margin: 0;
  font-family: var(--pr-mono);
  font-size: 0.6rem; font-weight: 700;
  letter-spacing: 0.15em; text-transform: uppercase;
  color: var(--pr-side);
}
/* The count sits on the panel ground rather than on a tint of its own colour.
   Coloured text on a tint of the same hue washed out to 4.3:1 in the light
   theme -- two stacked tints of one hue eat the contrast between them. */
.pr__n {
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--pr-panel);
  letter-spacing: 0.04em;
}

.pr__fan {
  display: flex; align-items: flex-end;
  min-width: 0;
  /* overflow-y is hidden so a horizontal scroll cannot also scroll vertically,
     which means the hover lift has to happen inside the padding. */
  padding: 10px 0 3px 16px;
  overflow-x: auto; overflow-y: hidden;
  scrollbar-width: thin;
}
.pr__card {
  position: relative;
  flex: 0 0 auto;
  width: 52px; aspect-ratio: 59 / 86;
  /* The fan tightens as the pile grows, the way a hand of cards does, so eight
     cards still fit the column that four sat comfortably in. Past that it
     scrolls rather than hiding any behind a +N count. */
  margin-left: calc(-1 * var(--pr-lap, 16px));
  border-radius: 5px;
  transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}
.pr__card:hover { transform: translateY(-6px); z-index: 20 !important; }
.pr__card img {
  display: block; width: 100%; height: 100%;
  object-fit: contain;
  border-radius: 5px;
  background: var(--c-surface-2);
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--pr-side) 55%, transparent);
}
.pr__qty {
  position: absolute; right: -5px; bottom: -5px;
  min-width: 18px; padding: 0 4px;
  border: 2px solid var(--pr-panel);
  border-radius: 6px;
  background: var(--pr-side);
  color: var(--c-on-accent);
  font-family: var(--pr-mono);
  font-size: 0.58rem; font-weight: 700; line-height: 15px; text-align: center;
}

.pr__empty {
  display: flex; align-items: center; gap: 10px;
  margin: 0; padding: 10px 0 3px;
  font-size: 0.76rem; color: var(--c-muted);
}
.pr__slot {
  flex: none;
  width: 52px; aspect-ratio: 59 / 86;
  border: 1.5px dashed color-mix(in srgb, var(--pr-side) 40%, transparent);
  border-radius: 5px;
}

/* The seam. Horizontal while the two piles are stacked, vertical once they sit
   side by side -- the same object the trade page draws between them. */
.pr__seam { display: flex; align-items: center; gap: 8px; }
.pr__seam-line { flex: 1; height: 1px; background: var(--pr-line-soft); }
.pr__seam-disc {
  flex: none;
  display: grid; place-items: center;
  width: 28px; height: 28px;
  border: 1px solid var(--pr-line);
  border-radius: 999px;
  background: var(--pr-panel);
  color: var(--c-muted);
}
/* Teal only once there is an agreement to mark (DESIGN.md, The Agreement Rule):
   the exchange, and the finished trade it becomes. */
.pr[data-stage="exchange"] .pr__seam-disc,
.pr[data-stage="done"] .pr__seam-disc {
  border-color: color-mix(in srgb, var(--c-mutual) 45%, transparent);
  color: var(--c-mutual);
}

/* ── The verb ─────────────────────────────────────────────────────────── */
.pr__act { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

.pr__go {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  font: inherit; font-size: 0.83rem; font-weight: 700; line-height: 1.25;
  text-align: center; text-decoration: none;
  /* Wraps rather than pushing past its column. "Choisir dans son classeur" is
     226px against a 200px rail, and one wide button in a column of narrow ones
     leaves the right edge of the list ragged. */
  transition: filter 0.16s ease, background-color 0.16s ease, border-color 0.16s ease;
}
.pr__go--sm { min-height: 32px; padding: 6px 13px; font-size: 0.78rem; }
.pr__go[data-tone="trade"]  { background: var(--c-trade);  color: var(--c-on-accent); }
.pr__go[data-tone="mutual"] { background: var(--c-mutual); color: var(--c-on-accent); }
.pr__go[data-tone="ghost"]  { background: var(--c-surface-2); color: var(--c-text); border-color: var(--pr-line); }
.pr__go[data-tone="trade"]:hover, .pr__go[data-tone="mutual"]:hover { filter: brightness(1.08); }
.pr__go[data-tone="ghost"]:hover { border-color: var(--c-trade); }
.pr__go:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.pr__go:disabled { opacity: 0.5; cursor: default; filter: none; }

.pr__minor { display: flex; align-items: center; gap: 4px; margin-left: auto; }

.pr__link {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 32px; padding: 0 9px;
  border: 0; border-radius: 8px;
  background: none; cursor: pointer;
  font: inherit; font-size: 0.78rem; font-weight: 600;
  color: var(--c-muted);
  text-decoration: none;
  transition: color 0.15s ease, background-color 0.15s ease;
}
.pr__link:hover { color: var(--c-text); background: var(--c-surface-2); }
.pr__link:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 1px; }
/* Pink, because withdrawing is undoing a want. */
.pr__link--warn { color: var(--c-accent); }
.pr__link--warn:hover { color: var(--c-accent); background: color-mix(in srgb, var(--c-accent) 13%, transparent); }
.pr__link--rate { color: var(--c-mutual); }
.pr__link--rate:hover { color: var(--c-mutual); background: color-mix(in srgb, var(--c-mutual) 13%, transparent); }

/* ── The prose line ───────────────────────────────────────────────────── */
.pr__note {
  display: flex; align-items: flex-start; gap: 7px;
  margin: 0;
  padding-top: 9px;
  border-top: 1px solid var(--pr-line-soft);
  font-size: 0.78rem; line-height: 1.5;
  color: var(--c-muted);
}
.pr__note .v-icon { flex: none; margin-top: 1px; color: var(--c-accent); }

/* ── Rating ───────────────────────────────────────────────────────────── */
.pr__rate {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding-top: 11px;
  border-top: 1px solid var(--pr-line-soft);
}
.pr__stars { display: inline-flex; gap: 2px; color: var(--c-mutual); }
.pr__ratenote {
  min-width: 0; flex: 1;
  font-size: 0.78rem; color: var(--c-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.pr__rateform { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; width: 100%; }
.pr__starrow { display: flex; }
.pr__star {
  display: grid; place-items: center;
  width: 44px; height: 44px;
  /* Vertical only: pulling in horizontally would overlap the neighbouring
     target, so one star's left edge would belong to the star before it. */
  margin: -10px 0;
  border: 0; background: none; cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.pr__star:hover { transform: scale(1.12); }
.pr__star:focus-visible { outline: 2px solid var(--c-mutual); outline-offset: -6px; border-radius: 8px; }

.pr__ratein {
  flex: 1 1 200px; min-width: 0; min-height: 36px;
  padding: 0 11px;
  border: 1px solid var(--pr-line);
  border-radius: 9px;
  background: var(--c-surface-2);
  color: var(--c-text);
  font: inherit; font-size: 0.8rem;
  outline: none;
  transition: border-color 0.15s ease;
}
.pr__ratein::placeholder { color: var(--c-muted); opacity: 0.75; }
.pr__ratein:focus { border-color: var(--c-mutual); }

.pr__rateact { display: flex; align-items: center; gap: 6px; margin-left: auto; }

/* ── Wide enough for the two piles to face each other ─────────────────── */
@container (min-width: 620px) {
  .pr__deal {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: stretch;
    gap: 14px;
  }
  .pr__seam      { flex-direction: column; }
  .pr__seam-line { width: 1px; height: auto; }
}

@container (min-width: 780px) {
  /* The verb moves out of the way of the cards rather than sitting under them,
     so the eye goes down the column of buttons when scanning what to do. */
  .pr__body { flex-direction: row; align-items: stretch; }
  .pr__deal { flex: 1; min-width: 0; }
  .pr__act {
    flex: none; width: 220px;
    flex-direction: column; align-items: stretch; justify-content: center;
  }
  .pr__minor { margin-left: 0; flex-direction: column; align-items: stretch; }
  .pr__link { justify-content: center; }
}

@media (pointer: coarse) {
  .pr__go { min-height: 44px; }
  .pr__link { min-height: 44px; }
}

@media (prefers-reduced-motion: reduce) {
  .pr, .pr__deal, .pr__card, .pr__star, .pr__go, .pr__link { transition: none; }
  .pr__card:hover, .pr__star:hover { transform: none; }
}
</style>
