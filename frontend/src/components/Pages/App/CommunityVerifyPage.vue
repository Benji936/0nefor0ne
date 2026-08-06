<script setup>
// Verifying a community you created yourself.
//
// A route, not a dialog, because the flow leaves the origin twice: to Discord
// for the guild check and to Stripe for the subscription. Everything that
// decides what to render comes back from the server through verifyStep(), so
// returning from either redirect, refreshing, or opening the URL cold all land
// in the same place.
//
// The proof is chosen by what the community is, never asked as a question. A
// shop proves a domain, a Discord proves Manage Server, a group is read by a
// person. The owner already knows which they are.
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { useHead } from "@unhead/vue";
import { fetchBySlug, verifyClaimCode, startClaimCheckout } from "@/lib/community";
import { communityPricing } from "@/lib/communityPricing";
import { isValidCode } from "@/lib/claimState";
import {
  verifyStep, domainMatches, siteHost, fetchVerifyClaim,
  requestDomainCode, verifyDiscordGuild, issueBotToken, submitForReview,
} from "@/lib/communityVerify";
import { getCurrentSession, onAuthChange, signInWithDiscord, reauthWithDiscordGuilds, supabase } from "@/lib/supabaseClient";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";
// Not mdi-discord: that glyph is absent from the bundled webfont and renders as
// an empty 16px box. PlatformIcon draws it inline and inherits currentColor.
import PlatformIcon from "@/components/community/PlatformIcon.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const locale = computed(() => route.params.locale || "en");
const slug = computed(() => String(route.params.slug || ""));

const community = ref(null);
const claim = ref(null);
const viewerId = ref(null);
const loading = ref(true);
const notFound = ref(false);

// Local interaction state. None of it decides which step renders; that is
// verifyStep's job, and keeping the two apart is what makes a reload safe.
const email = ref("");
const code = ref("");
const reason = ref("");
const botToken = ref(null);
const botTokenExpires = ref(null);
const submitting = ref(false);
const errorMsg = ref("");
const sentToAddress = ref(null);

// Stripe returns the instant Checkout completes, but the subscription is not
// real until the webhook lands. Without this the owner would come back to the
// page that just took their card and be asked for it again.
const justPaid = ref(route.query.verify === "success");

const price = computed(() => communityPricing(community.value));
const state = computed(() => verifyStep({
  community: community.value,
  claim: claim.value,
  viewerId: viewerId.value,
  justPaid: justPaid.value,
}));

const displayName = computed(() => community.value?.name || slug.value);

// The page's one heading has to agree with what is under it. "Verify this
// community" above "2 GT GAMES is verified" reads as a contradiction, and above
// "the subscription has ended" it reads as an instruction nobody gave.
const HEADINGS = {
  done: "communityVerify.titleDone",
  lapsed: "communityVerify.titleLapsed",
  "past-due": "communityVerify.titleLapsed",
  processing: "communityVerify.titleProcessing",
  "pending-review": "communityVerify.titlePending",
};
const heading = computed(() => t(HEADINGS[state.value.step] ?? "communityVerify.title"));

// A code is outstanding when the server says one is, so refreshing mid-flow
// keeps the entry field rather than silently dropping back to the email step.
const codeOutstanding = computed(() => {
  const exp = claim.value?.code_expires_at;
  return !!exp && new Date(exp) > new Date();
});
const canVerifyCode = computed(() => isValidCode(code.value) && !submitting.value);
const emailMismatch = computed(() =>
  email.value.includes("@") && !domainMatches(community.value?.website, email.value));
const canSendCode = computed(() =>
  email.value.trim().includes("@") && !emailMismatch.value && !submitting.value);

useHead(computed(() => ({
  title: community.value ? t("communityVerify.metaTitle", { name: displayName.value }) : undefined,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
})));

// ── Loading ────────────────────────────────────────────────────────────────
async function load() {
  errorMsg.value = "";
  try {
    const row = await fetchBySlug(slug.value);
    if (!row) { notFound.value = true; return; }
    community.value = row;
    claim.value = await fetchVerifyClaim(row.id);
  } catch (e) {
    console.error("verify page load failed", e);
    errorMsg.value = t("communityVerify.loadFailed");
  } finally {
    loading.value = false;
  }
}

let stopAuth = null;
onMounted(async () => {
  viewerId.value = (await getCurrentSession())?.user?.id ?? null;
  stopAuth = onAuthChange((s) => { viewerId.value = s?.user?.id ?? null; });
  await load();
  // Coming back from Discord with the guilds scope: the provider token only
  // lives in this page's session, so it has to be spent now.
  if (route.query.discord === "1") await completeDiscordCheck();
  if (justPaid.value) startPolling();
});
onUnmounted(() => { stopAuth?.(); stopPolling(); });

// ── The webhook gap ────────────────────────────────────────────────────────
let pollTimer = null;
let pollsLeft = 15; // ~30s, comfortably longer than a Stripe webhook round trip
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (pollsLeft-- <= 0) { stopPolling(); justPaid.value = false; return; }
    claim.value = await fetchVerifyClaim(community.value?.id);
    if (claim.value?.subscription_status) {
      // Re-read the community so the badge state matches what the webhook wrote.
      community.value = await fetchBySlug(slug.value);
      if (community.value?.verified) { stopPolling(); justPaid.value = false; }
    }
  }, 2000);
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Store: domain proof ────────────────────────────────────────────────────
async function sendCode() {
  if (!canSendCode.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await requestDomainCode(community.value.id, email.value.trim());
    if (res?.status === "sent") {
      sentToAddress.value = email.value.trim();
      claim.value = await fetchVerifyClaim(community.value.id);
      code.value = "";
    } else if (res?.status === "rate_limited") {
      errorMsg.value = t("community.claimRateLimited");
    } else if (res?.status === "domain_mismatch") {
      errorMsg.value = t("communityVerify.domainMismatch", { host: res.host });
    } else if (res?.status === "needs_website") {
      community.value = await fetchBySlug(slug.value); // re-render into the no-website state
    } else {
      errorMsg.value = res?.error ?? t("communityVerify.genericError");
    }
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally { submitting.value = false; }
}

async function submitCode() {
  if (!canVerifyCode.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await verifyClaimCode(community.value.id, code.value);
    if (res?.status === "verified") {
      claim.value = await fetchVerifyClaim(community.value.id);
    } else if (res?.status === "invalid") {
      errorMsg.value = t("community.claimInvalidCode", { count: res.attempts_left ?? 0 });
    } else if (res?.status === "expired") {
      errorMsg.value = t("community.claimExpiredCode");
      claim.value = await fetchVerifyClaim(community.value.id);
    } else {
      errorMsg.value = res?.error ?? t("communityVerify.genericError");
    }
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally { submitting.value = false; }
}

// ── Discord: two routes to the same proof ──────────────────────────────────
async function getBotToken() {
  if (submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await issueBotToken(community.value.id);
    if (res?.status === "issued") {
      botToken.value = res.token;
      botTokenExpires.value = res.expires_at;
    } else {
      errorMsg.value = res?.error ?? t("communityVerify.genericError");
    }
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally { submitting.value = false; }
}

// Polls for the bot having done its half, so the owner sees the page move on
// its own instead of being told to refresh.
let botPoll = null;
watch(botToken, (tok) => {
  if (botPoll) { clearInterval(botPoll); botPoll = null; }
  if (!tok) return;
  botPoll = setInterval(async () => {
    claim.value = await fetchVerifyClaim(community.value?.id);
    if (claim.value?.identity_verified_at) { clearInterval(botPoll); botPoll = null; botToken.value = null; }
  }, 3000);
});
onUnmounted(() => { if (botPoll) clearInterval(botPoll); });

function startDiscordOAuth() {
  const next = `/${locale.value}/community/${slug.value}/verify?discord=1`;
  reauthWithDiscordGuilds(next); // leaves the page
}

async function completeDiscordCheck() {
  submitting.value = true; errorMsg.value = "";
  try {
    const { data } = await supabase.auth.getSession();
    const providerToken = data?.session?.provider_token;
    if (!providerToken) { errorMsg.value = t("communityVerify.discordTokenExpired"); return; }
    const res = await verifyDiscordGuild(community.value.id, providerToken);
    if (res?.status === "verified") {
      claim.value = await fetchVerifyClaim(community.value.id);
    } else if (res?.status === "not_a_member") {
      errorMsg.value = t("communityVerify.discordNotMember");
    } else if (res?.status === "not_a_manager") {
      errorMsg.value = t("communityVerify.discordNotManager");
    } else if (res?.status === "invite_unresolvable" || res?.status === "needs_invite") {
      errorMsg.value = t("communityVerify.discordInviteBroken");
    } else if (res?.status === "token_expired") {
      errorMsg.value = t("communityVerify.discordTokenExpired");
    } else {
      errorMsg.value = res?.error ?? t("communityVerify.genericError");
    }
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally {
    submitting.value = false;
    // Drop the marker so a refresh does not try to spend a token already used.
    router.replace({ query: {} });
  }
}

// ── Group: a person reads it ───────────────────────────────────────────────
async function sendForReview() {
  if (!reason.value.trim() || submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await submitForReview(community.value.id, reason.value.trim());
    if (res?.status === "submitted") claim.value = await fetchVerifyClaim(community.value.id);
    else errorMsg.value = res?.error ?? t("communityVerify.genericError");
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally { submitting.value = false; }
}

// ── Pay ────────────────────────────────────────────────────────────────────
async function startCheckout() {
  if (submitting.value) return;
  submitting.value = true; errorMsg.value = "";
  try {
    const res = await startClaimCheckout(community.value.id);
    if (res?.url) { window.location.href = res.url; return; } // leaves the page
    if (res?.error === "not_verified") { claim.value = await fetchVerifyClaim(community.value.id); }
    errorMsg.value = res?.error ?? t("communityVerify.genericError");
  } catch (e) { errorMsg.value = e.message ?? t("communityVerify.genericError"); }
  finally { submitting.value = false; }
}

function signIn() {
  signInWithDiscord().catch((e) => { errorMsg.value = e.message ?? t("communityVerify.genericError"); });
}
</script>

<template>
  <div class="cv">
    <router-link class="cv__back" :to="{ name: 'communityProfile', params: { locale, slug } }">
      <v-icon icon="mdi-arrow-left" size="18" />
      {{ t('communityVerify.back') }}
    </router-link>

    <!-- Loading: skeleton, not a spinner, so the shape does not jump -->
    <div v-if="loading" class="cv__skeleton" role="status" :aria-label="t('communityVerify.loading')">
      <span class="cv__sk cv__sk--title" />
      <span class="cv__sk cv__sk--line" />
      <span class="cv__sk cv__sk--block" />
    </div>

    <div v-else-if="notFound" class="cv__dead">
      <h1 class="cv__title">{{ t('communityVerify.notFoundTitle') }}</h1>
      <p class="cv__body">{{ t('communityVerify.notFoundBody') }}</p>
      <router-link class="cv__secondary" :to="{ name: 'community', params: { locale } }">
        {{ t('communityVerify.toDirectory') }}
      </router-link>
    </div>

    <template v-else>
      <!-- Who this is about. Small: the community is the subject, not the hero. -->
      <p class="cv__eyebrow">
        <CommunityKindIcon :kind="community.kind" :size="14" />
        <span>{{ displayName }}</span>
      </p>
      <h1 class="cv__title">{{ heading }}</h1>

      <!-- ── Signed out ─────────────────────────────────────────────── -->
      <template v-if="state.step === 'signed-out'">
        <p class="cv__body">{{ t('communityVerify.signedOutBody') }}</p>
        <button type="button" class="cv__primary" @click="signIn">
          <PlatformIcon platform="discord" :size="17" />
          {{ t('auth.signIn') }}
        </button>
      </template>

      <!-- ── Somebody else's community ──────────────────────────────── -->
      <template v-else-if="state.step === 'not-owner'">
        <p class="cv__body">{{ t('communityVerify.notOwnerBody') }}</p>
        <router-link class="cv__secondary" :to="{ name: 'communityProfile', params: { locale, slug } }">
          {{ t('communityVerify.toCommunity') }}
        </router-link>
      </template>

      <!-- ── Done ───────────────────────────────────────────────────── -->
      <template v-else-if="state.step === 'done'">
        <p class="cv__lede">{{ t('communityVerify.doneBody') }}</p>
        <router-link class="cv__primary" :to="{ name: 'communityProfile', params: { locale, slug } }">
          {{ t('communityVerify.doneAction') }}
          <v-icon icon="mdi-arrow-right" size="17" />
        </router-link>
      </template>

      <!-- ── Paid, waiting on the webhook ───────────────────────────── -->
      <template v-else-if="state.step === 'processing'">
        <p class="cv__lede">{{ t('communityVerify.processingBody') }}</p>
        <p class="cv__note">
          <v-progress-circular indeterminate size="14" width="2" color="currentColor" />
          {{ t('communityVerify.processingNote') }}
        </p>
      </template>

      <!-- ── Lapsed / dunning ───────────────────────────────────────── -->
      <template v-else-if="state.step === 'lapsed' || state.step === 'past-due'">
        <p class="cv__lede">
          {{ state.step === 'lapsed'
            ? t('communityVerify.lapsedBody')
            : t('communityVerify.pastDueBody') }}
        </p>
        <button type="button" class="cv__primary" :disabled="submitting" @click="startCheckout">
          <v-progress-circular v-if="submitting" indeterminate size="16" width="2" color="white" />
          <template v-else>
            <v-icon icon="mdi-credit-card-outline" size="17" />
            {{ t('communityVerify.lapsedAction') }}
          </template>
        </button>
      </template>

      <!-- ── Waiting on a person ────────────────────────────────────── -->
      <template v-else-if="state.step === 'pending-review'">
        <p class="cv__lede">{{ t('communityVerify.pendingReviewBody') }}</p>
        <p class="cv__note">{{ t('communityVerify.pendingReviewNote') }}</p>
      </template>

      <!-- ── Pay ────────────────────────────────────────────────────── -->
      <template v-else-if="state.step === 'pay'">
        <p class="cv__lede">{{ t('communityVerify.payBody') }}</p>
        <!-- Same list treatment as the unlocks above: one page, one way of
             writing down a short list of facts. -->
        <ul class="cv__unlocks">
          <li><v-icon icon="mdi-gift-outline" size="15" />{{ t('communityVerify.payFreeYear') }}</li>
          <li><v-icon icon="mdi-calendar-refresh-outline" size="15" />{{ t('communityVerify.payThen', { price: price.display }) }}</li>
          <li><v-icon icon="mdi-close-circle-outline" size="15" />{{ t('communityVerify.payCancel') }}</li>
        </ul>
        <button type="button" class="cv__primary" :disabled="submitting" @click="startCheckout">
          <v-progress-circular v-if="submitting" indeterminate size="16" width="2" color="white" />
          <template v-else>
            <v-icon icon="mdi-credit-card-outline" size="17" />
            {{ t('communityVerify.payAction') }}
          </template>
        </button>
      </template>

      <!-- ── Prove ──────────────────────────────────────────────────── -->
      <template v-else>
        <p class="cv__lede">{{ t('communityVerify.lede') }}</p>

        <!-- What it does. A plain list: these are facts, not four cards. -->
        <ul class="cv__unlocks">
          <!-- Events first: it is the one line that names a capability the
               community does not have until this is done. -->
          <li><v-icon icon="mdi-calendar-plus" size="15" />{{ t('communityVerify.unlockEvents') }}</li>
          <li><v-icon icon="mdi-check-decagram" size="15" />{{ t('communityVerify.unlockBadge') }}</li>
          <li><v-icon icon="mdi-sort-variant" size="15" />{{ t('communityVerify.unlockRanking') }}</li>
          <li><v-icon icon="mdi-shield-account-outline" size="15" />{{ t('communityVerify.unlockTrust') }}</li>
        </ul>

        <!-- Store with no website: fix that first -->
        <section v-if="state.proof === 'no-website'" class="cv__step">
          <h2 class="cv__stepTitle">{{ t('communityVerify.noWebsiteTitle') }}</h2>
          <p class="cv__body">{{ t('communityVerify.noWebsiteBody') }}</p>
          <router-link class="cv__primary" :to="{ name: 'communityProfile', params: { locale, slug }, query: { edit: '1' } }">
            <v-icon icon="mdi-pencil-outline" size="16" />
            {{ t('communityVerify.noWebsiteAction') }}
          </router-link>
        </section>

        <!-- Store: domain proof -->
        <section v-else-if="state.proof === 'domain'" class="cv__step">
          <h2 class="cv__stepTitle">{{ t('communityVerify.domainTitle') }}</h2>

          <template v-if="!codeOutstanding">
            <p class="cv__body">
              {{ t('communityVerify.domainBody', { host: siteHost(community.website) }) }}
            </p>
            <div class="cv__field">
              <label class="cv__label" for="cv-email">{{ t('communityVerify.domainLabel') }}</label>
              <input
                id="cv-email"
                v-model="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                class="cv__input"
                :placeholder="`contact@${siteHost(community.website)}`"
                :aria-describedby="emailMismatch ? 'cv-email-err' : undefined"
                :aria-invalid="emailMismatch || undefined"
                @keyup.enter="sendCode"
              />
              <p v-if="emailMismatch" id="cv-email-err" class="cv__fieldErr">
                {{ t('communityVerify.domainMismatch', { host: siteHost(community.website) }) }}
              </p>
            </div>
            <button type="button" class="cv__primary" :disabled="!canSendCode" @click="sendCode">
              <v-progress-circular v-if="submitting" indeterminate size="16" width="2" color="white" />
              <template v-else>
                <v-icon icon="mdi-email-fast-outline" size="16" />
                {{ t('communityVerify.domainSend') }}
              </template>
            </button>
          </template>

          <template v-else>
            <p class="cv__body">
              {{ t('communityVerify.codeSent', { email: sentToAddress || claim?.proof_email }) }}
            </p>
            <div class="cv__field">
              <label class="cv__label" for="cv-code">{{ t('communityVerify.codeLabel') }}</label>
              <input
                id="cv-code"
                v-model="code"
                inputmode="numeric"
                maxlength="6"
                autocomplete="one-time-code"
                class="cv__input cv__input--code"
                @keyup.enter="submitCode"
              />
            </div>
            <div class="cv__row">
              <button type="button" class="cv__primary" :disabled="!canVerifyCode" @click="submitCode">
                <v-progress-circular v-if="submitting" indeterminate size="16" width="2" color="white" />
                <template v-else><v-icon icon="mdi-check" size="16" />{{ t('communityVerify.codeVerify') }}</template>
              </button>
              <button type="button" class="cv__link" :disabled="submitting" @click="sendCode">
                {{ t('communityVerify.codeResend') }}
              </button>
            </div>
          </template>
        </section>

        <!-- Discord: two ways in -->
        <section v-else-if="state.proof === 'discord'" class="cv__step">
          <h2 class="cv__stepTitle">{{ t('communityVerify.discordTitle') }}</h2>
          <p class="cv__body">{{ t('communityVerify.discordBody') }}</p>

          <div class="cv__routes">
            <div class="cv__route">
              <h3 class="cv__routeTitle">{{ t('communityVerify.discordBotTitle') }}</h3>
              <p class="cv__routeBody">{{ t('communityVerify.discordBotBody') }}</p>

              <template v-if="botToken">
                <p class="cv__routeBody">{{ t('communityVerify.discordBotRun') }}</p>
                <p class="cv__token"><code>/verify code:{{ botToken }}</code></p>
                <p class="cv__note">
                  <v-progress-circular indeterminate size="13" width="2" color="currentColor" />
                  {{ t('communityVerify.discordBotWaiting') }}
                </p>
              </template>
              <button v-else type="button" class="cv__secondary" :disabled="submitting" @click="getBotToken">
                {{ t('communityVerify.discordBotAction') }}
              </button>
            </div>

            <div class="cv__route">
              <h3 class="cv__routeTitle">{{ t('communityVerify.discordOauthTitle') }}</h3>
              <p class="cv__routeBody">{{ t('communityVerify.discordOauthBody') }}</p>
              <button type="button" class="cv__secondary" :disabled="submitting" @click="startDiscordOAuth">
                <PlatformIcon platform="discord" :size="16" />
                {{ t('communityVerify.discordOauthAction') }}
              </button>
            </div>
          </div>
        </section>

        <!-- Group: nothing to check automatically -->
        <section v-else class="cv__step">
          <h2 class="cv__stepTitle">{{ t('communityVerify.groupTitle') }}</h2>
          <p class="cv__body">{{ t('communityVerify.groupBody') }}</p>
          <div class="cv__field">
            <label class="cv__label" for="cv-reason">{{ t('communityVerify.groupLabel') }}</label>
            <textarea
              id="cv-reason"
              v-model="reason"
              maxlength="500"
              rows="4"
              class="cv__input cv__textarea"
              :placeholder="t('communityVerify.groupPlaceholder')"
            />
          </div>
          <button type="button" class="cv__primary" :disabled="submitting || !reason.trim()" @click="sendForReview">
            <v-progress-circular v-if="submitting" indeterminate size="16" width="2" color="white" />
            <template v-else><v-icon icon="mdi-send-outline" size="16" />{{ t('communityVerify.groupSend') }}</template>
          </button>
        </section>
      </template>

      <p v-if="errorMsg" class="cv__error" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="16" />
        {{ errorMsg }}
      </p>
    </template>
  </div>
</template>

<style scoped>
/* The page is the container. No card wrapping the whole thing: a border drawn
   around a page's entire contents is a border around nothing. */
.cv {
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 24px 24px 64px; max-width: 660px; margin: 0 auto; width: 100%;
}

.cv__back {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 40px; padding: 0 10px; margin-bottom: 18px; border-radius: 10px;
  font-size: 13px; font-weight: 700; color: var(--c-muted); text-decoration: none;
  transition: color .15s ease, background .15s ease;
}
.cv__back:hover { color: var(--c-text); background: var(--c-surface-2); }
.cv__back:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.cv__eyebrow {
  display: inline-flex; align-items: center; gap: 7px; margin: 0 0 6px;
  font-size: 12.5px; font-weight: 700; color: var(--c-muted);
}

/* 2.1rem against a 0.875rem body is well past the 1.25 step ratio; the page
   has one heading and it should read as one. */
.cv__title { margin: 0 0 14px; font-size: 2.1rem; font-weight: 800; line-height: 1.15; color: var(--c-text); }

.cv__lede { margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: var(--c-text); max-width: 54ch; }
.cv__body { margin: 0 0 16px; font-size: 13.5px; line-height: 1.65; color: var(--c-muted); max-width: 62ch; }
.cv__note {
  display: inline-flex; align-items: center; gap: 7px; margin: 12px 0 0;
  font-size: 12.5px; color: var(--c-muted);
}

/* Facts about what verification does. Bordered rows would make four tiles of
   three sentences; a list is what this is. */
.cv__unlocks { list-style: none; margin: 0 0 30px; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.cv__unlocks li {
  display: flex; align-items: flex-start; gap: 9px;
  font-size: 13.5px; line-height: 1.5; color: var(--c-text); max-width: 58ch;
}
.cv__unlocks .v-icon { color: var(--c-trade); flex-shrink: 0; margin-top: 2px; }

/* The proof step sits above a rule rather than inside a box: it is the next
   thing on the page, not a different kind of thing. */
.cv__step { width: 100%; padding-top: 26px; border-top: 1px solid var(--c-border); }
.cv__stepTitle {
  margin: 0 0 10px;
  font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--c-muted);
}

.cv__field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; max-width: 380px; width: 100%; }
.cv__label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.cv__input {
  width: 100%; background: var(--c-surface); color: var(--c-text);
  border: 1.5px solid var(--c-border); border-radius: 12px;
  padding: 11px 13px; font-size: 14px; font-family: inherit; outline: none;
  transition: border-color .15s ease;
}
.cv__input:focus { border-color: var(--c-trade); }
.cv__input::placeholder { color: var(--c-muted); opacity: .55; }
.cv__input[aria-invalid="true"] { border-color: #ef4444; }
.cv__textarea { resize: vertical; line-height: 1.5; }
/* A typed code is an identifier, so it reads in mono like every other one.
   Sized to the six digits it holds: a 380px box for six characters reads as a
   field you have failed to fill in. */
.cv__input--code {
  max-width: 190px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  letter-spacing: 0.4em; font-weight: 700; font-size: 18px; text-align: center;
  /* The tracking is trailing, so the glyphs sit a touch left of centre. */
  text-indent: 0.4em;
}
.cv__fieldErr { margin: 0; font-size: 12px; font-weight: 600; color: #ef4444; }

.cv__primary {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; padding: 0 20px; border-radius: 12px;
  background: var(--c-trade); color: #fff; border: none; cursor: pointer;
  font-size: 14px; font-weight: 700; text-decoration: none;
  transition: opacity .15s ease, transform .15s ease;
}
.cv__primary:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
.cv__primary:disabled { opacity: .4; pointer-events: none; }
.cv__primary:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.cv__secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 40px; padding: 0 16px; border-radius: 11px;
  background: transparent; color: var(--c-trade); cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--c-trade) 40%, transparent);
  font-size: 13px; font-weight: 700; text-decoration: none;
  transition: background .15s ease;
}
.cv__secondary:hover:not(:disabled) { background: color-mix(in srgb, var(--c-trade) 12%, transparent); }
.cv__secondary:disabled { opacity: .4; pointer-events: none; }
.cv__secondary:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

/* Primary action and its escape hatch on one line, which is what they are:
   one thing to do, and one way out if the code never arrived. */
.cv__row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; }

.cv__link {
  padding: 0; background: none; border: none; cursor: pointer;
  font-size: 12.5px; font-weight: 700; color: var(--c-muted);
}
.cv__link:hover { color: var(--c-text); text-decoration: underline; }
.cv__link:disabled { opacity: .4; pointer-events: none; }
.cv__link:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 4px; }

/* Two routes to the same proof, side by side because they are alternatives
   rather than steps. Separated by a rule, not boxed into two cards. */
.cv__routes { display: flex; flex-wrap: wrap; gap: 28px; }
.cv__route { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
.cv__routeTitle { margin: 0 0 6px; font-size: 14px; font-weight: 700; color: var(--c-text); }
.cv__routeBody { margin: 0 0 12px; font-size: 13px; line-height: 1.6; color: var(--c-muted); }

.cv__token { margin: 0 0 4px; }
.cv__token code {
  display: inline-block; padding: 9px 13px; border-radius: 10px;
  background: var(--c-surface-2); border: 1px solid var(--c-border);
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 14px; font-weight: 700; color: var(--c-text);
  user-select: all; word-break: break-all;
}

.cv__error {
  display: flex; align-items: center; gap: 8px; margin: 20px 0 0;
  padding: 10px 13px; border-radius: 11px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444; font-size: 12.5px; font-weight: 600;
}

.cv__dead { display: flex; flex-direction: column; align-items: flex-start; }

.cv__skeleton { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.cv__sk { display: block; border-radius: 8px; background: var(--c-skeleton); }
.cv__sk--title { height: 34px; width: 62%; }
.cv__sk--line  { height: 15px; width: 84%; }
.cv__sk--block { height: 130px; width: 100%; border-radius: 12px; }

@media (max-width: 600px) {
  .cv { padding: 16px 16px 48px; }
  .cv__title { font-size: 1.7rem; }
  /* One column: two 240px routes side by side on a phone is two cramped ones. */
  .cv__routes { flex-direction: column; gap: 22px; }
  .cv__primary, .cv__secondary { width: 100%; }
  .cv__field { max-width: none; }
}

@media (pointer: coarse) {
  .cv__back { min-height: 48px; }
  .cv__primary, .cv__secondary { min-height: 48px; }
}

@media (prefers-reduced-motion: reduce) {
  .cv__back, .cv__primary, .cv__secondary, .cv__input { transition: none; }
  .cv__primary:hover:not(:disabled) { transform: none; }
}
</style>
