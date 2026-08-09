<script setup>
// The shape of verification, shown on every screen that is part of it.
//
// The route carries eleven states. Each one used to render as a title and a
// paragraph, so being asked for a card looked exactly like being told a
// reviewer said no, and nothing told you where you were in a process that has
// an obvious shape: prove who you are, choose how you pay, be verified.
//
// Three rules and three words. Not circles joined by lines: a stepper widget
// would be the heaviest object on a page whose whole job is to recede, and it
// would promise more linearity than an eleven-state machine actually has.
//
// A beat can be blocked rather than merely incomplete. Declined and lapsed are
// not progress, and a marker that drew them as progress would be lying. The
// blocked beat loses its fill and says so in words, because colour is never
// the only signal.
import { computed } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps({
  /** 'prove' | 'choose' | 'verified' */
  current: { type: String, required: true },
  /** 'normal' | 'waiting' | 'blocked' */
  status: { type: String, default: "normal" },
});
const { t } = useI18n();

const ORDER = ["prove", "choose", "verified"];

const beats = computed(() => {
  const at = ORDER.indexOf(props.current);
  return ORDER.map((id, i) => ({
    id,
    label: t(`communityVerify.beat.${id}`),
    // done: behind us. current: where the page is. ahead: not yet.
    phase: i < at ? "done" : i === at ? "current" : "ahead",
  }));
});

// One sentence naming the current beat, for anyone who cannot see the rules.
const srSummary = computed(() => {
  const label = t(`communityVerify.beat.${props.current}`);
  if (props.status === "blocked") return t("communityVerify.beatBlockedAt", { beat: label });
  if (props.status === "waiting") return t("communityVerify.beatWaitingAt", { beat: label });
  return t("communityVerify.beatAt", { beat: label });
});
</script>

<template>
  <div class="vb" :class="`vb--${status}`">
    <p class="vb__sr">{{ srSummary }}</p>
    <ol class="vb__list" aria-hidden="true">
      <li
        v-for="b in beats"
        :key="b.id"
        class="vb__beat"
        :class="[`vb__beat--${b.phase}`]"
      >
        <span class="vb__rule" />
        <span class="vb__label">{{ b.label }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
/* Bounded rather than full-bleed: across 660px the three rules stop reading as
   a marker and start reading as a divider under the title. Matched to the
   preview's width so the two objects share both edges. */
.vb { width: 100%; max-width: 420px; margin: 2px 0 30px; }

/* The rules carry the meaning visually; this carries it to a screen reader.
   An <ol> of three words read aloud says less than one sentence does. */
.vb__sr {
  position: absolute; width: 1px; height: 1px; margin: -1px;
  padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.vb__list {
  list-style: none; margin: 0; padding: 0;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;
}

.vb__beat { display: flex; flex-direction: column; gap: 7px; min-width: 0; }

/* 2px rather than 1px: at 1px the filled and unfilled states are nearly the
   same object, and the whole marker stops reading at a glance. */
/* Ahead is faint on purpose. At full --c-border the untravelled beats read as
   solid bars and compete with the one you are on, which is the opposite of
   what a progress marker is for. */
.vb__rule {
  height: 2px; border-radius: 2px;
  background: color-mix(in srgb, var(--c-border) 55%, transparent);
  transition: background-color .24s cubic-bezier(0.25, 1, 0.5, 1);
}
.vb__label {
  font-size: 10.5px; font-weight: 700;
  letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--c-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color .24s cubic-bezier(0.25, 1, 0.5, 1);
}

.vb__beat--done .vb__rule { background: color-mix(in srgb, var(--c-trade) 55%, transparent); }
.vb__beat--current .vb__rule { background: var(--c-trade); }
.vb__beat--current .vb__label { color: var(--c-text); }

/* Blocked: the beat we are stuck on stops being filled. Losing the fill is
   the point, so it reads as "not done" rather than "done in a worrying
   colour", and no new semantic colour has to be invented for it. */
/* Waiting is half-filled. Without this, processing draws a full VERIFIED beat
   while the webhook is still in flight, which tells someone they are verified a
   few seconds before it is true. Static, not pulsing: pending-review can last
   days, and a bar animating for days is an anxiety generator, not a status. */
.vb--waiting .vb__beat--current .vb__rule {
  background: linear-gradient(
    90deg,
    var(--c-trade) 0 46%,
    color-mix(in srgb, var(--c-border) 55%, transparent) 46%
  );
}

/* Blocked keeps the current beat the brightest thing in the row and breaks it
   instead. Dimming it would say "this beat matters less", when what happened is
   that it did not finish. */
.vb--blocked .vb__beat--current .vb__rule {
  background: repeating-linear-gradient(
    90deg,
    var(--c-trade) 0 5px,
    transparent 5px 10px
  );
}

@media (prefers-reduced-motion: reduce) {
  .vb__rule, .vb__label { transition: none; }
}
</style>
