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
});

const emit = defineEmits(["click"]);

// Both sides are null on a community announce seen by a logged-out visitor,
// and null === null would make every one of them look owned. Require an id.
const isOwner = computed(() => !!props.currentUserId && props.announce.seller === props.currentUserId);

const coverImage  = computed(() => props.announce.images?.[0]?.url ?? null);
const imageCount  = computed(() => props.announce.images?.length ?? 0);

const isLf = computed(() => isLookingFor(props.announce));

// Amethyst offers, pink wants (DESIGN.md, The Three-Role Rule). Set once on the
// root as --kind and read by the badge, the archetype line and the hover glow,
// so a tile cannot end up half one colour and half the other. This used to be
// teal on the Looking For side, which is the agreement chain's colour and not
// available for anything else.
const kindColor = computed(() => (isLf.value ? "var(--c-accent)" : "var(--c-trade)"));

// Archetype art. Null whenever the announce matched no archetype, and null
// again once the image has failed to load — a few of the newest cards have no
// cropped artwork rendered yet, and a Looking For post with no recognisable
// archetype must show no picture rather than a placeholder.
const artFailed = ref(false);
const archetypeArt = computed(() =>
  isLf.value && !artFailed.value ? archetypeArtUrl(props.announce.archetype) : null
);

// No photo, no photo block. The 4:3 slot used to render as a grey rectangle
// with a crossed-out image icon whenever a Selling post had no picture — the
// same dead rectangle Looking For posts were already spared. A tile with
// nothing to show is shorter instead, and its price moves into the body.
const hasImageSlot = computed(() => !!coverImage.value);

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
  <!--
    A tile is a button that happens to be big. It was click-only, which put the
    whole board out of reach of a keyboard — every route into an announce runs
    through here. The seller block inside is its own tab stop and stops the
    click itself (see TraderLink), so the two do not fight.
  -->
  <article
    class="ac"
    :class="{ 'ac--expired': expired, 'ac--noimg': !hasImageSlot }"
    :style="{ '--kind': kindColor }"
    role="button"
    tabindex="0"
    :aria-label="announce.title"
    @click="emit('click', announce)"
    @keydown.enter.prevent="emit('click', announce)"
    @keydown.space.prevent="emit('click', announce)"
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
      <img :src="coverImage" :alt="announce.title" class="ac-img__photo" loading="lazy" />

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

      <!-- Budget: normally a pill floating on the image, which a text-only
           Looking For tile does not have. -->
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
/* ── Base tile ─────────────────────────────────────────
   Ground, hairline and top highlight come from the board this sits on
   (--an-* on AnnouncesTab's root); the fallbacks are only there so the tile
   still renders if it is ever dropped somewhere else. Panels sit one tonal
   step under the page and depth is a 1px inset highlight rather than a drop
   shadow, per DESIGN.md's Flat-By-Default Rule.

   No owner highlight any more. Amethyst says "selling" everywhere on this page
   now, so it cannot also say "yours" — and it never needed to: your own
   listings are under a heading that says so. */
.ac {
  position: relative; /* anchors .ac-badges when the image block is absent */
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--an-line, var(--c-border));
  background: var(--an-panel, var(--c-surface));
  box-shadow: var(--an-lit, none);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
/* The glow is the tile's own kind, not a black drop shadow: hovering an offer
   warms amethyst, hovering a want warms pink. */
.ac:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--kind) 55%, transparent);
  box-shadow: 0 14px 34px color-mix(in srgb, var(--kind) 20%, transparent);
}
.ac:focus-visible { outline: 2px solid var(--kind); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) {
  .ac, .ac:hover { transition: none; transform: none; }
  .ac-img__photo, .ac:hover .ac-img__photo { transition: none; transform: none; }
}

/* ── Image area ────────────────────────────────────── */
.ac-img {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: var(--c-surface-2);
  overflow: hidden;
  flex-shrink: 0;
}
.ac-img__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s ease;
}
.ac:hover .ac-img__photo { transform: scale(1.05); }

.ac-img__count {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 7px;
  border-radius: 99px;
  /* White on a black scrim over a photo — the one place a literal white is the
     right answer, because the backing is neither a brand colour nor a token. */
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

/* The one display moment on a tile. A price is the fact a passer-by is
   scanning for, so it is set in the display face rather than in body weight. */
.ac-img__price {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 32px 12px 10px;
  background: linear-gradient(to top, rgba(0,0,0,0.74) 0%, transparent 100%);
  color: #fff;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.18rem;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}
.ac-img__price-label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 9px;
  font-weight: 700;
  opacity: .82;
  margin-right: 4px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
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
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  white-space: nowrap;
}
/* Pink, because a Looking For post is a want and pink is what wanting is
   called here. --c-on-accent for the label, which flips per theme: dark ink on
   the bright pink of dark mode, white on the deep pink of light mode (DESIGN.md,
   The Label Contrast Rule). */
.ac-badge--lf {
  color: var(--c-on-accent);
  background: var(--c-accent);
}
/* Neutral rather than red: an expired listing is dormant, not an error, and
   the owner can bring it back with one click. Tinted toward the brand hue like
   every other neutral in the system — it used to be #3f3f46, a flat gray, which
   The No-Gray Rule does not allow. */
.ac-badge--expired {
  color: var(--c-text);
  background: var(--c-surface-2);
  border: 1px solid var(--an-line, var(--c-border));
}
/* Dark ink on amber, 8.6:1. Amber is the app's one warning colour and already
   means "attention, not failure" elsewhere (the seller rating star). It stays
   outside the three-role palette on purpose: a countdown is not an offer, a
   want, or an agreement. */
.ac-badge--soon {
  color: #1a1205;
  background: #f59e0b;
  letter-spacing: .04em;
}

/* Text-only Looking For tile: no image to float over, so the badges drop into
   normal flow above the title and the row can use the full width. */
.ac--noimg .ac-badges {
  position: static;
  max-width: none;
  padding: 12px 13px 0;
}

/* Expired tiles read as dormant through their pictures and their badge, never
   by dimming their words. The body used to sit at 0.65 opacity, which put the
   description at 3.53:1 and the archetype line at 2.74:1 — and this is the one
   tile whose text is being read on purpose, because the owner is deciding
   whether to renew it. The badge stays out of the fade so it reads first.

   The hover lift stays too: an expired tile is still clickable, and clicking
   it is how the owner gets to the Renew button. */
.ac--expired .ac-img__photo,
.ac--expired .ac-img__price { filter: grayscale(0.85); opacity: 0.5; }
/* The one bit of body colour that would otherwise still say "live". */
.ac--expired .ac-archetype { color: var(--c-muted); }

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
   a second row would change the tile's height and break the grid's rhythm. */
.ac-wantstrip {
  display: flex;
  align-items: center;
  gap: 5px;
  /* The clip is a guard against a strip wider than the tile. The padding is what
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
  border: 1px solid var(--an-line, var(--c-border));
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
  border: 1px solid var(--an-line, var(--c-border));
  color: var(--c-text);
  font-size: 9px;
  font-weight: 800;
  line-height: 13px;
  text-align: center;
}
.ac-wantstrip__more {
  flex-shrink: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
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
  color: var(--kind);
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
  border: 1px solid color-mix(in srgb, var(--kind) 45%, transparent);
}
.ac--expired .ac-archetype__art { filter: grayscale(0.85); }

/* Body-level budget, replacing the on-image price pill on text-only tiles. */
.ac-budget {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--c-text);
}
.ac-budget__label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 9px;
  font-weight: 700;
  color: var(--c-muted);
  margin-right: 4px;
  letter-spacing: 0.1em;
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
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.32;
  letter-spacing: -0.01em;
  color: var(--c-text);
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ac-desc {
  font-size: 0.72rem;
  color: var(--c-muted);
  line-height: 1.45;
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
  padding-top: 10px;
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
  border: 1px solid var(--an-line, var(--c-border));
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
