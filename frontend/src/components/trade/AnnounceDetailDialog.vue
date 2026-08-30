<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import TraderLink from "@/components/trade/TraderLink.vue";
import { useRoute } from "vue-router";
import { timeAgo } from "@/lib/notifications";
import { deleteAnnounce, updateAnnounce, renewAnnounce } from "@/lib/announces";
import { isLookingFor } from "@/lib/announceKind";
import { isExpired, isExpiringSoon, daysUntilExpiry } from "@/lib/announceExpiry";
import { archetypeArtUrl, ensureArchetypeArtManifest } from "@/lib/archetypeArt";
import { cardImage } from "@/lib/cardImage";
import { getClient } from "@/lib/supabaseClient";
import { searchById, searchCardByName, searchCardBySetCode } from "@/api";
import AddCard from "@/components/library/AddCard.vue";
import AnnounceChatPanel from "@/components/trade/AnnounceChatPanel.vue";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  announce:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});
const emit = defineEmits(["update:modelValue", "deleted", "updated", "propose", "edit", "requireAuth"]);
const { t } = useI18n();
const route = useRoute();

const deleting      = ref(false);
const updating      = ref(false);
const renewing      = ref(false);
const addingToList  = ref(false);
const addedToList   = ref(false);
const addCardRef    = ref(null);
const imgIdx        = ref(0);
const mobileTab     = ref("details"); // mobile-only: 'details' | 'chat'

watch(() => props.modelValue, open => {
  if (open) {
    imgIdx.value = 0;
    mobileTab.value = "details";
    addedToList.value = false;
    artFailed.value = false; // the dialog is reused across announces
    // reset card link state
    cardLinkOpen.value    = false;
    cardQuery.value       = "";
    cardResults.value     = [];
    cardSearchErr.value   = "";
    linkingCard.value     = false;
  }
});

// ── Card linking (owner only, when ygo_card_id is not set) ─────────────────
const SET_CODE_RE     = /^[A-Z0-9]{2,6}-[A-Z]{0,2}\d{3,4}$/i;
const cardLinkOpen    = ref(false);
const cardQuery       = ref("");
const cardResults     = ref([]);
const cardSearching   = ref(false);
const cardSearchErr   = ref("");
const linkingCard     = ref(false);
let   cardDebounce    = null;

function onCardInput() {
  clearTimeout(cardDebounce);
  cardResults.value = [];
  cardSearchErr.value = "";
  const q = cardQuery.value.trim();
  if (q.length < 2) return;
  cardDebounce = setTimeout(() => doCardSearch(q), 350);
}

async function doCardSearch(q) {
  cardSearching.value = true;
  cardSearchErr.value = "";
  try {
    let cards = [];
    if (SET_CODE_RE.test(q)) {
      const res = await searchCardBySetCode(q);
      const card = res?.data;
      if (card?.id) cards = [card];
    } else {
      const res = await searchCardByName(q);
      cards = res?.data?.data ?? [];
    }
    cardResults.value = cards.slice(0, 8);
    if (cards.length === 0) cardSearchErr.value = t('announce.cardNotFound');
  } catch {
    cardSearchErr.value = t('announce.cardSearchFailed');
  } finally {
    cardSearching.value = false;
  }
}

async function pickAndLinkCard(card) {
  linkingCard.value = true;
  cardResults.value = [];
  try {
    await updateAnnounce(props.announce.id, {
      ygo_card_id: card.id,
      card_name:   card.name,
    });
    // Patch the local object so the UI reflects instantly
    props.announce.ygo_card_id = card.id;
    props.announce.card_name   = card.name;
    cardLinkOpen.value = false;
    emit('updated', props.announce.id);
  } catch (err) {
    cardSearchErr.value = err.message ?? t('announce.cardLinkFailed');
  } finally {
    linkingCard.value = false;
  }
}

// Guarded against null === null: see AnnounceCard.vue.
const isOwner = computed(() => !!props.currentUserId && props.announce?.seller === props.currentUserId);
const isLf = computed(() => isLookingFor(props.announce));

// ── Expiry (owner-facing only) ────────────────────────────────────────────
// Other people's expired listings never reach the client, so the owner is the
// only one who can be looking at one of these.
const expired   = computed(() => isExpired(props.announce));
const expiring  = computed(() => isExpiringSoon(props.announce));
const daysLeft  = computed(() => daysUntilExpiry(props.announce));
// Renewing at day 25 of 30 would just be noise, so the button only appears
// once the listing is actually near the end of its window or past it.
const canRenew  = computed(() => isOwner.value && (expired.value || expiring.value));

// LF posts may carry no budget at all, in which case there is nothing to show.
const formattedPrice = computed(() => {
  const p = props.announce?.price;
  if (p === null || p === undefined || p === "") return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: props.announce.currency || "EUR" }).format(p);
});

// Posted from Discord by somebody with no account yet. The announce belongs to
// the community and there is no seller to chat with on-site, so the contact
// route becomes the Discord message the listing came from.
const fromCommunity = computed(() => !props.announce?.seller && !!props.announce?.Community);
const communityName = computed(() => props.announce?.Community?.name ?? null);

const sellerName = computed(() =>
  fromCommunity.value
    ? (props.announce?.discord_author_name || t("announces.unknownSeller"))
    : (props.announce?.Trader?.Name || props.announce?.Trader?.name || t("announces.unknownSeller")));
const sellerAvatar = computed(() =>
  fromCommunity.value
    ? (props.announce?.discord_author_avatar ?? null)
    : (props.announce?.Trader?.avatar_url ?? null));
const sellerInitial = computed(() => (sellerName.value || "?")[0].toUpperCase());
const location = computed(() => {
  if (fromCommunity.value) return communityName.value;
  const city    = props.announce?.Trader?.City    || props.announce?.Trader?.city;
  const country = props.announce?.Trader?.Country || props.announce?.Trader?.country;
  if (city && country) return `${city}, ${country}`;
  return country || null;
});
const rating = computed(() => (fromCommunity.value ? null : props.announce?.Trader?.avg_rating ?? null));
const canChat = computed(() => !!props.currentUserId && !fromCommunity.value);
const images = computed(() => props.announce?.images ?? []);
const wantCards = computed(() =>
  [...(props.announce?.wantCards ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
);

// A Looking For post with no photo has nothing to put in the gallery, and an
// empty image frame just reads as broken. Drop it in that case; the header
// carries the title, price and close button either way, so nothing has to
// stand in for it. Sell posts, and LF posts that do carry photos, keep it.
const showGallery = computed(() => !isLf.value || images.value.length > 0);

// Archetype art, shown in place of the empty-gallery icon and beside the
// archetype name. Null for an announce that matched no archetype, and null
// again once the image has failed to load, so nothing is ever drawn in its place.
ensureArchetypeArtManifest();
const artFailed = ref(false);
const archetypeArt = computed(() =>
  isLf.value && !artFailed.value ? archetypeArtUrl(props.announce?.archetype) : null
);

const discordUrl  = computed(() => props.announce?.discord_url ?? null);
const guildName   = computed(() => props.announce?.discord_guild_name ?? null);
const guildIcon   = computed(() => props.announce?.discord_guild_icon ?? null);

// With no chat pane the detail pane owns the whole dialog, and stacking a
// full-width photo over the details pushes everything a reader came for below
// the fold. Side by side instead: the photo takes the left column and the
// listing is readable without scrolling. An announce posted from Discord is
// always in this state — it has no seller account, so there is no thread to
// open — and so is any listing seen while signed out.
//
// Needs a gallery to put in that column: a Looking For post with no photos has
// nothing to fill it and stays stacked.
const splitLayout = computed(() => !canChat.value && showGallery.value);

// The footer exists to hold buttons, and an empty bordered strip under the
// details reads as a rendering fault — more so beside the photo than beneath
// it. The one case with nothing to put in it is a community-relayed post whose
// server left no invite link: nobody to propose to, nowhere to send you. A
// signed-out reader used to be the other such case, and is not any more — they
// get the log-in-to-contact button.
const showFoot = computed(() =>
  isOwner.value
  || (fromCommunity.value ? !!discordUrl.value : true));

function close() { emit("update:modelValue", false); }

async function handleDelete() {
  if (!confirm(t("announce.deleteConfirm"))) return;
  deleting.value = true;
  try { await deleteAnnounce(props.announce.id); emit("deleted", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to delete"); }
  finally { deleting.value = false; }
}

// Closes the listing. Looking For posts label this "Mark as Found", but the
// stored status stays "sold" either way — it is the table's only closed state
// (CHECK status IN ('active','sold','archived')), and the distinction is
// already carried by `kind`.
async function handleMarkSold() {
  updating.value = true;
  try { await updateAnnounce(props.announce.id, { status: "sold" }); emit("updated", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to update"); }
  finally { updating.value = false; }
}

async function handleRenew() {
  renewing.value = true;
  try {
    // The server decides the real date (see renewAnnounce); patch the local
    // copy with what it returned so this dialog updates without a round trip.
    props.announce.expires_at = await renewAnnounce(props.announce.id);
    emit("updated", props.announce.id);
  }
  catch (err) { alert(err.message ?? "Failed to renew"); }
  finally { renewing.value = false; }
}

function handleEdit() { emit("edit", props.announce); close(); }

function handlePropose() { emit("propose", props.announce.seller); close(); }
function handleLoginToContact() { emit("requireAuth"); close(); }

async function handleAddToTradeList() {
  if (addingToList.value || addedToList.value) return;
  addingToList.value = true;
  try {
    const locale = route?.params?.locale || 'en';
    const res = await searchById(props.announce.ygo_card_id, locale);
    const card = res?.data?.data?.[0] ?? res?.data?.[0] ?? null;
    if (!card) throw new Error('Card not found');
    addCardRef.value.openWith(card);
    addedToList.value = false; // will be set by @added event
  } catch (err) {
    alert(err.message ?? 'Failed to load card');
  } finally {
    addingToList.value = false;
  }
}

function onCardAdded() {
  addedToList.value = true;
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="920"
    content-class="!m-0 sm:!m-6 items-end sm:items-center"
    transition="dialog-bottom-transition"
    scrollable
  >
    <div v-if="announce" class="shell">

      <!-- Mobile-only Details / Chat toggle -->
      <div v-if="canChat" class="mtabs">
        <button class="mtab" :class="{ 'mtab--active': mobileTab === 'details' }" @click="mobileTab = 'details'">
          {{ t('announceChat.tabDetails') }}
        </button>
        <button class="mtab" :class="{ 'mtab--active': mobileTab === 'chat' }" @click="mobileTab = 'chat'">
          {{ t('announceChat.tabChat') }}
        </button>
      </div>

      <!-- Chat pane (left on desktop; only for logged-in users).
           A community announce has no seller, so there is no thread to open:
           the announce_chat guard requires the seller to be one of the two
           participants. Buyers use the Discord link instead. -->
      <div
        v-if="canChat"
        class="chat-pane"
        :class="{ 'pane--hidden-mobile': mobileTab !== 'chat' }"
      >
        <AnnounceChatPanel
          :announce-id="announce.id"
          :seller-id="announce.seller"
          :current-user-id="currentUserId"
          :is-owner="isOwner"
          :active="modelValue"
        />
      </div>

      <!-- Detail pane (right) -->
      <div
        class="detail-pane"
        :class="{ 'pane--hidden-mobile': currentUserId && mobileTab !== 'details' }"
      >
        <div class="dlg" :class="{ 'dlg--split': splitLayout }" :data-kind="isLf ? 'want' : 'sell'">

      <!-- One header, whatever the announce turns out to be.
           There used to be two: a set of overlay chips floated on the photo,
           and a .bare-head strip for a Looking For post with no photo to float
           them on. The strip was the tell — with no owner badge and no budget
           to carry, which is every announce somebody else posted without a
           price, it rendered as forty pixels of empty bar above the title. And
           the overlay version put the close button in the top-right of the
           *photo*, which in the split layout is the middle of the dialog.
           Title, price, age and close belong to the announce, not to its
           photograph, so they sit above both. -->
      <header class="an-head">
        <div class="an-head__meta">
          <span class="an-head__eyebrow">{{ isLf ? t('announce.kindLookingFor') : t('announce.kindSell') }}</span>
          <span v-if="isOwner" class="an-head__own">
            <v-icon icon="mdi-account-check" size="12" />
            {{ t("announces.yourAnnounce") }}
          </span>
          <span class="an-head__time">{{ timeAgo(announce.created_at, t) }}</span>
          <button class="an-head__close" :aria-label="t('common.close')" @click="close">
            <v-icon icon="mdi-close" size="18" />
          </button>
        </div>
        <h2 class="an-head__title">{{ announce.title }}</h2>
        <p v-if="formattedPrice" class="an-head__price">
          <span v-if="isLf" class="an-head__price-label">{{ t('announce.budget') }}</span>{{ formattedPrice }}
        </p>
      </header>

      <!-- The photograph, under the header. Absent for a Looking For post with
           no photos, which has nothing to show. -->
      <div v-if="showGallery" class="gallery">
        <img
          v-if="images.length"
          :src="images[imgIdx].url"
          :alt="announce.title"
          class="gallery__img"
        />
        <div v-else class="gallery__empty">
          <img
            v-if="archetypeArt"
            :src="archetypeArt"
            :alt="announce.archetype"
            class="gallery__art"
            @error="artFailed = true"
          />
          <v-icon v-else icon="mdi-image-off-outline" size="48" style="color: var(--c-border)" />
        </div>

        <!-- Prev / Next -->
        <button v-if="imgIdx > 0" class="gallery__arrow gallery__arrow--left" @click.stop="imgIdx--">
          <v-icon icon="mdi-chevron-left" size="22" />
        </button>
        <button v-if="imgIdx < images.length - 1" class="gallery__arrow gallery__arrow--right" @click.stop="imgIdx++">
          <v-icon icon="mdi-chevron-right" size="22" />
        </button>

        <!-- Dot nav -->
        <div v-if="images.length > 1" class="gallery__dots">
          <button
            v-for="(_, i) in images" :key="i"
            class="gallery__dot"
            :class="{ 'gallery__dot--active': i === imgIdx }"
            @click.stop="imgIdx = i"
          />
        </div>

        <!-- Photo count -->
        <div v-if="images.length > 1" class="gallery__count">
          <v-icon icon="mdi-image-multiple-outline" size="12" />
          {{ imgIdx + 1 }} / {{ images.length }}
        </div>
      </div>

      <!-- Scrollable content -->
      <div class="dlg-body">

        <!-- Expiry state, owner only. Always shown so the countdown is never a
             surprise; escalates to a full banner once the listing is dormant. -->
        <div
          v-if="isOwner && daysLeft !== null"
          class="expiry"
          :class="{ 'expiry--expired': expired, 'expiry--soon': expiring }"
        >
          <v-icon :icon="expired ? 'mdi-clock-alert-outline' : 'mdi-clock-outline'" size="15" />
          <span class="expiry__text">
            {{ expired ? t('announce.expiredNotice') : t('announce.expiresInDays', { days: daysLeft }, daysLeft) }}
          </span>
          <button v-if="canRenew" class="btn-renew" :disabled="renewing" @click="handleRenew">
            <v-progress-circular v-if="renewing" indeterminate size="13" width="2" />
            <v-icon v-else icon="mdi-refresh" size="14" />
            {{ t('announce.renew') }}
          </button>
        </div>

        <!-- Description -->
        <p v-if="announce.description" class="info-desc">{{ announce.description }}</p>

        <!-- Archetype (Looking For posts only) -->
        <p v-if="isLf && announce.archetype" class="detail-archetype">
          <img
            v-if="archetypeArt"
            :src="archetypeArt"
            class="detail-archetype__art"
            alt=""
            @error="artFailed = true"
          />
          <v-icon v-else icon="mdi-cards-outline" size="14" />
          {{ announce.archetype }}<template v-if="announce.want_detail"> · {{ announce.want_detail }}</template>
        </p>

        <!-- Want list. Unresolved entries are shown too: they carry no card id
             but are still what the poster asked for. -->
        <ul v-if="isLf && wantCards.length" class="want-list">
          <li v-for="w in wantCards" :key="w.id ?? w.card_name" class="want-row">
            <img v-if="w.ygo_card_id" :src="cardImage(w.ygo_card_id)" class="want-thumb" alt="" loading="lazy" />
            <span v-else class="want-thumb want-thumb--none"><v-icon icon="mdi-help" size="12" /></span>
            <span class="want-qty">{{ w.qty }}&times;</span>
            <span class="want-name">{{ w.card_name }}</span>
          </li>
        </ul>

        <!-- Discord source link (only for announces posted from Discord) -->
        <a
          v-if="discordUrl"
          :href="discordUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="discord-link"
        >
          <img v-if="guildIcon" :src="guildIcon" class="discord-link__logo" :alt="guildName || ''" />
          <v-icon v-else icon="mdi-discord" size="17" />
          <span class="discord-link__label">
            {{ guildName || t('announce.viewOnDiscord') }}
          </span>
          <v-icon icon="mdi-open-in-new" size="13" class="discord-link__ext" />
        </a>

        <!-- Card link section (owner only, sell posts only). Linking a single
             card to a Looking For post is backwards — its wants are the want
             list, and a linked card would land on the poster's trade list — so
             it is hidden there. -->
        <div v-if="isOwner && !isLf" class="card-link-section">

          <!-- Already linked: show chip -->
          <div v-if="announce.ygo_card_id" class="card-linked-chip">
            <v-icon icon="mdi-cards-playing-outline" size="14" />
            <span class="card-linked-chip__name">{{ announce.card_name }}</span>
          </div>

          <!-- Not linked yet: show button / inline search -->
          <template v-else>
            <button v-if="!cardLinkOpen" class="btn-link-card" @click="cardLinkOpen = true">
              <v-icon icon="mdi-cards-playing-outline" size="14" />
              {{ t('announce.linkCard') }}
            </button>

            <div v-else class="card-link-picker">
              <!-- Search input -->
              <div class="card-link-input-wrap">
                <v-icon icon="mdi-magnify" size="14" class="card-link-icon" />
                <input
                  v-model="cardQuery"
                  type="text"
                  :placeholder="t('announce.cardSearchPlaceholder')"
                  class="card-link-input"
                  @input="onCardInput"
                  autocomplete="off"
                  autofocus
                />
                <v-progress-circular v-if="cardSearching" indeterminate size="13" width="2" class="card-link-spinner" />
                <button class="card-link-cancel" @click="cardLinkOpen = false; cardQuery = ''; cardResults = []">
                  <v-icon icon="mdi-close" size="13" />
                </button>
              </div>

              <!-- Dropdown -->
              <div v-if="cardResults.length > 0" class="card-link-dropdown">
                <button
                  v-for="c in cardResults"
                  :key="c.id"
                  class="card-link-result"
                  :disabled="linkingCard"
                  @click="pickAndLinkCard(c)"
                >
                  <img
                    v-if="c.card_images?.[0]?.image_url_small"
                    :src="c.card_images[0].image_url_small"
                    class="card-link-result__img"
                  />
                  <div class="card-link-result__info">
                    <span class="card-link-result__name">{{ c.name }}</span>
                    <span class="card-link-result__sub">{{ c.card_sets?.[0]?.set_name ?? '' }}</span>
                  </div>
                  <v-progress-circular v-if="linkingCard" indeterminate size="13" width="2" />
                </button>
              </div>

              <span v-if="cardSearchErr" class="card-link-err">{{ cardSearchErr }}</span>
            </div>
          </template>
        </div>

        <!-- Divider -->
        <div class="divider" />

        <!-- Seller card -->
        <TraderLink :trader-id="announce.seller" class="seller">
          <img v-if="sellerAvatar" :src="sellerAvatar" class="seller__avatar" :alt="sellerName" />
          <div v-else class="seller__avatar seller__avatar--letter">{{ sellerInitial }}</div>
          <div class="seller__info">
            <span class="seller__label">{{ t('announce.postedBy') }}</span>
            <span class="seller__name tl-name">{{ sellerName }}</span>
            <span v-if="location" class="seller__loc">
              <v-icon :icon="fromCommunity ? 'mdi-account-group-outline' : 'mdi-map-marker-outline'" size="11" />
              {{ location }}
            </span>
          </div>
          <div v-if="rating" class="seller__rating">
            <v-icon icon="mdi-star" size="13" />
            <span>{{ Number(rating).toFixed(1) }}</span>
          </div>
        </TraderLink>

      </div>

      <!-- Actions footer -->
      <div v-if="showFoot" class="dlg-foot">
        <template v-if="isOwner">
          <!-- Add to trade/wish list, only when a card is linked. LF posts
               offer the wish list instead of the trade list: the linked card
               is what the poster is hunting for, not something they're
               offering, so it must never be listed as tradeable. -->
          <button
            v-if="announce.ygo_card_id"
            class="btn-tradelist"
            :class="{ 'btn-tradelist--done': addedToList }"
            :disabled="addingToList || addedToList"
            @click="handleAddToTradeList"
          >
            <v-progress-circular v-if="addingToList" indeterminate size="14" width="2" />
            <v-icon v-else-if="addedToList" icon="mdi-check" size="16" />
            <v-icon v-else :icon="isLf ? 'mdi-heart-plus' : 'mdi-cards-playing-outline'" size="16" />
            {{ addedToList ? t('announce.addedToList') : (isLf ? t('announce.addToWishList') : t('announce.addToTradeList')) }}
          </button>
          <button class="btn-edit" @click="handleEdit">
            <v-icon icon="mdi-pencil-outline" size="16" />
            {{ t('announce.edit') }}
          </button>
          <button class="btn-sold" :disabled="updating" @click="handleMarkSold">
            <v-progress-circular v-if="updating" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-check-circle-outline" size="16" />
            {{ isLf ? t('announce.markFound') : t('announce.markSold') }}
          </button>
          <!-- Last, and pushed apart from the rest: the only one of these that
               cannot be undone. It used to lead the row. -->
          <button class="btn-del" :disabled="deleting" @click="handleDelete">
            <v-progress-circular v-if="deleting" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-delete-outline" size="16" />
            {{ t('announce.delete') }}
          </button>
        </template>
        <template v-else>
          <!-- No seller account behind this one, so there is nobody to propose a
               trade to on-site. The author is reachable where they posted. -->
          <a
            v-if="fromCommunity && discordUrl"
            class="btn-contact"
            :href="discordUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <v-icon icon="mdi-discord" size="17" />
            {{ t('announce.replyOnDiscord') }}
          </a>
          <button v-else-if="currentUserId && !fromCommunity" class="btn-contact" @click="handlePropose">
            <v-icon icon="mdi-handshake-outline" size="17" />
            {{ t('announce.contactSeller') }}
          </button>
          <!-- Signed out: the announce is readable, the seller is not reachable.
               Say which of those it is, rather than ending the dialog on a dead
               end with no action in it at all. -->
          <button v-else-if="!fromCommunity" class="btn-contact" @click="handleLoginToContact">
            <v-icon icon="mdi-login" size="17" />
            {{ t('announce.loginToContact') }}
          </button>
        </template>
      </div>

        </div><!-- /.dlg -->
      </div><!-- /.detail-pane -->
    </div><!-- /.shell -->
  </v-dialog>

  <!-- Headless AddCard, opens when user clicks "Add to trade/wish list".
       LF posts add to the wish list (see button above); sell posts add to
       the trade list. -->
  <AddCard ref="addCardRef" :mode="isLf ? 'wish' : 'trade'" :headless="true" @added="onCardAdded" />
</template>

<style scoped>
/* ── Two-pane shell ───────────────────────────────── */
/* The board's own token names, shared with the announce card and the form
   that made this post. */
.shell {
  --an-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --an-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --an-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --an-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);

  /* Discord's blurple and the rating amber, each with a value per theme.
     Both were single fixed hexes written against the dark page: as text on a
     tint of themselves the link measured 3.53:1 on light and 3.64 on dark
     against the 4.5 its size needs, and the star measured 1.77:1 on light
     while reading 7.24 on dark. Same failure the banlist badge had. */
  --an-discord: #4752C4;
  --an-star: #92400E;
  --an-danger: #B91C1C;

  display: flex;
  flex-direction: row;
  background: var(--c-bg);
  border-radius: 20px;
  overflow: hidden;
  max-height: 92vh;
  width: 100%;
}
html.dark .shell {
  --an-discord: #8C9EFF;
  --an-star: #F59E0B;
  --an-danger: #F87171;
}

/* The colour of the post, set once and read by the eyebrow, the price, the
   focus rings and the action that closes the deal — the same device the create
   dialog uses, so the form you posted in and the page you land on afterwards
   are the same colour. */
.dlg { --an-kind: var(--c-trade); }
.dlg[data-kind="want"] { --an-kind: var(--c-accent); }
.chat-pane {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--c-border);
}
.detail-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.dlg {
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
  overflow: hidden;
  height: 100%;
  min-height: 0;
}

/* ── Split layout: photo beside the listing ───────────
   Used when no chat pane is present, which is every announce posted from
   Discord (no seller account, so no thread) and every listing seen signed out.
   The dialog is the same 920px either way; stacking simply spent all of it on
   the photo and pushed the title, the want list and the reply button out of
   sight. Desktop only — below the breakpoint there is no width to split. */
@media (min-width: 860px) {
  .dlg--split {
    display: grid;
    /* The photo gets the smaller share: it is the thing a reader recognises at
       a glance, and the text is the thing they have to actually read. */
    grid-template-columns: 44% minmax(0, 1fr);
    /* Three rows now: the header spans both columns, because the title and the
       close button belong to the announce rather than to either column. The
       last row takes the slack, so the footer can sit at the top of it. */
    grid-template-rows: auto auto minmax(0, 1fr);
    /* Content decides the height, not the viewport. .dlg is height:100% for the
       stacked layout, where the gallery sits above a body that scrolls; here
       that inherits its way up to the shell's 92vh cap, and a short listing
       opens as a full-height window mostly made of nothing. */
    height: auto;
  }
  .dlg--split .an-head { grid-column: 1 / -1; grid-row: 1; }
  .dlg--split .gallery {
    grid-column: 1;
    grid-row: 2 / -1;
    /* A stated box, so the photo is fitted into the column rather than setting
       the height of the dialog. Phone photos of a card are tall — the one this
       was built against is 764x1700, which drew a 900px frame beside 240px of
       text. Taller than 4:5 is letterboxed; `contain` means never cropped.
       The row still grows past this when the listing itself is longer. */
    aspect-ratio: 4 / 5;
    height: auto;
    border-right: 1px solid var(--c-border);
  }
  /* Scrolls only when a listing really is longer than the photo is tall, and
     scrolls by itself rather than taking the whole dialog with it. */
  .dlg--split .dlg-body { grid-column: 2; grid-row: 2; min-height: 0; }
  /* Directly under the listing rather than pinned to the floor of the column.
     A photograph is taller than three lines of description, so the pinned
     version left the button stranded a hundred and fifty pixels below the last
     thing it referred to, with a rule drawn across the gap. The slack belongs
     at the bottom of the column, not between the text and its action. */
  .dlg--split .dlg-foot { grid-column: 2; grid-row: 3; align-self: start; }
}

/* ── Mobile Details / Chat toggle ─────────────────── */
.mtabs { display: none; }
.mtab {
  flex: 1;
  padding: 12px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.mtab--active {
  color: var(--c-trade);
  border-bottom-color: var(--c-trade);
}

/* Mobile: stack into one toggled pane */
@media (max-width: 859px) {
  .shell { flex-direction: column; border-radius: 20px 20px 0 0; }
  .chat-pane { width: auto; flex: 1; border-right: none; }
  .detail-pane { flex: 1; }
  .mtabs {
    display: flex;
    flex-shrink: 0;
    background: var(--c-surface);
    border-bottom: 1px solid var(--c-border);
  }
  .pane--hidden-mobile { display: none !important; }
}

/* ── Gallery ──────────────────────────────────────── */
.gallery {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #0a0614;
  overflow: hidden;
  flex-shrink: 0;
}
.gallery__img {
  width: 100%; height: 100%;
  object-fit: contain;
}
.gallery__empty {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2);
}
/* Archetype artwork standing in for a photo. `contain` because the elected
   card's art box is roughly square and the gallery is wide — cropping it to
   fill would cut the subject. */
.gallery__art {
  width: 100%; height: 100%;
  object-fit: contain;
}

/* Nav arrows */
.gallery__arrow {
  position: absolute; top: 50%; transform: translateY(-50%);
  width: 36px; height: 36px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; backdrop-filter: blur(6px);
  transition: background 0.15s ease;
}
.gallery__arrow:hover { background: rgba(0,0,0,0.8); }
.gallery__arrow--left  { left: 10px; }
.gallery__arrow--right { right: 10px; }

/* Dot nav */
.gallery__dots {
  position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
  display: flex; gap: 5px;
}
.gallery__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: rgba(255,255,255,0.35); cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.gallery__dot--active { background: #fff; transform: scale(1.25); }


.gallery__count {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 99px;
  background: rgba(0,0,0,0.55); color: white;
  font-size: 10px; font-weight: 700;
  backdrop-filter: blur(6px);
}

/* ── Slim header (Looking For with no gallery) ─────── */
/* ── Header ───────────────────────────────────────── */
.an-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 18px 16px;
  background: var(--an-panel);
  border-bottom: 1px solid var(--an-line);
  flex-shrink: 0;
}
.an-head__meta {
  display: flex;
  align-items: center;
  gap: 9px;
}
/* Says the kind in words, in the kind's colour. The card on the board says
   "LF" because a badge on a 150px tile has room for an identifier and not a
   phrase; a dialog has the room, and these are the same two words the create
   form offers. */
.an-head__eyebrow {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-on-accent);
  background: var(--an-kind);
  border-radius: 999px;
  padding: 3px 9px;
}
.an-head__own {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700;
  color: var(--c-muted);
}
.an-head__time {
  margin-left: auto;
  font-size: 11px; font-weight: 600; color: var(--c-muted);
  white-space: nowrap;
}
.an-head__close {
  width: 30px; height: 30px; border-radius: 50%;
  margin-right: -6px;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.an-head__close:hover { background: var(--c-surface-2); color: var(--c-text); }
.an-head__close:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }

/* The one thing the reader came for, set like it. It was 17px in the body,
   under an empty bar and smaller than the button at the far end of the dialog. */
.an-head__title {
  font-family: "Space Grotesk", "Manrope", system-ui, sans-serif;
  font-size: clamp(1.15rem, 2.2vw, 1.4rem);
  font-weight: 700;
  line-height: 1.18;
  letter-spacing: -0.02em;
  color: var(--c-text);
  margin: 0;
  text-wrap: balance;
}
/* The commercial fact, off the photograph and next to the name of the thing. */
.an-head__price {
  margin: 2px 0 0;
  font-size: 1.15rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.015em;
  color: var(--an-kind);
}
.an-head__price-label {
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
  margin-right: 7px;
}

/* ── Body ─────────────────────────────────────────── */
.dlg-body {
  padding: 18px 18px 4px;
  display: flex; flex-direction: column; gap: 14px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--c-border) transparent;
}
.dlg-body::-webkit-scrollbar { width: 4px; }
.dlg-body::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 99px; }

.info-desc {
  font-size: 13.5px; color: var(--c-muted);
  line-height: 1.6; margin: 0; white-space: pre-wrap;
}
.detail-archetype {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-accent);
}
/* ── Want list (Looking For posts) ─────────────────── */
.want-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.want-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 9px;
  background: var(--an-panel);
  border: 1px solid var(--an-line-soft);
}
.want-thumb {
  width: 22px;
  height: 32px;
  object-fit: cover;
  border-radius: 3px;
  flex-shrink: 0;
}
/* An entry the resolver could not pin to a card is still a real want, so it
   gets a neutral marker rather than being hidden. */
.want-thumb--none {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--c-surface);
  border: 1px dashed var(--c-border);
  color: var(--c-muted);
}
.want-qty { font-size: 11px; font-weight: 800; color: var(--c-muted); flex-shrink: 0; }
.want-name { font-size: 12.5px; color: var(--c-text); }

/* Elected card artwork for the archetype. Hidden outright if it fails to load
   (a few of the newest cards have no cropped art), never replaced by a
   placeholder. */
.detail-archetype__art {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--c-accent) 45%, transparent);
}
/* ── Expiry notice (owner only) ───────────────────── */
.expiry {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 11px;
  background: var(--c-surface-2);
  color: var(--c-muted);
  font-size: 12.5px;
  font-weight: 600;
}
.expiry__text { flex: 1; min-width: 0; line-height: 1.4; }
/* Amber on an amber tint, matching the seller-rating chip in this same file —
   and, like it, one value per theme rather than one written for the dark page. */
.expiry--soon {
  background: color-mix(in srgb, var(--an-star) 10%, transparent);
  color: var(--an-star);
}
/* Expired is dormant, not broken, so it stays neutral instead of going red. */
.expiry--expired {
  background: color-mix(in srgb, var(--c-text) 8%, transparent);
  color: var(--c-text);
}
.btn-renew {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: 9px;
  background: var(--c-trade);
  color: var(--c-on-accent);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.btn-renew:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }
.btn-renew:hover { opacity: 0.88; }
.btn-renew:disabled { opacity: 0.5; pointer-events: none; }

.divider { height: 1px; background: var(--an-line-soft); }

/* Discord source link */
.discord-link {
  display: inline-flex; align-items: center; gap: 7px;
  align-self: flex-start;
  min-height: 32px;
  padding: 0 13px; border-radius: 10px;
  background: color-mix(in srgb, var(--an-discord) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--an-discord) 28%, transparent);
  color: var(--an-discord); font-size: 12.5px; font-weight: 700;
  text-decoration: none;
  transition: background 0.15s ease;
}
.discord-link:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }
.discord-link:hover { background: color-mix(in srgb, var(--an-discord) 16%, transparent); }
.discord-link__logo {
  width: 20px; height: 20px; border-radius: 50%;
  object-fit: cover; flex-shrink: 0;
}
.discord-link__label { line-height: 1; }
.discord-link__ext { opacity: 0.7; }

/* ── Seller ───────────────────────────────────────── */
.seller {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border-radius: 14px;
  background: var(--an-panel);
  border: 1px solid var(--an-line);
  box-shadow: var(--an-lit);
  margin-bottom: 4px;
  transition: border-color 0.15s ease;
}
.seller:hover { border-color: color-mix(in srgb, var(--an-kind) 45%, transparent); }
.seller:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }
.seller__avatar {
  width: 44px; height: 44px; border-radius: 50%;
  object-fit: cover; border: 2px solid var(--c-border); flex-shrink: 0;
}
.seller__avatar--letter {
  display: flex; align-items: center; justify-content: center;
  background: var(--c-surface-2); color: var(--c-text);
  font-size: 16px; font-weight: 800;
}
.seller__info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.seller__label { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.seller__name  { font-size: 14px; font-weight: 700; color: var(--c-text); }
.seller__loc   { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--c-muted); }
.seller__rating {
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 9px;
  background: color-mix(in srgb, var(--an-star) 10%, transparent);
  font-size: 13px; font-weight: 800; color: var(--an-star);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

/* ── Footer ───────────────────────────────────────── */
.dlg-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 18px;
  background: var(--an-panel);
  border-top: 1px solid var(--an-line);
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* Ghost at rest, which is what DESIGN.md specifies for a destructive action,
   and it is the right weight for one: an owner deletes a listing far less
   often than they edit or close it. Filled, it also measured 2.96:1 in the
   light theme — red text on a tint of the same red, written once against the
   dark page. The red is a token per theme now, and it only appears on hover,
   where the intent is already clear. */
.btn-del {
  display: flex; align-items: center; gap: 6px;
  margin-left: auto;
  min-height: 38px;
  padding: 0 14px; border-radius: 11px;
  background: transparent;
  color: var(--c-muted);
  font-family: inherit;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.btn-del:hover:not(:disabled) {
  background: color-mix(in srgb, var(--an-danger) 10%, transparent);
  color: var(--an-danger);
}
.btn-del:focus-visible { outline: 2px solid var(--an-danger); outline-offset: 2px; }
.btn-del:disabled { opacity: 0.4; pointer-events: none; }

.btn-edit {
  display: flex; align-items: center; gap: 6px;
  min-height: 38px;
  padding: 0 14px; border-radius: 11px;
  font-family: inherit;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-edit:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
.btn-edit:hover { background: color-mix(in srgb, var(--c-trade) 18%, transparent); }

.btn-sold {
  display: flex; align-items: center; gap: 6px;
  min-height: 38px;
  padding: 0 14px; border-radius: 11px;
  font-family: inherit;
  background: var(--c-surface-2); color: var(--c-text);
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-sold:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }
.btn-sold:hover { background: var(--c-border); }
.btn-sold:disabled { opacity: 0.4; pointer-events: none; }

/* This button already changes what it says with the kind of the post — "Add to
   trade pile" on something being sold, "Add to wishlist" on something being
   hunted — so it changes colour with it too, and amethyst-for-have,
   pink-for-want does the saying. It was a green found nowhere else in this
   system, and at 12% of itself it measured 1.62:1 on the light theme. */
.btn-tradelist {
  display: flex; align-items: center; gap: 6px;
  min-height: 38px;
  padding: 0 14px; border-radius: 11px;
  /* 6%, not 12%. Text on a tint of its own hue spends its own contrast: at
     12% the pink of a wishlist button measured 4.17:1 on the light theme,
     against the 4.5 that size needs. The border carries the shape instead, so
     the chip still reads as one. */
  background: color-mix(in srgb, var(--an-kind) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--an-kind) 34%, transparent);
  color: var(--an-kind);
  font-family: inherit;
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
  white-space: nowrap;
}
.btn-tradelist:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 2px; }
.btn-tradelist:hover { background: color-mix(in srgb, var(--an-kind) 12%, transparent); }
.btn-tradelist:disabled { opacity: 0.5; pointer-events: none; }
.btn-tradelist--done {
  background: var(--c-surface-2);
  color: var(--c-muted);
}

/* ── Card link section ────────────────────────────── */
.card-link-section {
  position: relative;
}

/* "Link a card" ghost button */
.btn-link-card {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 9px;
  border: 1.5px dashed var(--c-border);
  background: transparent;
  color: var(--c-muted); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: border-color 0.15s, color 0.15s;
}
.btn-link-card:hover { border-color: var(--c-trade); color: var(--c-trade); }

/* Linked card chip (read-only) */
.card-linked-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border-radius: 9px;
  background: color-mix(in srgb, var(--c-trade) 10%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--c-trade) 30%, transparent);
  color: var(--c-trade); font-size: 12px; font-weight: 600;
}
.card-linked-chip__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }

/* Expanded picker */
.card-link-picker { display: flex; flex-direction: column; gap: 6px; }
.card-link-input-wrap {
  position: relative; display: flex; align-items: center;
}
.card-link-icon {
  position: absolute; left: 10px; color: var(--c-muted); pointer-events: none;
}
.card-link-input {
  width: 100%;
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 10px;
  padding: 8px 60px 8px 30px;
  font-size: 13px; color: var(--c-text); outline: none;
  transition: border-color 0.15s;
}
.card-link-input:focus { border-color: var(--c-trade); }
.card-link-input::placeholder { color: var(--c-muted); opacity: 0.5; }
.card-link-spinner { position: absolute; right: 34px; color: var(--c-muted); }
.card-link-cancel {
  position: absolute; right: 8px;
  width: 22px; height: 22px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted); cursor: pointer;
  transition: background 0.12s;
}
.card-link-cancel:hover { background: var(--c-surface-2); }

/* Dropdown */
.card-link-dropdown {
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  border-radius: 12px; overflow: hidden;
  box-shadow: 0 6px 24px rgba(0,0,0,0.16);
  max-height: 220px; overflow-y: auto;
}
.card-link-result {
  display: flex; align-items: center; gap: 9px;
  width: 100%; padding: 8px 11px; cursor: pointer; text-align: left;
  transition: background 0.1s;
  border-bottom: 1px solid var(--c-border);
}
.card-link-result:last-child { border-bottom: none; }
.card-link-result:hover { background: var(--c-surface-2); }
.card-link-result:disabled { opacity: 0.5; pointer-events: none; }
.card-link-result__img {
  width: 28px; height: 40px; object-fit: cover;
  border-radius: 3px; border: 1px solid var(--c-border); flex-shrink: 0;
}
.card-link-result__info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.card-link-result__name {
  font-size: 12.5px; font-weight: 600; color: var(--c-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card-link-result__sub { font-size: 11px; color: var(--c-muted); }

.card-link-err { font-size: 11.5px; font-weight: 600; color: var(--c-accent); }



/* Full width on a phone, where it is a thumb target and the only thing on the
   row. On a desktop that width made a login prompt the largest object in the
   dialog — larger than the name of the thing being announced, which is what
   the reader actually opened it for. */
.btn-contact {
  display: flex; align-items: center; gap: 7px;
  min-height: 44px;
  padding: 0 22px; border-radius: 12px;
  width: 100%;  justify-content: center;
  background: var(--an-kind); color: var(--c-on-accent);
  font-family: inherit;
  font-size: 14px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease;
}
@media (min-width: 560px) {
  .btn-contact { width: auto; margin-left: auto; }
}
.btn-contact:focus-visible { outline: 2px solid var(--an-kind); outline-offset: 3px; }
.btn-contact:hover { opacity: 0.88; }
</style>
