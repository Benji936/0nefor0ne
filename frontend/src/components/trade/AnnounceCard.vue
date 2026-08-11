<script setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { timeAgo } from "@/lib/notifications";
import TraderLink from "@/components/trade/TraderLink.vue";
import { isLookingFor } from "@/lib/announceKind";
import { isExpired, isExpiringSoon, daysUntilExpiry } from "@/lib/announceExpiry";
import { archetypeArtUrl, ensureArchetypeArtManifest } from "@/lib/archetypeArt";
import { cardImage } from "@/lib/cardImage";

ensureArchetypeArtManifest();

const { t } = useI18n();

const props = defineProps({
  announce: { type: Object, required: true },
  currentUserId: { type: String, default: null },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(["click"]);

// Both sides are null on a community announce seen by a logged-out visitor,
// and null === null would make every one of them look owned. Require an id.
const isOwner = computed(() => !!props.currentUserId && props.announce.seller === props.currentUserId);

const coverImage  = computed(() => props.announce.images?.[0]?.url ?? null);
const imageCount  = computed(() => props.announce.images?.length ?? 0);

const isLf = computed(() => isLookingFor(props.announce));

// Archetype art. Null whenever the announce matched no archetype, and null
// again once the image has failed to load — a few of the newest cards have no
// cropped artwork rendered yet, and a Looking For post with no recognisable
// archetype must show no picture rather than a placeholder.
const artFailed = ref(false);
const archetypeArt = computed(() =>
  isLf.value && !artFailed.value ? archetypeArtUrl(props.announce.archetype) : null
);

// Looking For posts are usually text-only, and for those the 4:3 image block is
// just a grey rectangle, so the card goes compact and leans on the archetype
// thumbnail instead. A poster who did attach photos keeps the normal block.
const hasImageSlot = computed(() => !isLf.value || !!coverImage.value);

// Distinct cards on the want list, not total copies: "8 cards" reads better
// than "23 cards" for a list of eight lines asking for three copies each.
const wantCount = computed(() => (isLf.value ? props.announce.wantCards?.length ?? 0 : 0));

// The covers of what a Looking For post is after. Recognising the art is
// faster than reading a line that says how many cards there are, and it is the
// thing a passer-by scans the list for.
//
// Only entries the resolver pinned to a passcode can show a cover. The rest are
// real wants — "Kashtira Fenrir (alt art)" is still something to answer — but
// they have no image, so they are counted into the +N rather than drawn as
// blanks. Same reason the strip is capped: past a handful these stop being
// recognisable and start being a wall.
const WANT_THUMB_MAX = 5;
const wantThumbs = computed(() =>
  isLf.value
    ? (props.announce.wantCards ?? []).filter((w) => w.ygo_card_id).slice(0, WANT_THUMB_MAX)
    : []
);
const wantOverflow = computed(() => Math.max(0, wantCount.value - wantThumbs.value.length));

// Expiry state. Only ever surfaces on the owner's own cards, because
// fetchAnnounces() does not return other people's expired listings at all.
const expired   = computed(() => isOwner.value && isExpired(props.announce));
const expiring  = computed(() => isOwner.value && isExpiringSoon(props.announce));
const daysLeft  = computed(() => daysUntilExpiry(props.announce));

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

// Posted from Discord by somebody with no account yet: the announce belongs to
// the community, and the identity shown is the author's public Discord profile.
// TraderLink degrades to a plain span on a null id, so no link guard is needed.
const fromCommunity = computed(() => !props.announce.seller && !!props.announce.Community);

const sellerName = computed(() =>
  fromCommunity.value
    ? (props.announce.discord_author_name || t("announces.unknownSeller"))
    : (props.announce.Trader?.Name || props.announce.Trader?.name || t("announces.unknownSeller")));
const sellerAvatar = computed(() =>
  fromCommunity.value
    ? (props.announce.discord_author_avatar ?? null)
    : (props.announce.Trader?.avatar_url ?? null));
const sellerInitial = computed(() => (sellerName.value || "?")[0].toUpperCase());
const location = computed(() => {
  // The community stands in for a location: it is what says where this came from.
  if (fromCommunity.value) return props.announce.Community?.name ?? null;
  const city    = props.announce.Trader?.City    || props.announce.Trader?.city;
  const country = props.announce.Trader?.Country || props.announce.Trader?.country;
  if (city && country) return `${city}, ${country}`;
  return country || null;
});
</script>

<template>
  <article
    class="ac"
    :class="{ 'ac--own': isOwner, 'ac--compact': compact, 'ac--expired': expired, 'ac--noimg': !hasImageSlot }"
    @click="emit('click', announce)"
  >

    <!-- Badge stack: a listing can be both a Looking For and expired. Sits
         outside .ac-img so one block serves both layouts — CSS floats it over
         the image when there is one, and lets it sit in flow when there isn't. -->
    <div v-if="isLf || expired || expiring" class="ac-badges">
      <span v-if="isLf" class="ac-badge ac-badge--lf">{{ t('announce.lfBadge') }}</span>
      <span v-if="expired" class="ac-badge ac-badge--expired">{{ t('announce.expired') }}</span>
      <!-- Short form: the pill is 10px tall, the full sentence lives in the
           detail dialog. -->
      <span v-else-if="expiring" class="ac-badge ac-badge--soon">
        {{ t('announce.expiresInShort', { days: daysLeft }) }}
      </span>
    </div>

    <!-- Image -->
    <div v-if="hasImageSlot" class="ac-img">
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
        <img
          v-if="archetypeArt"
          :src="archetypeArt"
          class="ac-archetype__art"
          alt=""
          loading="lazy"
          @error="artFailed = true"
        />
        <v-icon v-else icon="mdi-cards-outline" size="12" />
        {{ announce.archetype }}
      </p>
      <!-- What the poster is after, as covers. Falls back to the count line for
           a want list where nothing resolved to a card. -->
      <div v-if="wantThumbs.length" class="ac-wantstrip">
        <span
          v-for="w in wantThumbs"
          :key="w.id ?? w.card_name"
          class="ac-wantstrip__item"
          :title="w.card_name"
        >
          <img :src="cardImage(w.ygo_card_id)" :alt="w.card_name" class="ac-wantstrip__img" loading="lazy" />
          <span v-if="w.qty > 1" class="ac-wantstrip__qty">{{ w.qty }}</span>
        </span>
        <span v-if="wantOverflow" class="ac-wantstrip__more">+{{ wantOverflow }}</span>
      </div>
      <p v-else-if="wantCount" class="ac-wants">
        <v-icon icon="mdi-format-list-bulleted" size="12" />
        {{ t('announce.wantCount', { count: wantCount }, wantCount) }}
      </p>
      <p v-if="announce.description" class="ac-desc">{{ announce.description }}</p>

      <!-- Budget: normally a pill floating on the image, which compact Looking
           For cards no longer have. -->
      <p v-if="!hasImageSlot && formattedPrice" class="ac-budget">
        <span v-if="isLf" class="ac-budget__label">{{ t('announce.budget') }}</span>
        {{ formattedPrice }}
      </p>

      <div class="ac-footer">
        <!-- Seller -->
        <TraderLink :trader-id="announce.seller" class="ac-seller">
          <img v-if="sellerAvatar" :src="sellerAvatar" :alt="sellerName" class="ac-avatar" loading="lazy" />
          <span v-else class="ac-avatar ac-avatar--letter">{{ sellerInitial }}</span>
          <div class="ac-seller-text">
            <span class="ac-seller-name tl-name">{{ sellerName }}</span>
            <span v-if="location" class="ac-seller-loc">{{ location }}</span>
          </div>
        </TraderLink>
        <span class="ac-time">{{ timeAgo(announce.created_at, t) }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ── Base card ─────────────────────────────────────── */
.ac {
  position: relative; /* anchors .ac-badges when the image block is absent */
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
/* Badge stack, top-left of the image. A card can carry both an LF badge and
   an expiry badge, so they sit in a row rather than overlapping. */
.ac-badges {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  /* Leave room for the photo-count pill in the opposite corner. */
  max-width: calc(100% - 60px);
}
.ac-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
  white-space: nowrap;
}
.ac-badge--lf {
  /* --c-on-accent, which flips per theme: dark ink on the bright teal of dark
     mode (10.69:1, where white would be 1.86), white on the deep teal of light
     mode (6.11:1). See The Label Contrast Rule in DESIGN.md. */
  color: var(--c-on-accent);
  background: var(--c-mutual);
}
/* Neutral rather than red: an expired listing is dormant, not an error, and
   the owner can bring it back with one click. White on #3f3f46 is 10.4:1. */
.ac-badge--expired {
  color: #fff;
  background: #3f3f46;
}
/* Dark ink on amber, 8.6:1. Amber already means "attention, not failure"
   elsewhere in the app (the seller rating star). */
.ac-badge--soon {
  color: #1a1205;
  background: #f59e0b;
  letter-spacing: .04em;
}

/* Compact Looking For card: no image to float over, so the badges drop into
   normal flow above the title and the row can use the full width. */
.ac--noimg .ac-badges {
  position: static;
  max-width: none;
  padding: 12px 13px 0;
}

/* Expired cards read as dormant: drained of colour, but still legible and
   still clickable, because clicking is how the owner renews them. The badge
   itself is deliberately left out so it stays crisp against the dimming. */
.ac--expired .ac-img__photo,
.ac--expired .ac-img__empty,
.ac--expired .ac-img__price { filter: grayscale(0.85); opacity: 0.5; }
.ac--expired .ac-body { opacity: 0.65; }
/* The hover lift stays: an expired card is still clickable, and clicking it is
   how the owner gets to the Renew button. */
.ac-img__price-label {
  font-size: 9px;
  font-weight: 700;
  opacity: .8;
  margin-right: 3px;
  text-transform: uppercase;
}
.ac-wants {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-muted);
}
/* Want-list covers. Deliberately does not wrap: the strip is capped at five, and
   a second row would change the card's height and break the grid's rhythm. */
.ac-wantstrip {
  display: flex;
  align-items: center;
  gap: 5px;
  /* The clip is a guard against a strip wider than the card. The padding is what
     keeps it from eating the qty badge, which hangs 3px past the cover it sits on
     — overflow clips to the padding box, so the badge needs room inside it. */
  padding: 0 4px 4px 0;
  overflow: hidden;
}
.ac-wantstrip__item {
  position: relative;
  flex-shrink: 0;
  line-height: 0;
}
.ac-wantstrip__img {
  display: block;
  width: 30px;
  height: 44px; /* the 59:86 card ratio, near enough at this size */
  object-fit: cover;
  border-radius: 3px;
  border: 1px solid var(--c-border);
}
/* Only drawn above one copy — a "1" on every cover would be noise. */
.ac-wantstrip__qty {
  position: absolute;
  right: -3px;
  bottom: -3px;
  min-width: 15px;
  padding: 0 3px;
  border-radius: 8px;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  color: var(--c-text);
  font-size: 9px;
  font-weight: 800;
  line-height: 13px;
  text-align: center;
}
.ac-wantstrip__more {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--c-muted);
}
.ac--expired .ac-wantstrip__img { filter: grayscale(0.85); }

.ac-archetype {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-mutual);
  margin: 0;
}
/* Elected card artwork for the archetype. Hidden entirely (not swapped for a
   placeholder) if it fails to load — see artFailed in the script. */
.ac-archetype__art {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--c-mutual) 45%, transparent);
}
.ac--expired .ac-archetype__art { filter: grayscale(0.85); }

/* Body-level budget, replacing the on-image price pill on compact cards. */
.ac-budget {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--c-text);
}
.ac-budget__label {
  font-size: 9px;
  font-weight: 700;
  color: var(--c-muted);
  margin-right: 3px;
  text-transform: uppercase;
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
