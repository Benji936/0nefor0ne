<script setup>
/**
 * One place in the directory.
 *
 * This was a social profile card: a 76px banner, a logo overlapping it, and a
 * Follow button parked on top. Of the 4,451 published rows, two have a banner
 * and two have a logo — so for everybody else the card spent its whole top
 * third drawing a flat amethyst gradient with a shop glyph in it, and a grid of
 * twenty-four read as a broken image grid. What every row actually has is a
 * name, a kind and a town, so that is what the card is now: a directory entry,
 * with a logo only when there is one to show.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { kindsOf, TYPE_KEYS } from "@/lib/communityKinds";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import FollowButton from "@/components/community/FollowButton.vue";
import { formatDistance } from "@/lib/near";

const props = defineProps({
  community: { type: Object, required: true },
  currentUserId: { type: String, default: null },
  /** Distance from the reader, in km. Only the Near me search has one. */
  km: { type: Number, default: null },
});
defineEmits(["auth-required"]);
const route = useRoute();
const locale = route.params.locale || "en";
const { t } = useI18n();

// The meta line has room for one word. A community that is several things gets
// the primary kind spelled out and the rest as glyphs, rather than a comma list
// that pushes the town off the card.
const kinds = computed(() => kindsOf(props.community));
const primary = computed(() => kinds.value[0] ?? "group");
const extras = computed(() => kinds.value.slice(1));
const kindsLabel = computed(() =>
  kinds.value.map((k) => t(TYPE_KEYS[k] ?? TYPE_KEYS.group)).join(", "));

const place = computed(() =>
  [props.community.city, props.community.country].filter(Boolean).join(", "));

// Distance leads the card rather than ending it. In a Near me search it is the
// sort key, and reading it straight down the column is how you can tell the
// grid is ordered at all.
const distance = computed(() => formatDistance(props.km));

// Following is only worth offering where it does something: a community has to
// be verified before it can post an event, and an event is the only thing a
// follow delivers. On an unclaimed shop the button promised a notification that
// could never arrive — and it was on all twenty-four cards at once.
const followable = computed(() => props.community.verified === true);
</script>

<template>
  <!--
    An <article> with one real link inside it, rather than an <a> wrapping the
    lot. The Follow button used to sit inside the card's own anchor, which is
    interactive content nested in a link: invalid, and a keyboard reader met the
    two as a single confusing stop. Now the name is the link and .cc__hit
    stretches its hit area over the whole card, while the button lifts above it.
  -->
  <article class="cc">
    <div class="cc__head">
      <img
        v-if="community.avatar_url"
        :src="community.avatar_url"
        alt=""
        class="cc__logo"
        loading="lazy"
        decoding="async"
      />
      <h3 class="cc__name">
        <router-link
          class="cc__hit"
          :to="{ name: 'communityProfile', params: { locale, slug: community.slug } }"
        >{{ community.name }}</router-link>
      </h3>
      <v-icon
        v-if="community.verified"
        icon="mdi-check-decagram"
        size="14"
        class="cc__verified"
        :title="t('community.verified')"
      />
      <span v-if="distance" class="cc__km tabular-nums">{{ distance }}</span>
    </div>

    <p class="cc__where">
      <!-- The kind set the way a set code is set (DESIGN.md, The Mono
           Identifier Rule): it is a classification, not prose, and the mono
           register is how the rest of the app says so. -->
      <span class="cc__kind" :aria-label="kindsLabel">
        <span aria-hidden="true">{{ t(TYPE_KEYS[primary] || 'community.typeGroup') }}</span>
        <CommunityKindIcon v-for="k in extras" :key="k" :kind="k" :size="11" aria-hidden="true" />
      </span>
      <span v-if="place" class="cc__place">{{ place }}</span>
      <v-icon
        v-if="community.remote_duel"
        icon="mdi-web"
        size="13"
        class="cc__remote"
        :title="t('community.remoteDuelOn')"
      />
      <FollowButton
        v-if="followable"
        class="cc__follow"
        compact
        :community-id="community.id"
        :user-id="currentUserId"
        :count="community.follower_count ?? 0"
        @update:count="community.follower_count = $event"
        @auth-required="$emit('auth-required')"
      />
    </p>
  </article>
</template>

<style scoped>
/* Borrowed from the landing page through the directory's --cd-* set: a panel
   one tonal step under the page, hairlines a fraction of the border token, and
   depth as a 1px top highlight rather than a drop shadow. The fallbacks are
   for the two other places this card is used from. */
.cc {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 15px 16px 14px;
  border: 1px solid var(--cd-line, var(--c-border));
  border-radius: 15px;
  background: var(--cd-panel, var(--c-surface));
  box-shadow: var(--cd-lit, none);
  color: var(--c-text);
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}
/* The glow is amethyst, the colour of a place you can go to and act at, and
   never a black drop shadow (DESIGN.md, The Flat-By-Default Rule). */
.cc:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--c-trade) 55%, transparent);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--c-trade) 18%, transparent);
}
.cc:focus-within {
  border-color: var(--c-trade);
}

/* Only the rows that have one. A letter in a box would repeat the name printed
   beside it, and a kind glyph would repeat the word below it. Inline with the
   name rather than stacked above it, because a grid row is as tall as its
   tallest card: stacked, the two shops in the whole directory that have a logo
   were adding forty pixels to every card standing beside them. */
.cc__logo {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 9px;
  object-fit: cover;
  background: var(--c-surface-2);
}

/* Top-aligned, not centred: the distance and the verified mark then sit on the
   same line across the whole row whether a name wrapped to two lines or not,
   which is what makes a column of distances readable straight down. */
.cc__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

/* The one display moment on the card. A directory is read by name, so the name
   is set in the display face at a size that lets you scan a wall of them. */
.cc__name {
  margin: 0;
  min-width: 0;
  flex: 1;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.22;
  letter-spacing: -0.02em;
}
.cc__hit {
  color: inherit;
  text-decoration: none;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
/* Stretched over the card so the whole panel is the target, while staying one
   link in the tab order. */
.cc__hit::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
.cc__hit:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }

.cc__verified { color: var(--c-mutual); flex-shrink: 0; margin-top: 2px; }

.cc__km {
  flex-shrink: 0;
  margin-top: 2px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--c-text);
}

/* Wraps rather than squeezes. Unwrapped, a card that carries a Follow button
   crushed the town down to one letter and an ellipsis — and the town is the
   fact the card exists to give you. */
.cc__where {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 8px;
  margin: auto 0 0;
  min-width: 0;
  font-size: 0.8rem;
  color: var(--c-muted);
}
.cc__kind {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 6px;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--c-muted);
  background: color-mix(in srgb, var(--c-muted) 13%, transparent);
}
.cc__place {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Amethyst, not teal: offering to duel from anywhere is a thing this place
   does, not an agreement anybody has reached (DESIGN.md, The Agreement Rule). */
.cc__remote { color: var(--c-trade); flex-shrink: 0; }

/* Lifted above the stretched link so the button stays clickable, and sitting at
   the end of the meta line rather than on a row of its own — a row it only ever
   needed because it used to float over a banner. */
.cc__follow {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin-left: auto;
}

@media (prefers-reduced-motion: reduce) {
  .cc, .cc:hover { transition: none; transform: none; }
}
</style>
