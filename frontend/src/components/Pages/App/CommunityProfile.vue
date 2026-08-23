<script setup>
/**
 * One place, and how to get to it.
 *
 * Of the 4,451 rows in the directory, 4,450 were imported from Konami's
 * Official Tournament Store list, one is claimed, and two have a bio, an avatar
 * or a banner. This page was built as a social profile for all of them: a 188px
 * identity field carrying a 300px ghosted first initial, an 88px avatar box
 * with the same initial in it again, a follower tally at the top of a page with
 * two follows in the whole database, and a two-column body whose left column
 * held an empty bio. The only thing in it a reader could act on was a map
 * thumbnail captioned with the town.
 *
 * A store page is a doorway, not a profile, so the page now opens on the plate:
 * the name, the address printed in full, the map beside it, and the row of
 * things you can actually do — Directions, Call, and whatever links the shop
 * has. The address is new. Every seeded row carries the street, the postcode
 * and the shop's public number in the file it was seeded from, and the seeder
 * dropped all of it because there was nowhere to put it; the page's own meta
 * description has been promising "address, Discord and listings" the whole
 * time. 4,343 of these pages can now print one.
 *
 * Under the plate the page splits in two, and which half you get is the point.
 * A page nobody has claimed says so plainly — it is a directory record, and it
 * says where the record came from — because 4,450 near-empty pages should read
 * as a listing waiting for its owner, not as a shop that could not be bothered.
 * A claimed page drops the record line and gives the shop's own words instead:
 * the bio, the links, the events. Claiming is the switch between the two, which
 * is the one thing the old claim CTA, stranded at the bottom of an empty
 * column, never managed to say.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { fetchBySlug, updateCommunity, fetchMyCommunities, fetchNearbyPlaces } from "@/lib/community";
import { kindsOf, KINDS, TYPE_KEYS } from "@/lib/communityKinds";
import { validateImageFile, uploadCommunityMedia } from "@/lib/communityMedia";
import { COUNTRIES } from "@/lib/countries";
import { addressLines, telHref, directionsUrl, postalAddressLd } from "@/lib/postalAddress";
import { requestPosition, distanceKm, formatDistance } from "@/lib/near";
import { countCommunityAnnounces } from "@/lib/announces";
import { getCurrentSession, onAuthChange, signInWithDiscord } from "@/lib/supabaseClient";
import { LINK_PLATFORMS, MAX_LINKS, linkHref, isValidLink } from "@/lib/communityLinks";
import ClaimCommunityDialog from "@/components/community/ClaimCommunityDialog.vue";
import ReportCommunityDialog from "@/components/community/ReportCommunityDialog.vue";
import PlatformIcon from "@/components/community/PlatformIcon.vue";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
import FollowButton from "@/components/community/FollowButton.vue";
import CommunityEvents from "@/components/community/CommunityEvents.vue";
import CommunityGiveUp from "@/components/community/CommunityGiveUp.vue";
import { ldScript } from "@/lib/jsonLd";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();

const community      = ref(null);
const loading        = ref(true);
const notFound       = ref(false);
const currentUserId  = ref(null);

const KIND_KEYS = { store: "kindStore", discord: "kindDiscord", group: "kindGroup" };

// Stale-response guard: only the most recently issued load() may commit its
// result, so a slower earlier fetch (e.g. after a rapid slug change) can't
// clobber a newer one.
let reqId = 0;

async function load() {
  const myId = ++reqId;
  loading.value   = true;
  notFound.value  = false;
  community.value = null;
  try {
    const data = await fetchBySlug(route.params.slug);
    if (myId !== reqId) return;
    community.value = data;
    notFound.value  = !data;
    if (data) { loadListingCount(data.id); measureDistance(data); loadNearby(data); }
  } catch (e) {
    if (myId !== reqId) return;
    console.error("CommunityProfile: fetchBySlug failed", e);
    community.value = null;
    notFound.value  = true;
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

// The community this viewer already owns, if any. An account can own one, so
// on an unclaimed profile this decides between offering the claim and
// explaining why it is not on offer. Cleared on sign-out.
const myOther = ref(null);

async function loadMine() {
  if (!currentUserId.value) { myOther.value = null; return; }
  try {
    const mine = await fetchMyCommunities();
    myOther.value = mine.find((c) => c.slug !== route.params.slug) ?? null;
  } catch (e) {
    console.error("CommunityProfile: fetchMyCommunities failed", e);
  }
}
watch(currentUserId, loadMine, { immediate: true });

// Deleted, and there is no page left to stand on. Released, and the page is
// still here as an unclaimed directory entry, so reloading shows it as the
// public now sees it.
function onGaveUp(mode) {
  if (mode === "delete") router.push({ name: "community", params: localeParams.value });
  else load();
}

let unsub = null;

onMounted(async () => {
  const session = await getCurrentSession();
  currentUserId.value = session?.user?.id ?? null;
  unsub = onAuthChange((auth) => {
    currentUserId.value = auth?.user?.id ?? null;
  });
  await load();

  if (route.query.edit === "1" && isOwner.value) startEdit();

  const claimResult = route.query.claim;
  if (claimResult === "success") {
    finalizeClaim();
  } else if (claimResult === "cancel") {
    claimOpen.value = true; // dialog resumes at the subscribe step (identity kept)
  }
});

onBeforeUnmount(() => {
  ++finalizeId;
  unsub?.();
});

// The page is reused across slugs (e.g. a related-profile link), so local UI
// state must be reset here rather than relying on a fresh component mount.
watch(() => route.params.slug, () => {
  editing.value = false;
  ++finalizeId;            // cancel any in-flight finalize poll for the old slug
  finalizing.value = false;
  community.value = null;
  notFound.value  = false;
  listingCount.value = 0;
  awayKm.value = null;
  nearby.value = [];
  load();
});

const isOwner = computed(() => !!(community.value?.owner && community.value.owner === currentUserId.value));

// Two registers, and this is the switch. An unclaimed page says what it is —
// a directory record — and offers itself. A claimed page drops all that and
// gives the shop's own words instead.
const listed = computed(() => !!community.value && community.value.owner == null);

// Every seeded row carries the id it was imported under, which is the one thing
// on the page that says where the entry came from and that the shop runs
// sanctioned tournaments. 4,450 of 4,451 rows have it and none of them showed
// it.
const isOts = computed(() => !!community.value?.ots_store_id);

const kindLabel = computed(() => {
  const key = KIND_KEYS[community.value?.kind];
  return key ? t(`community.${key}`) : (community.value?.kind ?? "");
});

// Everything this community is, in the owner's chosen order. The SEO title
// above keeps the primary kind alone: "Store in Geneva" is a title, "Store,
// Discord server and play group in Geneva" is a sentence.
const profileKinds = computed(() => kindsOf(community.value));

// ── Inline edit mode, declared here because the plate reads the working copy ──
// The owner edits the profile in place: `edit` is a working copy seeded from
// the loaded community; the template renders inputs bound to it while
// `editing`. Save commits everything via updateCommunity in one write; cancel
// drops the copy.
const editing = ref(false);
const edit = ref({
  name: "", bio: "", links: [], kinds: [],
  city: "", country: "", avatar_url: null, banner_url: null,
  remote_duel: false,
  // The address, now that there is one. An owner correcting a street the OTS
  // list got wrong is the whole reason these fields are editable rather than
  // read-only imports.
  address: "", postal_code: "", state: "", phone: "",
  // The pin the community already has, carried through untouched so saving a
  // bio does not send the address back to the geocoder. Cleared the moment the
  // town is edited, which is what asks for a fresh lookup — see the watch below.
  lat: null, lng: null,
});

// ── The plate ────────────────────────────────────────────────────────────────
// While editing, everything below reads the working copy, so a corrected street
// or a new town redraws the printed address as it is typed.
const shown = computed(() => (editing.value ? { ...community.value, ...edit.value } : community.value));

// Without a street to head it the block is not an address, it is a place name,
// and two stacked monospace lines reading "Geneva / Switzerland" look like a
// form somebody abandoned. Joined into one line in that case — which is every
// Discord server, and the 108 shops the OTS list has no street for.
const addressBlock = computed(() => {
  const lines = addressLines(shown.value);
  if (String(shown.value?.address ?? "").trim()) return lines;
  return lines.length ? [lines.join(", ")] : [];
});
const phoneLabel   = computed(() => String(shown.value?.phone ?? "").trim() || null);
const phoneLink    = computed(() => telHref(shown.value?.phone));
// A Discord server has a town on file, because the people in it are somewhere,
// and geocoding that town leaves it holding a pin in the middle of Geneva. You
// cannot walk into a Discord server, so the map and the Directions button are
// for the kinds of place that have a door.
const physical = computed(() => profileKinds.value.some((k) => k === "store" || k === "group"));
const mapsLink = computed(() => (physical.value ? directionsUrl(community.value) : null));

// Keyless static map thumbnail (Wikimedia's OSM renderer): a plain retina PNG
// centered on the store, no API key and no tracking script; only the public
// coordinates travel in the URL. The image is centered on the point, so a pin
// overlaid at the panel's center marks the exact spot. Null when the row has no
// coordinates (Discord servers / groups) so the panel is skipped for them.
const mapImgUrl = computed(() => {
  const c = community.value;
  if (!c || !physical.value || c.lat == null || c.lng == null) return null;
  return `https://maps.wikimedia.org/img/osm-intl,15,${c.lat},${c.lng},640x420@2x.png`;
});

// How far the reader is from the door.
//
// Never prompts. A profile page throwing a location permission dialog at
// someone who arrived from a search result is rude, and the address answers
// "where" on its own. But a reader who already granted location — anyone who
// used the directory's Near me — has an answer sitting there for free, so the
// permission is read first and the position only requested when it is already
// granted. Safari has no Permissions API entry for geolocation and throws here,
// which lands in the same place as a refusal: no distance, no prompt.
const awayKm = ref(null);
const awayLabel = computed(() => formatDistance(awayKm.value));

async function measureDistance(c) {
  awayKm.value = null;
  if (!Number.isFinite(c?.lat) || !Number.isFinite(c?.lng)) return;
  if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
  try {
    const status = await navigator.permissions.query({ name: "geolocation" });
    if (status.state !== "granted") return;
    const me = await requestPosition();
    if (community.value?.id !== c.id) return;   // slug changed while we waited
    awayKm.value = distanceKm(me, { lat: c.lat, lng: c.lng });
  } catch {
    // No Permissions API, or the fix never arrived. Either way: no distance.
  }
}

// The other shops within reach, which is what a reader asks next when this one
// is shut. Every profile in the directory was a leaf before this: the only way
// on from a store page was out to Google Maps.
const NEARBY_KM = 40;
const nearby = ref([]);
async function loadNearby(c) {
  nearby.value = [];
  const rows = await fetchNearbyPlaces(c, { km: NEARBY_KM, limit: 6 });
  if (community.value?.id === c.id) nearby.value = rows;
}

// Listings posted by this community. Counted rather than assumed, because the
// link used to be on all 4,451 profiles and led to the unfiltered Trade Center.
const listingCount = ref(0);
async function loadListingCount(id) {
  listingCount.value = await countCommunityAnnounces(id);
}

// Following delivers events, and only a verified community can post one, so on
// every other profile the button promised a notification that could never
// arrive. Same rule the directory card follows.
const followable = computed(() => community.value?.verified === true);

// Display label for a rendered link: a custom "other" label if set, otherwise
// the localized platform name.
function linkLabel(link) {
  if (link.platform === "other" && link.label) return link.label;
  return t(`community.platform_${link.platform}`);
}

const localeParams = computed(() => ({ locale: route.params.locale || "en" }));

// ── SEO ──────────────────────────────────────────────────────────────────
const BASE = "https://0nefor.one";
const canonicalUrl = computed(() => `${BASE}${route.path}`);

const metaTitle = computed(() => {
  const c = community.value;
  if (!c) return "";
  const city = (c.city || "").trim();
  if (!city) return t("community.metaProfileTitleNoCity", { name: c.name, kind: kindLabel.value });
  return t("community.metaProfileTitle", { name: c.name, kind: kindLabel.value, city });
});
const metaDesc = computed(() => {
  const c = community.value;
  if (!c) return "";
  return t("community.metaProfileDesc", { name: c.name, kind: kindLabel.value, city: c.city || "" });
});

// LocalBusiness for physical stores (address/geo when known), Organization
// for Discord servers and groups which have no physical location.
//
// The address used to be addressLocality and addressCountry and nothing else,
// which is a business card with the street torn off — and Google's local
// results want the street and the postcode. Both go out now, along with the
// telephone, on the 4,343 rows that have them.
const jsonLd = computed(() => {
  const c = community.value;
  if (!c) return null;
  const base = { "@context": "https://schema.org", name: c.name, url: canonicalUrl.value };
  if (c.kind === "store") {
    const address = postalAddressLd(c);
    const geo = (c.lat != null && c.lng != null) ? {
      "@type": "GeoCoordinates",
      latitude: c.lat,
      longitude: c.lng,
    } : undefined;
    return {
      ...base,
      "@type": "LocalBusiness",
      ...(address ? { address } : {}),
      ...(geo ? { geo } : {}),
      ...(phoneLabel.value ? { telephone: phoneLabel.value } : {}),
    };
  }
  return { ...base, "@type": "Organization" };
});

// Upcoming events (published from the CommunityEvents child) drive Event JSON-LD.
const upcomingEvents = ref([]);
function onEventsLoaded(list) { upcomingEvents.value = Array.isArray(list) ? list : []; }

const eventsJsonLd = computed(() => {
  const c = community.value;
  if (!c) return [];
  return upcomingEvents.value.slice(0, 25).map((e) => ({
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.starts_at,
    ...(e.ends_at ? { endDate: e.ends_at } : {}),
    eventAttendanceMode: e.is_online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    location: e.is_online
      ? { "@type": "VirtualLocation", ...(e.url ? { url: e.url } : {}) }
      : {
          "@type": "Place",
          name: e.location || c.name,
          ...(postalAddressLd(c) ? { address: postalAddressLd(c) } : {}),
        },
    ...(e.url ? { url: e.url } : {}),
    ...(e.cover_url ? { image: e.cover_url } : {}),
    organizer: { "@type": "Organization", name: c.name, url: canonicalUrl.value },
  }));
});

// ldScript lives in @/lib/jsonLd now, so every page escapes the same way.

// Guarded on community.value so the not-found state gets no title override
// and no JSON-LD script.
useHead(computed(() => {
  if (!community.value) return {};
  return {
    title: metaTitle.value,
    meta: [
      { name: "description", content: metaDesc.value },
      { property: "og:title", content: metaTitle.value },
      { property: "og:description", content: metaDesc.value },
      { name: "twitter:title", content: metaTitle.value },
      { name: "twitter:description", content: metaDesc.value },
    ],
    link: [
      { rel: "canonical", href: canonicalUrl.value },
    ],
    script: [
      ...(jsonLd.value ? [ldScript(jsonLd.value)] : []),
      ...eventsJsonLd.value.map(ldScript),
    ],
  };
}));

// ── Claim / report ─────────────────────────────────────────────────────────
const claimOpen = ref(false);
function openClaim()  { claimOpen.value = true; }

// Following needs an account; Discord OAuth redirects away and returns here.
async function onFollowAuthRequired() {
  try { await signInWithDiscord(); }
  catch (e) { console.error("sign-in failed", e); }
}

const reportOpen = ref(false);
function openReport() { reportOpen.value = true; }
// The dialog already shows its own "report sent" confirmation before
// closing itself; nothing else needs to happen on this page.
function onReported() {}

// ── Inline edit mode ─────────────────────────────────────────────────────────
const savingEdit = ref(false);
const editErr = ref("");
const uploadingAvatar = ref(false);   // used by the image upload task
const uploadingBanner = ref(false);

// A place picks up a Discord server or starts a play group long after its page
// exists, so the set of kinds has to be editable, not just chosen once at
// creation. Same rule as the create form: you cannot be nothing.
function toggleEditKind(k) {
  const list = edit.value.kinds;
  if (!list.includes(k)) edit.value.kinds = [...list, k];
  else if (list.length > 1) edit.value.kinds = list.filter((x) => x !== k);
}

// Local key so v-for rows stay stable across reorder / add / remove (the stored
// links carry no id). Never persisted; sanitizeLinks reads only platform/url/label.
let linkKey = 0;

// An edited town invalidates the pin that came with it. Dropping the
// coordinates is what tells updateCommunity to look the new one up; keeping them
// would leave a community showing a new city and sitting on the old city's map
// for the rest of its life. Keyed on the town and country alone, not the street:
// the geocoder resolves settlements, so a corrected house number would spend a
// lookup to land back on the same pin.
//
// Compared against the address the pin belongs to rather than against the
// previous value, because opening the editor writes the whole working copy at
// once: a watcher reading "the city changed" would fire on that too, and throw
// away the coordinates startEdit had just seeded.
const addressOf = (e) => `${e.city} ${e.country}`;
let pinnedFor = "";
watch(() => addressOf(edit.value), (now) => {
  if (now === pinnedFor) return;
  edit.value.lat = null;
  edit.value.lng = null;
});

function startEdit() {
  const c = community.value;
  if (!c) return;
  edit.value = {
    name: c.name ?? "", bio: c.bio ?? "",
    links: (c.links ?? []).map((l) => ({
      platform: l.platform, url: l.url ?? "", label: l.label ?? "", _k: ++linkKey,
    })),
    kinds: kindsOf(c),
    city: c.city ?? "", country: c.country ?? "",
    address: c.address ?? "", postal_code: c.postal_code ?? "",
    state: c.state ?? "", phone: c.phone ?? "",
    avatar_url: c.avatar_url ?? null, banner_url: c.banner_url ?? null,
    remote_duel: !!c.remote_duel,
    lat: Number.isFinite(c.lat) ? c.lat : null,
    lng: Number.isFinite(c.lng) ? c.lng : null,
  };
  pinnedFor = addressOf(edit.value);
  editErr.value = "";
  editing.value = true;
}

function cancelEdit() { editing.value = false; editErr.value = ""; }

// ── Link editor ──────────────────────────────────────────────────────────────
// Platforms already used (each may appear once, except "other" which repeats for
// arbitrary labeled links). Drives which options a row's picker disables.
const usedPlatforms = computed(() => {
  const set = new Set();
  for (const l of edit.value.links) if (l.platform !== "other") set.add(l.platform);
  return set;
});

function firstFreePlatform() {
  const p = LINK_PLATFORMS.find((p) => !usedPlatforms.value.has(p.id));
  return p ? p.id : "other";
}

function addLink() {
  if (edit.value.links.length >= MAX_LINKS) return;
  edit.value.links.push({ platform: firstFreePlatform(), url: "", label: "", _k: ++linkKey });
}
function removeLink(i) { edit.value.links.splice(i, 1); }

// An option is offered only if it is this row's current value or still unused;
// "other" is always available.
function platformDisabled(row, id) {
  return id !== "other" && id !== row.platform && usedPlatforms.value.has(id);
}

const placeholders = {
  website: "https://your-site.com", instagram: "https://instagram.com/you",
  facebook: "https://facebook.com/you", x: "https://x.com/you",
  tiktok: "https://tiktok.com/@you", youtube: "https://youtube.com/@you",
  discord: "https://discord.gg/invite", whatsapp: "https://wa.me/1555…",
  email: "you@store.com", other: "https://…",
};
function placeholderFor(platform) { return placeholders[platform] ?? "https://…"; }

// Native drag-to-reorder, started from each row's handle (so the url inputs stay
// selectable). dragIndex tracks the row being moved; dropIndex highlights the
// insertion target.
const dragIndex = ref(-1);
const dropIndex = ref(-1);
function onDragStart(i, ev) {
  dragIndex.value = i;
  ev.dataTransfer.effectAllowed = "move";
  // Firefox requires data to be set for a drag to begin.
  ev.dataTransfer.setData("text/plain", String(i));
}
function onDragOver(i) { dropIndex.value = i; }
function onDrop(i) {
  const from = dragIndex.value;
  if (from < 0 || from === i) { onDragEnd(); return; }
  const rows = edit.value.links;
  const [moved] = rows.splice(from, 1);
  rows.splice(i, 0, moved);
  onDragEnd();
}
function onDragEnd() { dragIndex.value = -1; dropIndex.value = -1; }

const editValid = computed(() => {
  const n = edit.value.name.trim();
  if (n.length === 0 || n.length > 120 || edit.value.bio.length > 2000) return false;
  // An empty row is fine (it is dropped on save); a row with a url typed in must
  // be valid (well-formed email / non-blank).
  return edit.value.links.every((l) => !String(l.url ?? "").trim() || isValidLink(l));
});

// Preview sources: while editing, render the working copy so changes show live.
const displayName   = computed(() => editing.value ? edit.value.name       : (community.value?.name ?? ""));
const displayAvatar = computed(() => editing.value ? edit.value.avatar_url  : community.value?.avatar_url);
const displayBanner = computed(() => editing.value ? edit.value.banner_url  : community.value?.banner_url);

async function saveEdit() {
  if (!editValid.value || savingEdit.value || uploadingAvatar.value || uploadingBanner.value) return;
  savingEdit.value = true; editErr.value = "";
  try {
    const patch = {
      name:        edit.value.name.trim(),
      bio:         edit.value.bio.trim(),
      // sanitizeLinks (in updateCommunity) drops the local _k and empty rows.
      links:       edit.value.links,
      kinds:       edit.value.kinds,
      city:        edit.value.city.trim() || null,
      country:     edit.value.country || null,
      address:     edit.value.address.trim() || null,
      postal_code: edit.value.postal_code.trim() || null,
      state:       edit.value.state.trim() || null,
      phone:       edit.value.phone.trim() || null,
      lat:         edit.value.lat,
      lng:         edit.value.lng,
      avatar_url:  edit.value.avatar_url || null,
      banner_url:  edit.value.banner_url || null,
      remote_duel: edit.value.remote_duel,
    };
    const row = await updateCommunity(community.value.id, patch);
    Object.assign(community.value, row);
    editing.value = false;
  } catch (e) {
    editErr.value = e.message ?? "Failed to save.";
  } finally {
    savingEdit.value = false;
  }
}

const avatarInput = ref(null);
const bannerInput = ref(null);

async function onPickImage(kind, ev) {
  const file = ev.target.files?.[0];
  ev.target.value = ""; // allow re-picking the same file
  if (!file) return;
  const check = validateImageFile(file);
  if (!check.ok) {
    editErr.value = check.error === "too_large" ? t("community.imageTooLarge")
      : check.error === "wrong_type" ? t("community.imageWrongType")
      : t("community.uploadFailed");
    return;
  }
  const busy = kind === "avatar" ? uploadingAvatar : uploadingBanner;
  busy.value = true; editErr.value = "";
  try {
    const url = await uploadCommunityMedia(community.value.id, kind, file);
    if (kind === "avatar") edit.value.avatar_url = url;
    else edit.value.banner_url = url;
  } catch (e) {
    editErr.value = t("community.uploadFailed");
  } finally {
    busy.value = false;
  }
}

// After returning from Stripe Checkout with ?claim=success, the subscription
// webhook may not have granted ownership yet (it fires within seconds). Poll the
// row a few times until owner flips, then show the owned state. A finalizeId
// token (same pattern as reqId) cancels the poll on slug change or unmount, and a
// transient fetch error is swallowed so one network blip cannot strand the banner.
const finalizing = ref(false);
let finalizeId = 0;
async function finalizeClaim() {
  const myId = ++finalizeId;
  const slug = route.params.slug;
  finalizing.value = true;
  try {
    for (let i = 0; i < 8; i++) {
      let fresh = null;
      try { fresh = await fetchBySlug(slug); }
      catch (e) { console.error("finalizeClaim: fetch failed", e); } // transient; keep polling
      if (myId !== finalizeId) return;                 // superseded (slug change / unmount)
      if (fresh) {
        Object.assign(community.value ?? (community.value = fresh), fresh);
        if (fresh.owner) return;                        // owned; finally clears the banner
      }
      await new Promise((r) => setTimeout(r, 2000));
      if (myId !== finalizeId) return;
    }
  } finally {
    if (myId === finalizeId) finalizing.value = false;  // only the current poll clears it
  }
}

// A claim can fail because someone else claimed it first (race). Refetch and
// patch in place so the CTA resyncs (Claim disappears once owner is set)
// instead of leaving a stale "Claim" button the user retries forever.
async function onStale() {
  if (!community.value?.slug) return;
  const fresh = await fetchBySlug(community.value.slug);
  if (fresh) Object.assign(community.value, fresh);
}
</script>

<template>
  <main class="cp-page" :class="{ 'cp-page--editing': editing }">

    <!-- Loading: the shape of the plate, so nothing jumps when it arrives. -->
    <div v-if="loading" class="cp-skel" aria-hidden="true">
      <div class="cp-skel__plate">
        <div class="cp-skel__bar cp-skel__bar--eyebrow" />
        <div class="cp-skel__bar cp-skel__bar--name" />
        <div class="cp-skel__where">
          <div class="cp-skel__lines">
            <div class="cp-skel__bar" />
            <div class="cp-skel__bar cp-skel__bar--short" />
            <div class="cp-skel__bar cp-skel__bar--short" />
          </div>
          <div class="cp-skel__map" />
        </div>
      </div>
    </div>

    <!-- Not found -->
    <div v-else-if="notFound" class="cp-missing">
      <p class="cp-missing__title">{{ t('community.gone') }}</p>
      <router-link class="cp-missing__back" :to="{ name: 'community', params: localeParams }">
        <v-icon icon="mdi-arrow-left" size="16" />
        {{ t('community.directoryTitle') }}
      </router-link>
    </div>

    <!-- Profile -->
    <article v-else-if="community" class="cp">

      <!-- Where this page sits, and the owner's way in. The trail is the only
           link out of a store page: 4,451 of these were dead ends with nothing
           pointing back at the directory or at the country they are filed
           under, which the finder can filter by. -->
      <div v-if="!editing" class="cp-topbar">
        <nav class="cp-crumbs" :aria-label="t('community.directoryTitle')">
          <router-link class="cp-crumb" :to="{ name: 'community', params: localeParams }">
            {{ t('community.directoryTitle') }}
          </router-link>
          <template v-if="community.country">
            <span class="cp-crumb__sep" aria-hidden="true">/</span>
            <router-link
              class="cp-crumb"
              :to="{ name: 'community', params: localeParams, query: { country: community.country } }"
            >{{ community.country }}</router-link>
          </template>
        </nav>
        <button v-if="isOwner" type="button" class="cp-edit" @click="startEdit">
          <v-icon icon="mdi-pencil-outline" size="15" />
          {{ t('community.editTitle') }}
        </button>
      </div>

      <!-- ── The plate ──────────────────────────────────────────────────────
           Name, address, map and the row of things you can do, in one object.
           A banner becomes its ground on the two profiles that have one; the
           rest get the flat panel rather than a gradient standing in for a
           photograph nobody uploaded. -->
      <header class="cp-plate" :class="{ 'cp-plate--banner': displayBanner }">
        <img v-if="displayBanner" :src="displayBanner" alt="" class="cp-plate__banner" />

        <div class="cp-plate__inner">

          <!-- In the flow rather than pinned to the plate's corner: the kind
               chips wrap onto a second line in every language, and an absolute
               button parked up there sat on top of them. -->
          <div v-if="editing" class="cp-bannerbar">
            <input ref="bannerInput" type="file" accept="image/*" class="cp-hide" @change="onPickImage('banner', $event)" />
            <button type="button" class="cp-imgbtn cp-imgbtn--banner" :disabled="uploadingBanner" @click="bannerInput?.click()">
              <v-progress-circular v-if="uploadingBanner" indeterminate size="16" width="2" color="currentColor" />
              <template v-else><v-icon icon="mdi-image-edit-outline" size="15" />{{ t('community.changeBanner') }}</template>
            </button>
          </div>

          <!-- What this place is, in the collector's register. The tournament
               listing is the fact 4,450 of these rows were imported for and the
               page has never once mentioned. -->
          <p v-if="!editing" class="cp-eyebrow">
            <span v-for="(k, i) in profileKinds" :key="k" class="cp-eyebrow__bit">
              <span v-if="i > 0" class="cp-eyebrow__sep" aria-hidden="true">·</span>
              <CommunityKindIcon :kind="k" :size="12" />
              {{ t(TYPE_KEYS[k] ?? TYPE_KEYS.group) }}
            </span>
            <span v-if="isOts" class="cp-eyebrow__bit">
              <span class="cp-eyebrow__sep" aria-hidden="true">·</span>
              {{ t('community.otsLabel') }}
            </span>
            <span v-if="community.remote_duel" class="cp-eyebrow__bit">
              <span class="cp-eyebrow__sep" aria-hidden="true">·</span>
              {{ t('community.remoteDuel') }}
            </span>
          </p>
          <span v-else class="cp-kindset" role="group" :aria-label="t('community.fieldKind')">
            <label
              v-for="k in KINDS"
              :key="k"
              class="cp-kindchip"
              :class="{ 'cp-kindchip--on': edit.kinds.includes(k) }"
            >
              <input
                type="checkbox"
                class="cp-kindchip__box"
                :checked="edit.kinds.includes(k)"
                @change="toggleEditKind(k)"
              />
              <CommunityKindIcon :kind="k" :size="12" />
              {{ t(TYPE_KEYS[k]) }}
            </label>
          </span>

          <!-- The name, and a photograph only where one exists. A letter in a
               box repeats the word printed beside it, and 4,449 of these rows
               would have shown one. -->
          <div class="cp-idrow">
            <div
              v-if="displayAvatar || editing"
              class="cp-avatar"
              :class="{ 'cp-avatar--editing': editing }"
              @click="editing && !uploadingAvatar && avatarInput?.click()"
            >
              <img v-if="displayAvatar" :src="displayAvatar" :alt="displayName" />
              <v-icon v-else icon="mdi-image-plus-outline" size="20" />
              <template v-if="editing">
                <!-- .stop matters: this input sits inside the clickable avatar,
                     and input.click() bubbles, so without it opening the picker
                     would re-enter the avatar handler and open it again. -->
                <input
                  ref="avatarInput"
                  type="file"
                  accept="image/*"
                  class="cp-hide"
                  @click.stop
                  @change="onPickImage('avatar', $event)"
                />
                <button
                  type="button"
                  class="cp-imgbtn cp-imgbtn--avatar"
                  :disabled="uploadingAvatar"
                  @click.stop="avatarInput?.click()"
                  :aria-label="t('community.changeAvatar')"
                >
                  <v-progress-circular v-if="uploadingAvatar" indeterminate size="13" width="2" color="currentColor" />
                  <v-icon v-else icon="mdi-camera-outline" size="14" />
                </button>
              </template>
            </div>

            <h1 v-if="!editing" class="cp-name">{{ community.name }}</h1>
            <input
              v-else
              v-model="edit.name"
              class="cp-name-input"
              maxlength="120"
              :placeholder="t('community.fieldName')"
              :aria-label="t('community.fieldName')"
            />

            <!-- Teal, and the only teal on the page: this is the verified mark,
                 drawn the way the other six views of it are drawn. -->
            <span v-if="!editing && community.verified" class="cp-verified">
              <v-icon icon="mdi-check-decagram" size="13" />
              {{ t('community.verified') }}
            </span>
          </div>

          <!-- Where it is and what you can do about it, with the map beside
               the pair. A Discord server has neither an address nor a pin and
               simply gets the actions, rather than the empty panel where they
               used to go. -->
          <div v-if="!editing" class="cp-body">
            <div class="cp-facts">
              <!-- Monospace, and left as written. An address is an identifier
                   (DESIGN.md, The Mono Identifier Rule), and 940 of these are
                   Japanese and 34 Greek: uppercasing them would be a
                   typographic opinion imposed on somebody else's alphabet. -->
              <address v-if="addressBlock.length" class="cp-addr">
                <span v-for="line in addressBlock" :key="line" class="cp-addr__line">{{ line }}</span>
              </address>
              <span v-if="awayLabel" class="cp-away">
                <v-icon icon="mdi-navigation-variant-outline" size="13" />
                {{ t('community.awayFromYou', { d: awayLabel }) }}
              </span>

              <!-- Everything you can do here, in the order you would want it:
                   get there, ring ahead, then the shop's own channels. The
                   listings link appears only when this community has posted
                   some — it used to sit on all 4,451 profiles and open the
                   unfiltered Trade Center. -->
              <div class="cp-acts">
                <a v-if="mapsLink" :href="mapsLink" target="_blank" rel="noopener noreferrer" class="cp-act cp-act--go">
                  <v-icon icon="mdi-directions" size="16" />{{ t('community.directions') }}
                </a>
                <a v-if="phoneLink" :href="phoneLink" class="cp-act">
                  <v-icon icon="mdi-phone-outline" size="15" />
                  <span class="cp-act__label">{{ phoneLabel }}</span>
                </a>
                <a
                  v-for="(lnk, i) in (community.links || [])"
                  :key="i"
                  :href="linkHref(lnk)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="cp-act"
                >
                  <PlatformIcon :platform="lnk.platform" :size="15" />
                  <span class="cp-act__label">{{ linkLabel(lnk) }}</span>
                </a>
                <router-link
                  v-if="listingCount > 0"
                  :to="{ name: 'TradeCenter', params: { ...localeParams, tab: 'announces' } }"
                  class="cp-act"
                >
                  <v-icon icon="mdi-cards-outline" size="15" />
                  {{ t('community.listingCount', { n: listingCount }, listingCount) }}
                </router-link>
                <FollowButton
                  v-if="followable && !isOwner"
                  :community-id="community.id"
                  :user-id="currentUserId"
                  :count="community.follower_count ?? 0"
                  @update:count="community.follower_count = $event"
                  @auth-required="onFollowAuthRequired"
                />
              </div>
            </div>

            <a
              v-if="mapImgUrl"
              :href="mapsLink"
              target="_blank"
              rel="noopener noreferrer"
              class="cp-map"
              :aria-label="t('community.openMap')"
            >
              <img
                :src="mapImgUrl"
                class="cp-map__img"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
              <span class="cp-map__pin" aria-hidden="true">
                <v-icon icon="mdi-map-marker" size="30" />
              </span>
            </a>
          </div>

          <!-- Editing the address: the fields behind the printed block above,
               in the order they are printed. -->
          <div v-if="editing" class="cp-addredit">
            <input v-model="edit.address" class="cp-inline-input cp-addredit__street" maxlength="180"
              :placeholder="t('community.fieldAddress')" :aria-label="t('community.fieldAddress')" />
            <input v-model="edit.postal_code" class="cp-inline-input cp-addredit__zip" maxlength="20"
              :placeholder="t('community.fieldPostal')" :aria-label="t('community.fieldPostal')" />
            <input v-model="edit.city" class="cp-inline-input cp-addredit__city" maxlength="80"
              :placeholder="t('community.fieldCity')" :aria-label="t('community.fieldCity')" />
            <input v-model="edit.state" class="cp-inline-input cp-addredit__state" maxlength="80"
              :placeholder="t('community.fieldState')" :aria-label="t('community.fieldState')" />
            <span class="cp-sel">
              <select v-model="edit.country" class="cp-inline-input cp-inline-select" :aria-label="t('community.fieldCountry')">
                <option value="">{{ t('community.fieldCountry') }}</option>
                <option v-for="c in COUNTRIES" :key="c.code" :value="c.name">{{ c.flag }} {{ c.name }}</option>
              </select>
              <v-icon class="cp-sel__chev" icon="mdi-chevron-down" size="16" />
            </span>
            <input v-model="edit.phone" type="tel" class="cp-inline-input cp-addredit__phone" maxlength="40"
              :placeholder="t('community.fieldPhone')" :aria-label="t('community.fieldPhone')" />
          </div>

        </div>
      </header>

      <!-- ── What this page is ──────────────────────────────────────────────
           Unclaimed, which is 4,450 of them. The reader is looking at a
           directory record, and saying so is what turns a page with nothing on
           it into a page with nothing on it *yet*. -->
      <section v-if="listed && !editing" class="cp-record">
        <div class="cp-record__text">
          <p class="cp-record__what">{{ t('community.listedLabel') }}</p>
          <p class="cp-record__body">
            {{ isOts ? t('community.listedOts') : t('community.listedPlain') }}
            {{ myOther ? t('community.claimBlocked') : t('community.listedBody') }}
          </p>
        </div>
        <!-- Offering a claim to someone who already runs a community would walk
             them through an email code and a checkout only to be refused at the
             grant. Send them to their own page instead. -->
        <router-link
          v-if="myOther"
          class="cp-claim cp-claim--quiet"
          :to="{ name: 'communityProfile', params: { ...localeParams, slug: myOther.slug } }"
        >
          <v-icon icon="mdi-storefront-outline" size="16" />
          {{ myOther.name }}
        </router-link>
        <button v-else type="button" class="cp-claim" @click="openClaim">
          <v-icon icon="mdi-storefront-check-outline" size="16" />
          {{ t('community.claimThis') }}
        </button>
      </section>

      <div v-if="finalizing" class="cp-finalizing" role="status">
        <v-progress-circular indeterminate size="16" width="2" color="currentColor" />
        {{ t('community.claimFinalizing') }}
      </div>

      <!-- ── The shop's own words ───────────────────────────────────────────
           Everything below here exists because a person put it there. -->
      <p v-if="!editing && community.bio" class="cp-bio">{{ community.bio }}</p>
      <textarea
        v-else-if="editing"
        v-model="edit.bio"
        class="cp-bio-input"
        maxlength="2000"
        :placeholder="t('community.fieldBio')"
        :aria-label="t('community.fieldBio')"
      />

      <!-- Remote-duel toggle (edit only) -->
      <button
        v-if="editing"
        type="button"
        class="cp-remote-toggle"
        :class="{ 'cp-remote-toggle--on': edit.remote_duel }"
        :aria-pressed="edit.remote_duel"
        @click="edit.remote_duel = !edit.remote_duel"
      >
        <v-icon :icon="edit.remote_duel ? 'mdi-check-circle' : 'mdi-web'" size="16" />
        <span class="cp-remote-toggle__label">
          <span class="cp-remote-toggle__title">{{ t('community.remoteDuelLabel') }}</span>
          <span class="cp-remote-toggle__hint">{{ t('community.remoteDuelHint') }}</span>
        </span>
      </button>

      <!-- Link editor: add any number, pick a platform, drag to reorder -->
      <div v-if="editing" class="cp-linkedit">
        <p class="cp-linkedit__title">{{ t('community.linksTitle') }}</p>
        <ul class="cp-linklist">
          <li
            v-for="(lnk, i) in edit.links"
            :key="lnk._k"
            class="cp-linkrow"
            :class="{ 'cp-linkrow--drop': dropIndex === i && dragIndex !== i, 'cp-linkrow--dragging': dragIndex === i }"
            @dragover.prevent="onDragOver(i)"
            @drop="onDrop(i)"
          >
            <button
              type="button"
              class="cp-linkrow__handle"
              draggable="true"
              :aria-label="t('community.reorderLink')"
              @dragstart="onDragStart(i, $event)"
              @dragend="onDragEnd"
            >
              <v-icon icon="mdi-drag-vertical" size="18" />
            </button>
            <span class="cp-linkrow__icon"><PlatformIcon :platform="lnk.platform" :size="16" /></span>
            <span class="cp-sel">
              <select v-model="lnk.platform" class="cp-inline-input cp-inline-select" :aria-label="t('community.platform')">
                <option
                  v-for="p in LINK_PLATFORMS"
                  :key="p.id"
                  :value="p.id"
                  :disabled="platformDisabled(lnk, p.id)"
                >{{ t(`community.platform_${p.id}`) }}</option>
              </select>
              <v-icon class="cp-sel__chev" icon="mdi-chevron-down" size="16" />
            </span>
            <input
              v-if="lnk.platform === 'other'"
              v-model="lnk.label"
              class="cp-inline-input cp-linkrow__label"
              maxlength="40"
              :placeholder="t('community.linkLabel')"
              :aria-label="t('community.linkLabel')"
            />
            <input
              v-model="lnk.url"
              class="cp-inline-input cp-linkrow__url"
              :class="{ 'cp-linkrow__url--invalid': lnk.url && !isValidLink(lnk) }"
              :type="lnk.platform === 'email' ? 'email' : 'url'"
              :placeholder="placeholderFor(lnk.platform)"
              :aria-label="t('community.linkUrl')"
            />
            <button type="button" class="cp-linkrow__del" :aria-label="t('community.removeLink')" @click="removeLink(i)">
              <v-icon icon="mdi-close" size="16" />
            </button>
          </li>
        </ul>
        <button
          type="button"
          class="cp-addlink"
          :disabled="edit.links.length >= MAX_LINKS"
          @click="addLink"
        >
          <v-icon icon="mdi-plus" size="16" />
          {{ t('community.addLink') }}
        </button>
      </div>

      <CommunityEvents
        v-if="!editing"
        :community="community"
        :is-owner="isOwner"
        @loaded="onEventsLoaded"
      />

      <!-- ── Where else you could go ────────────────────────────────────────
           Ranked by distance from this door, because that is the order the
           question is asked in. -->
      <section v-if="!editing && nearby.length" class="cp-near" aria-labelledby="cp-near-h">
        <h2 id="cp-near-h" class="cp-near__h">{{ t('community.nearbyTitle', { km: NEARBY_KM }) }}</h2>
        <ul class="cp-near__list">
          <li v-for="place in nearby" :key="place.id">
            <router-link
              class="cp-near__row"
              :to="{ name: 'communityProfile', params: { ...localeParams, slug: place.slug } }"
            >
              <span class="cp-near__km tabular-nums">{{ formatDistance(place.km) }}</span>
              <span class="cp-near__name">{{ place.name }}</span>
              <!-- Teal, and the verified badge again: the same mark the plate
                   above wears, drawn the same way. -->
              <v-icon v-if="place.verified" icon="mdi-check-decagram" size="13" class="cp-near__verified" />
              <span v-if="place.city" class="cp-near__city">{{ place.city }}</span>
            </router-link>
          </li>
        </ul>
      </section>

      <!-- ── Owner's side ───────────────────────────────────────────────────
           The tally, the one thing left to set up, and the way out. All of it
           below the page the public reads, because none of it is for them. -->
      <section v-if="!editing && isOwner" class="cp-owner">
        <p class="cp-owner__head">{{ t('community.yoursAlready') }}</p>
        <div class="cp-owner__rows">
          <span class="cp-owner__stat">
            <v-icon icon="mdi-account-heart-outline" size="15" />
            {{ t('community.followerCount', community.follower_count ?? 0) }}
          </span>
          <router-link
            v-if="!community.verified"
            class="cp-owner__verify"
            :to="{ name: 'communityVerify', params: { ...localeParams, slug: community.slug } }"
          >
            <v-icon icon="mdi-check-decagram-outline" size="15" />
            {{ t('communityVerify.verifyPromptAction') }}
            <span class="cp-owner__why">{{ t('communityVerify.verifyPrompt') }}</span>
          </router-link>
        </div>
        <CommunityGiveUp
          :community="community"
          :viewer-id="currentUserId"
          @gone="onGaveUp"
        />
      </section>

      <!-- Reporting is moderation, not something the page is for. Last, small,
           and no longer parked beside the follow button at the top. -->
      <footer v-if="!editing" class="cp-foot">
        <button type="button" class="cp-report" @click="openReport">
          <v-icon icon="mdi-flag-outline" size="14" />
          {{ t('community.report') }}
        </button>
      </footer>

      <ClaimCommunityDialog v-model="claimOpen" :community="community" @stale="onStale" />
      <ReportCommunityDialog v-model="reportOpen" :community="community" @sent="onReported" />

      <!-- Sticky edit bar -->
      <div v-if="editing" class="cp-editbar">
        <span v-if="editErr" class="cp-editbar__err" role="alert">{{ editErr }}</span>
        <div class="cp-editbar__actions">
          <button class="btn-cancel-edit" @click="cancelEdit" :disabled="savingEdit || uploadingAvatar || uploadingBanner">
            {{ t('community.discardChanges') }}
          </button>
          <button
            class="btn-save-edit"
            :disabled="!editValid || savingEdit || uploadingAvatar || uploadingBanner"
            @click="saveEdit"
          >
            <v-progress-circular v-if="savingEdit" indeterminate size="16" width="2" color="currentColor" />
            <template v-else><v-icon icon="mdi-content-save-outline" size="16" />{{ t('community.saveChanges') }}</template>
          </button>
        </div>
      </div>

    </article>
  </main>
</template>

<style scoped>
/* Borrowed from the landing page (its --lp-* set), as the account, collection,
   matches, home, announce and directory pages already do: panels sit one tonal
   step under the page rather than above it, hairlines are a fraction of the
   border token, and depth is a 1px top highlight instead of a drop shadow —
   lit from above, per DESIGN.md's Flat-By-Default Rule.

   --cp-danger is the page's one scoped role: the design system has no danger
   token, so the red used by report and by save errors is centralized here
   rather than scattered as raw hex. */
.cp-page {
  --cp-panel: color-mix(in srgb, var(--c-surface) 94%, var(--c-bg));
  --cp-line: color-mix(in srgb, var(--c-border) 60%, transparent);
  --cp-line-soft: color-mix(in srgb, var(--c-border) 34%, transparent);
  --cp-lit: inset 0 1px 0 color-mix(in srgb, var(--c-text) 8%, transparent);
  --cp-danger: #F2555A;

  max-width: 1080px;
  margin: 0 auto;
  padding: 22px 0 56px;
}
@media (min-width: 768px) { .cp-page { padding-top: 30px; } }

.cp { display: flex; flex-direction: column; gap: 22px; }

/* ── Type ─────────────────────────────────────────────
   The display face is pushed hard and used exactly once: the shop's name is
   the only thing on the page set at hero size. */
.cp-name {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.85rem, 4.4vw, 2.85rem);
  font-weight: 700;
  line-height: 1.03;
  letter-spacing: -0.035em;
  color: var(--c-text);
  text-wrap: balance;
  min-width: 0;
}

/* What the place is, in the collector's register: monospace, uppercase, widely
   tracked (DESIGN.md, The Mono Identifier Rule), matching every other page in
   this pass. */
.cp-eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 7px;
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--c-muted);
}
.cp-eyebrow__bit { display: inline-flex; align-items: center; gap: 6px; }
.cp-eyebrow__sep { margin-right: 1px; color: color-mix(in srgb, var(--c-muted) 72%, transparent); }
.cp-eyebrow :deep(.v-icon), .cp-eyebrow :deep(.cpi-svg) { color: var(--c-trade); }

/* ── The plate ────────────────────────────────────────
   Name, address, map and actions in one object. Its ground is the panel, and a
   banner photograph only when the profile actually has one — the field used to
   draw an amethyst gradient with a 300px first initial ghosted into it, which
   4,449 of the 4,451 profiles were showing in place of a picture. */
.cp-plate {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--cp-line);
  border-radius: 22px;
  background: var(--cp-panel);
  box-shadow: var(--cp-lit);
}
.cp-plate__inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
}
@media (min-width: 640px) { .cp-plate__inner { padding: 26px 28px; gap: 18px; } }

/* Held well back and washed into the panel: the plate has to stay readable
   over a photograph the shop chose, and the text on it is the address. */
.cp-plate__banner {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.3;
}
.cp-plate--banner::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    to top,
    var(--cp-panel) 4%,
    color-mix(in srgb, var(--cp-panel) 78%, transparent) 58%,
    color-mix(in srgb, var(--cp-panel) 52%, transparent) 100%);
}

/* ── Identity row ─────────────────────────────────── */
.cp-idrow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; min-width: 0; }

/* Only where there is a photograph to show. A letter in a box repeats the name
   printed beside it, and the two profiles in the whole directory that have an
   avatar were making every other one draw a monogram. */
.cp-avatar {
  position: relative;   /* anchors the camera badge */
  width: 54px; height: 54px; border-radius: 15px;
  flex-shrink: 0;
  border: 1px solid var(--cp-line);
  background: var(--c-surface-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--c-muted);
}
.cp-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
.cp-avatar--editing { cursor: pointer; }
.cp-avatar--editing:hover { border-color: var(--c-trade); }

/* The one teal on this page, and it is the verified badge, drawn in the badge's
   own colour. Named for what it is so the palette guard can tell it apart from
   teal used as decoration. */
.cp-verified {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 11px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-mutual) 38%, transparent);
  background: color-mix(in srgb, var(--c-mutual) 12%, transparent);
  color: var(--c-mutual);
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.05em; text-transform: uppercase;
  white-space: nowrap;
}

/* ── Where it is, and what you can do about it ─────
   One column of facts with the map standing beside all of it, rather than a
   map floated next to three lines of address and the actions stranded in a row
   of their own underneath — which left the plate half empty on the left. */
.cp-body { display: flex; flex-direction: column; gap: 18px; }
@media (min-width: 700px) {
  .cp-body { flex-direction: row; align-items: flex-start; gap: 28px; }
  /* No map (a Discord server, a group): the facts take the whole plate rather
     than sitting in a column with a hole beside it. */
  .cp-facts { flex: 1 1 auto; }
}
.cp-facts { display: flex; flex-direction: column; align-items: flex-start; gap: 14px; min-width: 0; }

/* An address is an identifier, so it is set the way this app sets identifiers.
   <address> is italic by default, which a printed address is not. */
.cp-addr {
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", monospace;
  font-style: normal;
  font-size: 0.86rem;
  font-weight: 500;
  line-height: 1.72;
  letter-spacing: -0.01em;
  color: var(--c-text);
}
.cp-addr__line { display: block; }

/* Never asked for. The permission is read, not requested, so a reader who
   arrived from a search result gets no dialog and a reader who already turned
   Near me on in the directory gets the answer for free. */
.cp-away {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.72rem; font-weight: 700;
  letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--c-trade);
}

/* ── Map ──────────────────────────────────────────── */
.cp-map {
  position: relative;
  display: block;
  flex: 0 0 auto;
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--cp-line);
  background: var(--c-surface-2);
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
@media (min-width: 700px) { .cp-map { width: 296px; flex: 0 0 296px; } }
.cp-map:hover {
  border-color: var(--c-trade);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--c-trade) 18%, transparent);
}
.cp-map__img {
  display: block; width: 100%; height: 152px;
  object-fit: cover; object-position: center;   /* keeps the store centered */
  /* Tame OSM's bright tiles so the panel sits in the dim UI. */
  filter: saturate(0.82) brightness(0.88) contrast(1.02);
}
@media (min-width: 700px) { .cp-map__img { height: 168px; } }
/* Pin marks the exact spot: its tip rests on the image center (the store). */
.cp-map__pin {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -100%); pointer-events: none;
  color: var(--c-trade);
}

/* ── Actions ──────────────────────────────────────────
   One row: get there, ring ahead, then the shop's own channels. Directions is
   the only filled pill, because on a store page it is the only thing most
   readers came to do. */
.cp-acts { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.cp-act {
  display: inline-flex; align-items: center; gap: 7px;
  min-height: 40px; padding: 0 15px;
  border-radius: 999px;
  border: 1px solid var(--cp-line);
  background: var(--cp-panel);
  box-shadow: var(--cp-lit);
  color: var(--c-text);
  font-size: 0.8rem; font-weight: 700;
  text-decoration: none; cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}
.cp-act :deep(.v-icon), .cp-act :deep(.cpi-svg) { color: var(--c-trade); flex-shrink: 0; }
.cp-act:hover {
  border-color: var(--c-trade);
  box-shadow: var(--cp-lit), 0 8px 22px color-mix(in srgb, var(--c-trade) 16%, transparent);
}
.cp-act__label { max-width: 22ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-act--go {
  border-color: transparent;
  background: var(--c-trade);
  color: var(--c-on-accent);
}
.cp-act--go :deep(.v-icon) { color: var(--c-on-accent); }
.cp-act--go:hover { border-color: transparent; filter: brightness(1.08); }

/* ── Top bar: the trail, and the owner's way in ──── */
.cp-topbar { display: flex; align-items: center; gap: 14px; margin-bottom: -6px; }
.cp-crumbs {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  min-width: 0; margin-right: auto;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.1em; text-transform: uppercase;
}
.cp-crumb {
  display: inline-flex; align-items: center; min-height: 24px;
  color: var(--c-muted); text-decoration: none;
  transition: color 0.15s ease;
}
.cp-crumb:hover { color: var(--c-trade); }
.cp-crumb:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 3px; border-radius: 4px; }
.cp-crumb__sep { color: color-mix(in srgb, var(--c-muted) 72%, transparent); }
.cp-edit {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 36px; padding: 0 14px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: transparent; color: var(--c-trade);
  font-size: 0.78rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease;
}
.cp-edit:hover { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }

/* ── What this page is ────────────────────────────────
   Unclaimed, which is 4,450 of the 4,451. Drawn as a panel of its own so the
   reader can see that the emptiness below is the record's, not the shop's. */
.cp-record {
  display: flex; align-items: center; flex-wrap: wrap; gap: 14px 20px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 26%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--c-trade) 7%, var(--cp-panel));
  box-shadow: var(--cp-lit);
}
.cp-record__text { flex: 1 1 260px; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.cp-record__what {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--c-trade);
}
.cp-record__body { margin: 0; font-size: 0.875rem; line-height: 1.55; color: var(--c-muted); }
.cp-claim {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; cursor: pointer;
  text-decoration: none; white-space: nowrap;
  transition: filter 0.15s ease;
}
.cp-claim:hover { filter: brightness(1.08); }
.cp-claim :deep(.v-icon) { color: var(--c-on-accent); }
/* Already running one: this is a way back to their own page, not the offer. */
.cp-claim--quiet {
  background: transparent; color: var(--c-trade);
  border: 1px solid color-mix(in srgb, var(--c-trade) 45%, transparent);
}
.cp-claim--quiet :deep(.v-icon) { color: var(--c-trade); }
.cp-claim--quiet:hover { filter: none; background: color-mix(in srgb, var(--c-trade) 12%, transparent); }

.cp-finalizing {
  display: flex; align-items: center; gap: 9px;
  padding: 13px 18px; border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 26%, transparent);
  background: color-mix(in srgb, var(--c-trade) 8%, transparent);
  color: var(--c-trade); font-size: 0.85rem; font-weight: 700;
}

/* ── The shop's own words ─────────────────────────── */
.cp-bio {
  margin: 0; padding: 0 2px;
  font-size: 0.95rem; line-height: 1.7;
  color: var(--c-muted);
  white-space: pre-wrap; max-width: 68ch;
}

/* ── Where else you could go ──────────────────────────
   A ranked list, not a grid of cards: the distances have to line up down the
   left for the ranking to be readable at a glance, which is the whole reason
   to show them. */
.cp-near { display: flex; flex-direction: column; gap: 12px; }
.cp-near__h {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}
.cp-near__list {
  list-style: none; margin: 0; padding: 0;
  border: 1px solid var(--cp-line-soft);
  border-radius: 16px;
  background: var(--cp-panel);
  box-shadow: var(--cp-lit);
  overflow: hidden;
}
.cp-near__list > li + li { border-top: 1px solid var(--cp-line-soft); }
.cp-near__row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  text-decoration: none; color: var(--c-text);
  transition: background 0.14s ease;
}
.cp-near__row:hover { background: color-mix(in srgb, var(--c-trade) 8%, transparent); }
.cp-near__row:hover .cp-near__name { color: var(--c-trade); }
.cp-near__row:focus-visible { outline: 2px solid var(--c-trade); outline-offset: -2px; }
/* Fixed column so the ranking reads straight down. */
.cp-near__km {
  flex: 0 0 64px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.74rem; font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--c-trade);
}
.cp-near__name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 0.875rem; font-weight: 700;
  transition: color 0.14s ease;
}
.cp-near__verified { color: var(--c-mutual); flex-shrink: 0; }
.cp-near__city {
  margin-left: auto; padding-left: 10px;
  font-size: 0.78rem; color: var(--c-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
@media (max-width: 480px) {
  .cp-near__km { flex-basis: 56px; }
  .cp-near__city { display: none; }
}

/* ── Owner's side ─────────────────────────────────── */
.cp-owner {
  display: flex; flex-direction: column; gap: 14px;
  padding-top: 22px;
  border-top: 1px solid var(--cp-line-soft);
}
.cp-owner__head {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase;
  color: var(--c-muted);
}
.cp-owner__rows { display: flex; align-items: center; flex-wrap: wrap; gap: 12px 18px; }
.cp-owner__stat {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 0.83rem; font-weight: 600; color: var(--c-text);
}
.cp-owner__stat :deep(.v-icon) { color: var(--c-trade); }
.cp-owner__verify {
  display: inline-flex; align-items: center; flex-wrap: wrap; gap: 7px;
  min-height: 40px; padding: 6px 16px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--c-trade) 40%, transparent);
  color: var(--c-trade); font-size: 0.8rem; font-weight: 700;
  text-decoration: none;
  transition: background 0.15s ease;
}
.cp-owner__verify:hover { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }
.cp-owner__why { color: var(--c-muted); font-weight: 500; }

/* ── Footer ───────────────────────────────────────── */
.cp-foot { display: flex; justify-content: flex-end; padding-top: 6px; }
.cp-report {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 36px; padding: 0 12px; border-radius: 999px;
  background: transparent; color: var(--c-muted);
  font-size: 0.76rem; font-weight: 700; cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.cp-report:hover { background: color-mix(in srgb, var(--cp-danger) 14%, transparent); color: var(--cp-danger); }

/* ── Loading ──────────────────────────────────────── */
.cp-skel__plate {
  display: flex; flex-direction: column; gap: 18px;
  padding: 26px 28px;
  border: 1px solid var(--cp-line-soft);
  border-radius: 22px;
  background: var(--cp-panel);
}
.cp-skel__bar { height: 13px; width: 46%; border-radius: 7px; background: var(--c-skeleton); }
.cp-skel__bar--eyebrow { width: 32%; height: 10px; }
.cp-skel__bar--name { width: 62%; height: 34px; border-radius: 10px; }
.cp-skel__bar--short { width: 30%; }
.cp-skel__where { display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 700px) { .cp-skel__where { flex-direction: row; justify-content: space-between; gap: 28px; } }
.cp-skel__lines { display: flex; flex-direction: column; gap: 10px; flex: 1; }
.cp-skel__map { height: 152px; border-radius: 14px; background: var(--c-skeleton); }
@media (min-width: 700px) { .cp-skel__map { width: 296px; height: 168px; flex: 0 0 auto; } }
.cp-skel { animation: cp-pulse 1.6s ease-in-out infinite; }
@keyframes cp-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) { .cp-skel { animation: none; } }

/* ── Not found ────────────────────────────────────── */
.cp-missing {
  display: flex; flex-direction: column; align-items: flex-start;
  gap: 16px; padding: 64px 4px;
}
.cp-missing__title {
  margin: 0;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: clamp(1.5rem, 3.6vw, 2.1rem);
  font-weight: 700; letter-spacing: -0.03em; color: var(--c-text);
}
.cp-missing__back {
  display: inline-flex; align-items: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 999px;
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.85rem; font-weight: 700; text-decoration: none;
  transition: filter 0.15s ease;
}
.cp-missing__back:hover { filter: brightness(1.08); }
.cp-missing__back :deep(.v-icon) { color: var(--c-on-accent); }

/* ── Inline edit mode ─────────────────────────────── */
.cp-page--editing { padding-bottom: 96px; } /* room for the sticky bar */
.cp-hide { display: none; }

.cp-name-input {
  flex: 1 1 260px; min-width: 0; max-width: 460px;
  background: color-mix(in srgb, var(--c-bg) 55%, var(--c-surface));
  border: 1px solid var(--cp-line); border-radius: 13px;
  padding: 9px 14px;
  font-family: "Space Grotesk", system-ui, sans-serif;
  font-size: 1.4rem; font-weight: 700; color: var(--c-text);
  letter-spacing: -0.03em; outline: none;
  transition: border-color 0.15s ease;
}
.cp-name-input:focus { border-color: var(--c-trade); }

.cp-inline-input {
  background: color-mix(in srgb, var(--c-bg) 55%, var(--c-surface));
  border: 1px solid var(--cp-line); border-radius: 11px;
  padding: 9px 12px; min-height: 40px;
  font-family: inherit; font-size: 0.83rem; font-weight: 600; color: var(--c-text);
  outline: none; transition: border-color 0.15s ease; min-width: 0;
}
.cp-inline-input:focus { border-color: var(--c-trade); }
.cp-inline-input::placeholder { color: var(--c-muted); }

/* The native arrow was stripped by appearance:none and replaced with an SVG
   whose stroke was a hard-coded #888 — a pure gray, which the system does not
   have (DESIGN.md, The No-Gray Rule), and which stayed the same in both
   themes. The arrow is drawn as a real icon beside the field instead, so it
   takes a token colour and follows the theme. */
.cp-sel { position: relative; display: inline-flex; min-width: 0; }
.cp-sel .cp-inline-select { appearance: none; padding-right: 32px; cursor: pointer; width: 100%; }
.cp-sel__chev {
  position: absolute; right: 11px; top: 50%; transform: translateY(-50%);
  pointer-events: none; color: var(--c-muted);
}

/* The address, laid out in the order it prints: street across the top, then
   the code and the town, then the region and the country, then the number. */
.cp-addredit { display: flex; flex-wrap: wrap; gap: 10px; }
.cp-addredit__street { flex: 1 1 100%; }
.cp-addredit__zip { flex: 0 1 130px; }
.cp-addredit__city { flex: 1 1 180px; }
.cp-addredit__state { flex: 1 1 160px; }
.cp-addredit .cp-sel { flex: 1 1 200px; }
.cp-addredit__phone { flex: 1 1 180px; }

.cp-bio-input {
  width: 100%; box-sizing: border-box;
  background: var(--cp-panel); border: 1px solid var(--cp-line); border-radius: 16px;
  padding: 14px 16px; font-size: 0.95rem; color: var(--c-text); line-height: 1.65;
  min-height: 112px; resize: vertical; outline: none; font-family: inherit;
  transition: border-color 0.15s ease;
}
.cp-bio-input:focus { border-color: var(--c-trade); }
.cp-bio-input::placeholder { color: var(--c-muted); }

/* Editing the kinds: the same words the eyebrow shows, made tickable, so the
   line does not change shape between reading and editing. */
.cp-kindset { display: inline-flex; flex-wrap: wrap; gap: 7px; }
.cp-kindchip {
  display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
  font-family: ui-monospace, "Cascadia Code", monospace;
  text-transform: uppercase; letter-spacing: 0.1em; font-size: 0.68rem; font-weight: 700;
  color: var(--c-muted);
  border: 1px solid var(--cp-line-soft);
  padding: 5px 11px; border-radius: 999px;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.cp-kindchip :deep(.v-icon), .cp-kindchip :deep(.cpi-svg) { color: currentColor; }
.cp-kindchip--on {
  color: var(--c-trade);
  border-color: color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: color-mix(in srgb, var(--c-trade) 13%, transparent);
}
.cp-kindchip__box { position: absolute; opacity: 0; width: 1px; height: 1px; }
.cp-kindchip:focus-within { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* ── Remote-duel toggle (edit) ────────────────────── */
.cp-remote-toggle {
  display: flex; align-items: center; gap: 12px; width: 100%;
  text-align: left; cursor: pointer;
  padding: 13px 15px; border-radius: 16px;
  border: 1px solid var(--cp-line); background: var(--cp-panel);
  box-shadow: var(--cp-lit);
  color: var(--c-text);
  transition: border-color 0.15s ease, background 0.15s ease;
}
.cp-remote-toggle:hover { border-color: var(--c-trade); }
.cp-remote-toggle > .v-icon { color: var(--c-muted); flex-shrink: 0; }
.cp-remote-toggle--on {
  border-color: color-mix(in srgb, var(--c-trade) 50%, transparent);
  background: color-mix(in srgb, var(--c-trade) 9%, var(--cp-panel));
}
.cp-remote-toggle--on > .v-icon { color: var(--c-trade); }
.cp-remote-toggle__label { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cp-remote-toggle__title { font-size: 0.85rem; font-weight: 700; }
.cp-remote-toggle__hint { font-size: 0.75rem; font-weight: 500; color: var(--c-muted); }

/* ── Link editor (owner) ──────────────────────────── */
.cp-linkedit { display: flex; flex-direction: column; gap: 12px; }
.cp-linkedit__title {
  margin: 0;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.16em; color: var(--c-muted);
}
.cp-linklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.cp-linkrow {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 4px; border-radius: 12px;
  transition: background 0.12s ease, opacity 0.12s ease;
}
.cp-linkrow--dragging { opacity: 0.4; }
.cp-linkrow--drop { background: color-mix(in srgb, var(--c-trade) 14%, transparent); }
.cp-linkrow__handle {
  flex-shrink: 0; display: flex; align-items: center; padding: 4px 0;
  color: var(--c-muted); cursor: grab; background: transparent; border: none;
}
.cp-linkrow__handle:active { cursor: grabbing; }
.cp-linkrow__icon {
  flex-shrink: 0; width: 20px; display: flex; align-items: center; justify-content: center;
  color: var(--c-trade);
}
.cp-linkrow .cp-sel { flex: 0 0 auto; width: 130px; }
.cp-linkrow__label { flex: 1 1 110px; }
.cp-linkrow__url { flex: 2 1 150px; }
.cp-linkrow__url--invalid, .cp-linkrow__url--invalid:focus { border-color: var(--cp-danger); }
.cp-linkrow__del {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 10px;
  color: var(--c-muted); background: transparent; border: none; cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.cp-linkrow__del:hover { color: var(--cp-danger); background: color-mix(in srgb, var(--cp-danger) 14%, transparent); }
.cp-addlink {
  display: inline-flex; align-items: center; gap: 6px; align-self: flex-start;
  min-height: 40px; padding: 0 15px; border-radius: 999px;
  border: 1px dashed color-mix(in srgb, var(--c-trade) 45%, transparent);
  background: transparent;
  color: var(--c-trade); font-size: 0.8rem; font-weight: 700; cursor: pointer;
  transition: background 0.12s ease;
}
.cp-addlink:hover:not(:disabled) { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }
.cp-addlink:disabled { opacity: 0.5; pointer-events: none; }

/* ── Image upload controls ────────────────────────── */
.cp-imgbtn {
  position: absolute; z-index: 3;
  display: flex; align-items: center; justify-content: center; gap: 6px;
  /* The label sits on a brand colour, so it uses the token that inverts with
     the theme rather than a literal white (DESIGN.md, The Label Contrast
     Rule). It used to be #fff, which fails on amethyst in the light theme. */
  background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.75rem; font-weight: 700; cursor: pointer; border: none;
  transition: filter 0.15s ease;
}
.cp-imgbtn :deep(.v-icon) { color: var(--c-on-accent); }
.cp-imgbtn:hover:not(:disabled) { filter: brightness(1.08); }
.cp-imgbtn:disabled { opacity: 0.6; pointer-events: none; }
.cp-bannerbar { display: flex; justify-content: flex-end; margin-bottom: -6px; }
.cp-imgbtn--banner { position: static; min-height: 36px; padding: 0 15px; border-radius: 999px; }
.cp-imgbtn--avatar {
  inset: auto -6px -6px auto; width: 28px; height: 28px; border-radius: 50%;
  border: 2px solid var(--cp-panel);
}

/* ── Sticky edit bar ──────────────────────────────── */
.cp-editbar {
  position: sticky; bottom: 0; z-index: 5;
  display: flex; align-items: center; justify-content: flex-end; gap: 12px; flex-wrap: wrap;
  /* Flush with the content column. The old negative margins were cancelling a
     horizontal page padding this layout no longer has, so the bar hung off the
     right edge by exactly that much. */
  margin: 4px 0 -56px; padding: 14px 0;
  background: color-mix(in srgb, var(--c-surface) 94%, transparent);
  backdrop-filter: blur(8px);
  border-top: 1px solid var(--cp-line);
}
.cp-editbar__err { color: var(--cp-danger); font-size: 0.78rem; font-weight: 600; margin-right: auto; }
.cp-editbar__actions { display: flex; align-items: center; gap: 10px; }
.btn-cancel-edit {
  min-height: 44px; padding: 0 16px; border-radius: 999px; font-size: 0.82rem; font-weight: 600;
  color: var(--c-muted); cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.btn-cancel-edit:hover { background: var(--c-surface-2); color: var(--c-text); }
.btn-cancel-edit:disabled { opacity: 0.5; pointer-events: none; }
.btn-save-edit {
  display: flex; align-items: center; gap: 8px; min-width: 148px; min-height: 44px; justify-content: center;
  padding: 0 22px; border-radius: 999px; background: var(--c-trade); color: var(--c-on-accent);
  font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: filter 0.15s ease;
}
.btn-save-edit :deep(.v-icon) { color: var(--c-on-accent); }
.btn-save-edit:hover:not(:disabled) { filter: brightness(1.08); }
.btn-save-edit:disabled { opacity: 0.5; pointer-events: none; }

/* ── Shared focus ring ────────────────────────────── */
.cp-act:focus-visible,
.cp-map:focus-visible,
.cp-claim:focus-visible,
.cp-edit:focus-visible,
.cp-report:focus-visible,
.cp-owner__verify:focus-visible,
.cp-missing__back:focus-visible,
.cp-imgbtn:focus-visible,
.cp-avatar--editing:focus-visible,
.cp-addlink:focus-visible,
.cp-linkrow__handle:focus-visible,
.cp-linkrow__del:focus-visible,
.cp-remote-toggle:focus-visible,
.btn-save-edit:focus-visible,
.btn-cancel-edit:focus-visible,
.cp-name-input:focus-visible,
.cp-inline-input:focus-visible,
.cp-bio-input:focus-visible {
  outline: 2px solid var(--c-trade);
  outline-offset: 2px;
}
</style>
