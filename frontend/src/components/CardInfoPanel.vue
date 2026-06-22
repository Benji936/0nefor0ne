<script setup>
// Shared "fuwalab-style" card panel: cropped art banner with price/rarity badges,
// name, type/race, a meta row (boxed level · attribute · ATK/DEF), and effect text.
// Used by both the hover preview (CardHoverPreview) and the click modal (CardYugi)
// so the two always match. Purely presentational — reuses the app's card iconography.
import { computed, ref, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { cardImage, cardImageCropped } from "@/lib/cardImage";
import { isSpellTrap, levelIconFor } from "@/lib/cardIcons";
import { hasAnyBanlist, ensureBanlistManifest } from "@/lib/banlist";
import CardKindIcons from "@/components/CardKindIcons.vue";
import CardBanlistBadge from "@/components/CardBanlistBadge.vue";

const props = defineProps({
  card: { type: Object, default: null },
  // Lets the banner render while full card data is still loading (hover preview).
  imageId: { type: [String, Number], default: null },
  clampDesc: { type: Boolean, default: false },
  // Show the borderless artwork (cards_cropped/) instead of the bordered card.
  // Used by the hover preview only.
  cropped: { type: Boolean, default: false },
});

const { t } = useI18n();

const imgId = computed(() => props.imageId ?? props.card?.id ?? null);

// If the cropped art isn't on R2 yet (a printing can lag a sync), fall back to
// the bordered card. A new card id resets the attempt.
const croppedFailed = ref(false);
watch(imgId, () => { croppedFailed.value = false; });
const showCropped = computed(() => props.cropped && !croppedFailed.value);
const artSrc = computed(() => {
  const id = imgId.value;
  if (!id) return "";
  return showCropped.value ? cardImageCropped(id) : cardImage(id);
});
function onArtError() {
  // Only swap once: cropped → bordered. If the bordered image also 404s, the
  // global card-image fallback (installCardImageFallback) swaps in the card back.
  if (showCropped.value) croppedFailed.value = true;
}
const isST = computed(() => !!props.card && isSpellTrap(props.card));
const hasBanlist = computed(() => hasAnyBanlist(props.card));
onMounted(ensureBanlistManifest);
const levelIcon = computed(() => (props.card ? levelIconFor(props.card) : null));

const price = computed(() => {
  const raw = props.card?.card_prices?.[0]?.cardmarket_price;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
});
const rarity = computed(() => props.card?.card_sets?.[0]?.set_rarity || null);

/** ATK / DEF line. Link monsters have no DEF; "?" stats are negative in the API. */
const statsText = computed(() => {
  const c = props.card;
  if (!c || isST.value || (c.atk == null && c.def == null)) return null;
  const fmt = (v) => (v == null || v < 0 ? "?" : v);
  return c.def == null ? `ATK ${fmt(c.atk)}` : `${fmt(c.atk)} / ${fmt(c.def)}`;
});
</script>

<template>
  <div class="cip">
    <!-- Art banner + badges -->
    <div class="cip-art" :class="{ 'cip-art--cropped': showCropped }">
      <img v-if="imgId" :src="artSrc" alt="" @error="onArtError" />
      <span v-if="price" class="cip-badge cip-price">{{ price }} €</span>
      <span v-if="rarity" class="cip-badge cip-rarity">{{ rarity }}</span>
    </div>

    <!-- Body -->
    <div class="cip-body">
      <template v-if="card">
        <p class="cip-name">{{ card.name }}</p>
        <p v-if="card.type" class="cip-type">{{ card.type }}</p>
        <p v-if="card.race && !isST" class="cip-race">{{ card.race }}</p>

        <div v-if="hasBanlist" class="cip-banlist">
          <CardBanlistBadge :card="card" format="tcg" variant="chip" show-format />
          <CardBanlistBadge :card="card" format="ocg" variant="chip" show-format />
        </div>

        <div class="cip-meta">
          <span v-if="levelIcon" class="cip-chip cip-level">
            <img v-if="levelIcon.src" :src="levelIcon.src" :alt="levelIcon.label" class="cip-chip-ico" />
            <span class="cip-chip-label">{{ t('cardYugi.level') }}</span>
            <span class="cip-level-val">{{ levelIcon.value }}</span>
          </span>
          <span class="cip-chip cip-chip-attr">
            <CardKindIcons :card="card" :size="20" :icons-only="true" />
          </span>
          <span v-if="statsText" class="cip-chip cip-stats">{{ statsText }}</span>
        </div>

        <p v-if="card.desc" class="cip-desc" :class="{ 'cip-desc-clamp': clampDesc }">{{ card.desc }}</p>
      </template>

      <div v-else class="cip-loading">
        <v-progress-circular indeterminate size="18" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cip {
  border-radius: 18px;
  overflow: hidden;
  background: var(--c-surface, #13092a);
  border: 1px solid var(--c-border);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.6);
}

.cip-art { position: relative; height: 186px; overflow: hidden; }
.cip-art img { width: 100%; height: 100%; object-fit: cover; object-position: center 26%; display: block; }
/* Borderless artwork has no name plate to skip — center it instead. */
.cip-art--cropped img { object-position: center center; }
.cip-art::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.22),
    transparent 26% 58%,
    var(--c-surface, #13092a)
  );
}

.cip-badge {
  position: absolute;
  top: 12px;
  z-index: 1;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 11px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.cip-price {
  left: 12px;
  background: color-mix(in srgb, var(--c-success, #34d399) 82%, black 6%);
  color: #06140d;
}
.cip-rarity {
  right: 12px;
  background: color-mix(in srgb, var(--c-accent, #9a52f5) 88%, transparent);
  color: #fff;
}

.cip-body { position: relative; padding: 0 18px 18px; margin-top: -6px; }
.cip-name { font-size: 21px; font-weight: 800; line-height: 1.18; color: var(--c-text); }
.cip-type {
  margin-top: 7px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-accent, #9a52f5);
}
.cip-race {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.cip-banlist { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }

.cip-meta { display: flex; align-items: center; gap: 8px; margin-top: 14px; }
.cip-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--c-text, #fff) 8%, transparent);
  border: 1px solid var(--c-border);
  font-size: 13px;
  color: var(--c-text);
}
.cip-chip-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-muted); }
.cip-chip-ico { width: 16px; height: 16px; object-fit: contain; }
.cip-level-val {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 5px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--c-text, #fff) 15%, transparent);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.cip-chip-attr { border-radius: 999px; padding: 7px; }
.cip-stats { margin-left: auto; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }

.cip-desc {
  margin-top: 14px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--c-text);
  opacity: 0.82;
  white-space: pre-wrap;
}
.cip-desc-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 11;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.cip-loading { padding: 8px 0 4px; color: var(--c-muted); }
</style>
