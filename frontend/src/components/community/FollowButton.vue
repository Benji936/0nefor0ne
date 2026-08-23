<script setup>
/**
 * Follow / Following toggle for a community.
 *
 * Optimistic: the label and the count flip immediately and roll back if the
 * write fails, so the button never feels laggy on a slow connection. The
 * parent owns the count (it lives on community.follower_count) and receives
 * the delta through `update:count`.
 *
 * Signed-out users still see the button; clicking emits `auth-required` so the
 * host page can open its sign-in flow rather than failing silently.
 */
import { ref, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { isFollowing, follow, unfollow } from "@/lib/communityFollow";

const props = defineProps({
  communityId: { type: [Number, String], required: true },
  userId: { type: String, default: null },
  count: { type: Number, default: null },   // null hides the count
  compact: { type: Boolean, default: false },
});
const emit = defineEmits(["update:count", "auth-required", "changed"]);
const { t } = useI18n();

const following = ref(false);
const busy = ref(false);
const hovering = ref(false);

// Re-resolve whenever the community or the viewer changes (the session
// resolves asynchronously, so userId arrives after the first render).
watch(
  () => [props.communityId, props.userId],
  async ([cid, uid]) => {
    following.value = uid ? await isFollowing(cid, uid) : false;
  },
  { immediate: true },
);

// "Following" flips to "Unfollow" on hover so the destructive action is
// explicit rather than hidden behind an identical-looking button.
const label = computed(() => {
  if (!following.value) return t("community.follow");
  return hovering.value ? t("community.unfollow") : t("community.following");
});
const icon = computed(() => {
  if (!following.value) return "mdi-plus";
  return hovering.value ? "mdi-close" : "mdi-check";
});

async function toggle() {
  if (busy.value) return;
  if (!props.userId) { emit("auth-required"); return; }

  const next = !following.value;
  // Optimistic flip.
  following.value = next;
  if (props.count != null) emit("update:count", props.count + (next ? 1 : -1));
  busy.value = true;
  try {
    if (next) await follow(props.communityId, props.userId);
    else await unfollow(props.communityId, props.userId);
    emit("changed", next);
  } catch {
    // Roll back both the label and the count.
    following.value = !next;
    if (props.count != null) emit("update:count", props.count);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button
    type="button"
    class="cf"
    :class="{ 'cf--on': following, 'cf--compact': compact }"
    :aria-pressed="following"
    :disabled="busy"
    @click.stop.prevent="toggle"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @focus="hovering = true"
    @blur="hovering = false"
  >
    <v-icon :icon="icon" :size="compact ? 13 : 15" />
    <span class="cf__label">{{ label }}</span>
    <span v-if="count != null" class="cf__count">{{ count }}</span>
  </button>
</template>

<style scoped>
.cf {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 15px; border-radius: 11px;
  border: 1.5px solid var(--c-trade);
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 13px; font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}
.cf:hover:not(:disabled) { opacity: 0.9; }
.cf:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.cf:disabled { opacity: 0.55; pointer-events: none; }

/* Following: quiet outline, so the primary action reads as "not yet following". */
.cf--on {
  background: transparent;
  color: var(--c-text);
  border-color: var(--c-border);
}
.cf--on:hover {
  border-color: var(--cp-danger, #F2555A);
  color: var(--cp-danger, #F2555A);
  opacity: 1;
}

.cf__count {
  padding-left: 7px; margin-left: 1px;
  border-left: 1px solid color-mix(in srgb, currentColor 35%, transparent);
  font-variant-numeric: tabular-nums;
  opacity: 0.9;
}

.cf--compact {
  padding: 5px 10px; border-radius: 9px;
  font-size: 11.5px; gap: 4px;
}
.cf--compact .cf__count { padding-left: 5px; }
</style>
