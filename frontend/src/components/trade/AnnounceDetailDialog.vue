<script setup>
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { timeAgo } from "@/lib/notifications";
import { deleteAnnounce, updateAnnounce } from "@/lib/announces";
import { isLookingFor } from "@/lib/announceKind";
import { getClient } from "@/lib/supabaseClient";
import { searchById, searchCardByName, searchCardBySetCode } from "@/api";
import AddCard from "@/components/library/AddCard.vue";
import AnnounceChatPanel from "@/components/trade/AnnounceChatPanel.vue";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  announce:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});
const emit = defineEmits(["update:modelValue", "deleted", "updated", "propose", "edit"]);
const { t } = useI18n();
const route = useRoute();

const deleting      = ref(false);
const updating      = ref(false);
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

const isOwner = computed(() => props.announce?.seller === props.currentUserId);
const isLf = computed(() => isLookingFor(props.announce));

// LF posts may carry no budget at all, in which case there is nothing to show.
const formattedPrice = computed(() => {
  const p = props.announce?.price;
  if (p === null || p === undefined || p === "") return "";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: props.announce.currency || "EUR" }).format(p);
});

const sellerName    = computed(() => props.announce?.Trader?.Name || props.announce?.Trader?.name || t("announces.unknownSeller"));
const sellerAvatar  = computed(() => props.announce?.Trader?.avatar_url ?? null);
const sellerInitial = computed(() => (sellerName.value || "?")[0].toUpperCase());
const location = computed(() => {
  const city    = props.announce?.Trader?.City    || props.announce?.Trader?.city;
  const country = props.announce?.Trader?.Country || props.announce?.Trader?.country;
  if (city && country) return `${city}, ${country}`;
  return country || null;
});
const rating = computed(() => props.announce?.Trader?.avg_rating ?? null);
const images = computed(() => props.announce?.images ?? []);
const discordUrl  = computed(() => props.announce?.discord_url ?? null);
const guildName   = computed(() => props.announce?.discord_guild_name ?? null);
const guildIcon   = computed(() => props.announce?.discord_guild_icon ?? null);

function close() { emit("update:modelValue", false); }

async function handleDelete() {
  if (!confirm(t("announce.deleteConfirm"))) return;
  deleting.value = true;
  try { await deleteAnnounce(props.announce.id); emit("deleted", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to delete"); }
  finally { deleting.value = false; }
}

async function handleMarkSold() {
  updating.value = true;
  try { await updateAnnounce(props.announce.id, { status: "sold" }); emit("updated", props.announce.id); close(); }
  catch (err) { alert(err.message ?? "Failed to update"); }
  finally { updating.value = false; }
}

function handleEdit() { emit("edit", props.announce); close(); }

function handlePropose() { emit("propose", props.announce.seller); close(); }

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
      <div v-if="currentUserId" class="mtabs">
        <button class="mtab" :class="{ 'mtab--active': mobileTab === 'details' }" @click="mobileTab = 'details'">
          {{ t('announceChat.tabDetails') }}
        </button>
        <button class="mtab" :class="{ 'mtab--active': mobileTab === 'chat' }" @click="mobileTab = 'chat'">
          {{ t('announceChat.tabChat') }}
        </button>
      </div>

      <!-- Chat pane (left on desktop; only for logged-in users) -->
      <div
        v-if="currentUserId"
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
        <div class="dlg">

      <!-- Image gallery (full bleed at top) -->
      <div class="gallery">
        <img
          v-if="images.length"
          :src="images[imgIdx].url"
          :alt="announce.title"
          class="gallery__img"
        />
        <div v-else class="gallery__empty">
          <v-icon icon="mdi-image-off-outline" size="48" style="color: var(--c-border)" />
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

        <!-- Price overlay -->
        <div v-if="formattedPrice" class="gallery__price">
          <span v-if="isLf">{{ t('announce.budget') }}: </span>{{ formattedPrice }}
        </div>

        <!-- Close button -->
        <button class="gallery__close" @click="close">
          <v-icon icon="mdi-close" size="18" />
        </button>

        <!-- Own badge -->
        <div v-if="isOwner" class="gallery__own">
          <v-icon icon="mdi-account-check" size="12" />
          {{ t("announces.yourAnnounce") }}
        </div>

        <!-- Photo count -->
        <div v-if="images.length > 1" class="gallery__count">
          <v-icon icon="mdi-image-multiple-outline" size="12" />
          {{ imgIdx + 1 }} / {{ images.length }}
        </div>
      </div>

      <!-- Scrollable content -->
      <div class="dlg-body">

        <!-- Title + time -->
        <div class="info-row">
          <h2 class="info-title">
            <span v-if="isLf" class="lf-badge">{{ t('announce.lfBadge') }}</span>
            {{ announce.title }}
          </h2>
          <span class="info-time">{{ timeAgo(announce.created_at, t) }}</span>
        </div>

        <!-- Description -->
        <p v-if="announce.description" class="info-desc">{{ announce.description }}</p>

        <!-- Archetype (Looking For posts only) -->
        <p v-if="isLf && announce.archetype" class="detail-archetype">
          <v-icon icon="mdi-cards-outline" size="14" />
          {{ announce.archetype }}<template v-if="announce.want_detail"> · {{ announce.want_detail }}</template>
        </p>

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

        <!-- Card link section (owner only) -->
        <div v-if="isOwner" class="card-link-section">

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
        <div class="seller">
          <img v-if="sellerAvatar" :src="sellerAvatar" class="seller__avatar" :alt="sellerName" />
          <div v-else class="seller__avatar seller__avatar--letter">{{ sellerInitial }}</div>
          <div class="seller__info">
            <span class="seller__label">{{ t('announce.postedBy') }}</span>
            <span class="seller__name">{{ sellerName }}</span>
            <span v-if="location" class="seller__loc">
              <v-icon icon="mdi-map-marker-outline" size="11" />
              {{ location }}
            </span>
          </div>
          <div v-if="rating" class="seller__rating">
            <v-icon icon="mdi-star" size="13" style="color: #f59e0b" />
            <span>{{ Number(rating).toFixed(1) }}</span>
          </div>
        </div>

      </div>

      <!-- Actions footer -->
      <div class="dlg-foot">
        <template v-if="isOwner">
          <button class="btn-del" :disabled="deleting" @click="handleDelete">
            <v-progress-circular v-if="deleting" indeterminate size="14" width="2" />
            <v-icon v-else icon="mdi-delete-outline" size="16" />
            {{ t('announce.delete') }}
          </button>
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
            {{ t('announce.markSold') }}
          </button>
        </template>
        <template v-else>
          <button v-if="currentUserId" class="btn-contact" @click="handlePropose">
            <v-icon icon="mdi-handshake-outline" size="17" />
            {{ t('announce.contactSeller') }}
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
.shell {
  display: flex;
  flex-direction: row;
  background: var(--c-bg);
  border-radius: 20px;
  overflow: hidden;
  max-height: 92vh;
  width: 100%;
}
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

/* Overlays */
.gallery__price {
  position: absolute; bottom: 0; left: 0;
  padding: 36px 14px 12px;
  background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%);
  color: #fff; font-size: 22px; font-weight: 900; letter-spacing: -0.02em;
  text-shadow: 0 1px 6px rgba(0,0,0,0.5);
}
.gallery__close {
  position: absolute; top: 10px; right: 10px;
  width: 32px; height: 32px; border-radius: 50%;
  background: rgba(0,0,0,0.55); color: white;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; backdrop-filter: blur(6px);
  transition: background 0.15s ease;
}
.gallery__close:hover { background: rgba(0,0,0,0.8); }

.gallery__own {
  position: absolute; top: 10px; left: 10px;
  display: flex; align-items: center; gap: 4px;
  padding: 4px 9px; border-radius: 99px;
  background: var(--c-trade); color: #fff;
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
  backdrop-filter: blur(4px);
}
.gallery__count {
  position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 4px;
  padding: 3px 9px; border-radius: 99px;
  background: rgba(0,0,0,0.55); color: white;
  font-size: 10px; font-weight: 700;
  backdrop-filter: blur(6px);
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

.info-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.info-title {
  font-size: 17px; font-weight: 800; color: var(--c-text);
  line-height: 1.3; margin: 0; flex: 1;
}
.info-time {
  font-size: 11px; font-weight: 600; color: var(--c-muted);
  white-space: nowrap; padding-top: 3px;
}
.info-desc {
  font-size: 13.5px; color: var(--c-muted);
  line-height: 1.6; margin: 0; white-space: pre-wrap;
}
.lf-badge {
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
.detail-archetype {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-mutual);
}
.divider { height: 1px; background: var(--c-border); }

/* Discord source link */
.discord-link {
  display: inline-flex; align-items: center; gap: 7px;
  align-self: flex-start;
  padding: 7px 13px; border-radius: 10px;
  background: color-mix(in srgb, #5865F2 14%, transparent);
  color: #5865F2; font-size: 12.5px; font-weight: 700;
  text-decoration: none;
  transition: background 0.15s ease;
}
.discord-link:hover { background: color-mix(in srgb, #5865F2 24%, transparent); }
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
  background: var(--c-surface);
  border: 1.5px solid var(--c-border);
  margin-bottom: 4px;
}
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
  background: color-mix(in srgb, #f59e0b 12%, transparent);
  font-size: 13px; font-weight: 800; color: #f59e0b;
  flex-shrink: 0;
}

/* ── Footer ───────────────────────────────────────── */
.dlg-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px;
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  flex-shrink: 0;
}

.btn-del {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-del:hover { background: color-mix(in srgb, #ef4444 22%, transparent); }
.btn-del:disabled { opacity: 0.4; pointer-events: none; }

.btn-edit {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px; margin-left: auto;
  background: color-mix(in srgb, var(--c-trade) 12%, transparent);
  color: var(--c-trade); font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-edit:hover { background: color-mix(in srgb, var(--c-trade) 22%, transparent); }

.btn-sold {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: var(--c-surface-2); color: var(--c-text);
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
}
.btn-sold:hover { background: var(--c-border); }
.btn-sold:disabled { opacity: 0.4; pointer-events: none; }

.btn-tradelist {
  display: flex; align-items: center; gap: 6px;
  padding: 9px 15px; border-radius: 11px;
  background: color-mix(in srgb, #22c55e 12%, transparent);
  color: #22c55e; font-size: 13px; font-weight: 700;
  cursor: pointer; transition: background 0.15s ease;
  white-space: nowrap;
}
.btn-tradelist:hover { background: color-mix(in srgb, #22c55e 22%, transparent); }
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

.card-link-err { font-size: 11px; color: #ef4444; }



.btn-contact {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 22px; border-radius: 12px;
  width: 100%;  justify-content: center;
  background: var(--c-trade); color: #fff;
  font-size: 14px; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s ease, transform 0.15s ease;
}
.btn-contact:hover { opacity: 0.88; transform: translateY(-1px); }
</style>
