<script setup>
// The thing being bought, shown rather than described.
//
// The route asks for ten minutes of proof and a card number, and described what
// you get back as four abstract nouns in a list: events, badge, ranking, trust.
// The actual reward is concrete and the app already owns every part of it, so
// this renders the owner's own community exactly as the directory will show it,
// with the mark off and then on.
//
// It appears four times with four meanings and one shape: on the proof step as
// the promise, on the pay step as what the card buys, on done as the receipt,
// and on lapsed as what stopped. Same object, so the change is the only thing
// that moves.
//
// This is a card, deliberately, in a codebase that avoids them. It is a picture
// of a card in a directory of cards; drawing it as a bare row would make it
// less true, not less decorated.
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { kindsOf, primaryKind, TYPE_KEYS } from "@/lib/communityKinds";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";

const props = defineProps({
  community: { type: Object, required: true },
  /** Draw the mark lit. False shows the hollow outline it has today. */
  verified: { type: Boolean, default: false },
  /** One line under the preview saying what it is showing. */
  caption: { type: String, default: "" },
});
const { t } = useI18n();

const primary = computed(() => primaryKind(props.community) || "group");
const extras = computed(() => kindsOf(props.community).filter((k) => k !== primary.value));
const initial = computed(() => (props.community?.name || "?").trim()[0].toUpperCase());
const place = computed(() => {
  const c = props.community;
  return [c?.city, c?.country].filter(Boolean).join(", ");
});
</script>

<template>
  <figure class="vp">
    <div class="vp__row" :class="{ 'vp__row--on': verified }">
      <div class="vp__avatar">
        <img v-if="community.avatar_url" :src="community.avatar_url" alt="" />
        <span v-else aria-hidden="true">{{ initial }}</span>
      </div>

      <div class="vp__body">
        <p class="vp__name">
          <span class="vp__nameText">{{ community.name }}</span>
          <!-- Teal, because that is the colour the directory already draws a
               verified community in. A preview in a different colour from the
               thing it previews would be worse than no preview. -->
          <v-icon
            class="vp__mark"
            :icon="verified ? 'mdi-check-decagram' : 'mdi-check-decagram-outline'"
            size="16"
          />
        </p>
        <p class="vp__meta">
          <span class="vp__kind">
            <CommunityKindIcon :kind="primary" :size="12" />
            <span>{{ t(TYPE_KEYS[primary] || 'community.typeGroup') }}</span>
            <CommunityKindIcon v-for="k in extras" :key="k" :kind="k" :size="12" />
          </span>
          <span v-if="place" class="vp__place">· {{ place }}</span>
        </p>
      </div>
    </div>

    <figcaption v-if="caption" class="vp__caption">{{ caption }}</figcaption>
  </figure>
</template>

<style scoped>
.vp { margin: 0 0 26px; width: 100%; max-width: 420px; }

.vp__row {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 15px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: 16px;
  transition: border-color .3s cubic-bezier(0.25, 1, 0.5, 1);
}
/* Verified: the border warms toward the mark. The only change between the two
   states, so the mark itself is what the eye lands on. */
.vp__row--on { border-color: color-mix(in srgb, var(--c-mutual) 34%, var(--c-border)); }

.vp__avatar {
  width: 46px; height: 46px; border-radius: 13px; flex-shrink: 0;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); color: var(--c-muted);
  font-size: 18px; font-weight: 800;
}
.vp__avatar img { width: 100%; height: 100%; object-fit: cover; }

.vp__body { min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.vp__name { display: flex; align-items: center; gap: 6px; margin: 0; min-width: 0; }
.vp__nameText {
  font-size: 14.5px; font-weight: 700; color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.vp__mark {
  flex-shrink: 0;
  color: var(--c-muted);
  transition: color .3s cubic-bezier(0.25, 1, 0.5, 1);
}
.vp__row--on .vp__mark { color: var(--c-mutual); }

.vp__meta {
  margin: 0; display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  font-size: 12px; color: var(--c-muted);
}
.vp__kind { display: inline-flex; align-items: center; gap: 4px; }
.vp__place { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.vp__caption {
  margin: 9px 0 0;
  font-size: 12px; line-height: 1.5; color: var(--c-muted);
}

@media (prefers-reduced-motion: reduce) {
  .vp__row, .vp__mark { transition: none; }
}
</style>
