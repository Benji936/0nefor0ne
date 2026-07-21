<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { timeAgo } from "@/lib/notifications";
import { isLookingFor } from "@/lib/announceKind";

const { t } = useI18n();

const props = defineProps({
  announce: { type: Object, required: true },
  currentUserId: { type: String, default: null },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(["click"]);

const isOwner = computed(() => props.announce.seller === props.currentUserId);

const coverImage  = computed(() => props.announce.images?.[0]?.url ?? null);
const imageCount  = computed(() => props.announce.images?.length ?? 0);

const isLf = computed(() => isLookingFor(props.announce));

// LF posts may carry no budget at all, in which case there is nothing to show.
const formattedPrice = computed(() => {
  const p = props.announce.price;
  if (p === null || p === undefined || p === "") return null;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: props.announce.currency || "EUR",
    maximumFractionDigits: 0,
  }).format(p);
});

const sellerName    = computed(() => props.announce.Trader?.Name || props.announce.Trader?.name || t("announces.unknownSeller"));
const sellerAvatar  = computed(() => props.announce.Trader?.avatar_url ?? null);
const sellerInitial = computed(() => (sellerName.value || "?")[0].toUpperCase());
const location = computed(() => {
  const city    = props.announce.Trader?.City    || props.announce.Trader?.city;
  const country = props.announce.Trader?.Country || props.announce.Trader?.country;
  if (city && country) return `${city}, ${country}`;
  return country || null;
});
</script>

<template>
  <article class="ac" :class="{ 'ac--own': isOwner, 'ac--compact': compact }" @click="emit('click', announce)">

    <!-- Image -->
    <div class="ac-img">
      <div v-if="isLf" class="ac-lf">{{ t('announce.lfBadge') }}</div>
      <img v-if="coverImage" :src="coverImage" :alt="announce.title" class="ac-img__photo" loading="lazy" />
      <div v-else class="ac-img__empty">
        <v-icon icon="mdi-image-off-outline" size="32" style="color: var(--c-border)" />
      </div>

      <!-- Photo count -->
      <div v-if="imageCount > 1" class="ac-img__count">
        <v-icon icon="mdi-image-multiple-outline" size="11" />
        {{ imageCount }}
      </div>

      <!-- Price pill floating on image -->
      <div v-if="formattedPrice" class="ac-img__price">
        <span v-if="isLf" class="ac-img__price-label">{{ t('announce.budget') }}</span>
        {{ formattedPrice }}
      </div>
    </div>

    <!-- Body -->
    <div class="ac-body">
      <p class="ac-title">{{ announce.title }}</p>
      <p v-if="isLf && announce.archetype" class="ac-archetype">
        <v-icon icon="mdi-cards-outline" size="12" />
        {{ announce.archetype }}
      </p>
      <p v-if="announce.description" class="ac-desc">{{ announce.description }}</p>

      <div class="ac-footer">
        <!-- Seller -->
        <div class="ac-seller">
          <img v-if="sellerAvatar" :src="sellerAvatar" :alt="sellerName" class="ac-avatar" loading="lazy" />
          <span v-else class="ac-avatar ac-avatar--letter">{{ sellerInitial }}</span>
          <div class="ac-seller-text">
            <span class="ac-seller-name">{{ sellerName }}</span>
            <span v-if="location" class="ac-seller-loc">{{ location }}</span>
          </div>
        </div>
        <span class="ac-time">{{ timeAgo(announce.created_at, t) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ── Base card ─────────────────────────────────────── */
.ac {
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1.5px solid var(--c-border);
  background: var(--c-surface);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.ac:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 40px rgba(0,0,0,0.22);
  border-color: color-mix(in srgb, var(--c-trade) 50%, transparent);
}

/* ── Owner highlight ───────────────────────────────── */
.ac--own {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c-trade) 40%, transparent),
              0 0 20px color-mix(in srgb, var(--c-trade) 12%, transparent);
}
.ac--own:hover {
  border-color: var(--c-trade);
  box-shadow: 0 0 0 1px var(--c-trade),
              0 16px 40px rgba(0,0,0,0.24);
}

/* ── Image area ────────────────────────────────────── */
.ac-img {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: color-mix(in srgb, var(--c-surface-2) 60%, transparent);
  overflow: hidden;
  flex-shrink: 0;
}
.ac-img__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s ease;
}
.ac:hover .ac-img__photo { transform: scale(1.06); }

.ac-img__empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ac-img__count {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border-radius: 99px;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.ac-img__price {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 32px 12px 10px;
  background: linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%);
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}
.ac-lf {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  /* Dark ink, not white: --c-mutual is a bright teal in dark theme, where white
     lands at 1.86:1. This ink clears AA in both themes (4.52 light, 10.69 dark)
     and matches the on-mutual text colour DESIGN.md already specifies. */
  color: #13031A;
  background: var(--c-mutual);
}
.ac-img__price-label {
  font-size: 9px;
  font-weight: 700;
  opacity: .8;
  margin-right: 3px;
  text-transform: uppercase;
}
.ac-archetype {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-mutual);
}

/* ── Body ──────────────────────────────────────────── */
.ac-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 13px 13px;
  flex: 1;
}
.ac-title {
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--c-text);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ac-desc {
  font-size: 11.5px;
  color: var(--c-muted);
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Footer row ────────────────────────────────────── */
.ac-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}
.ac-seller {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.ac-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--c-border);
  flex-shrink: 0;
}
.ac-avatar--letter {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-surface-2);
  color: var(--c-text);
  font-size: 10px;
  font-weight: 800;
}
.ac-seller-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ac-seller-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-seller-loc {
  font-size: 10px;
  color: var(--c-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ac-time {
  font-size: 10px;
  color: var(--c-muted);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
