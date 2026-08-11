<script setup>
// The review queue: the far end of every path that ends in "a person reads it".
//
// Two kinds of thing land here. Verification requests, from communities with
// nothing to check automatically (a play group has no domain and no server to
// hold a permission in) and from seeded shops with no email on file. And
// reports, which have been written to the database since the beginning with
// nothing ever reading them.
//
// Approving does not verify anyone. It stamps the same identity_verified_at
// that a domain code or a Discord permission would, and the owner carries on to
// checkout from where they left off. Manual review is a slower proof, not a
// cheaper one.
//
// There is no client-side admin check. The Edge Function holds the allowlist
// and answers 403; this page renders that answer.
import { ref, computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { useHead } from "@unhead/vue";
import { fetchQueue, decideClaim, resolveReport, fetchBillingConfig } from "@/lib/adminReview";
import { getCurrentSession, onAuthChange } from "@/lib/supabaseClient";
import { kindsOf, TYPE_KEYS } from "@/lib/communityKinds";
import CommunityKindIcon from "@/components/community/CommunityKindIcon.vue";

const { t, locale: i18nLocale } = useI18n();
const route = useRoute();
const localeParams = computed(() => ({ locale: route.params.locale || "en" }));

const loading = ref(true);
const denied = ref(null);      // "not_admin" | "not_authenticated" | null
const claims = ref([]);
const reports = ref([]);
const failed = ref(false);

// Which row is mid-decline, and what the reviewer is writing. Declining asks
// for a reason, approving does not: a yes needs no explanation, a no does.
const decliningId = ref(null);
const noteText = ref("");
const busyId = ref(null);

// What the server resolves the Stripe secrets to. Diagnostic, not queue work,
// so it sits at the bottom and never blocks the queue from rendering: a price
// lookup that fails should cost the reviewer nothing.
const billing = ref(null);

/** Minor units to something readable. Stripe stores 6000, people read 60. */
function money(currency, minor) {
  if (minor == null) return `${currency.toUpperCase()} ?`;
  const major = minor / 100;
  return `${currency.toUpperCase()} ${Number.isInteger(major) ? major : major.toFixed(2)}`;
}

/** Everything wrong with one price, in the order it would bite. */
function priceProblems(p) {
  if (!p) return [];
  if (!p.set) return [t("adminReview.billingNotSet")];
  if (p.error) return [p.error];
  const out = [];
  if (!p.active) out.push(t("adminReview.billingArchived"));
  if (p.missing?.length) out.push(t("adminReview.billingMissing", { list: p.missing.join(", ") }));
  return out;
}

function priceCurrencies(p) {
  if (!p?.amounts) return [];
  return Object.entries(p.amounts).map(([cur, minor]) => money(cur, minor));
}

useHead({ title: "Review queue", meta: [{ name: "robots", content: "noindex" }] });

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const res = await fetchQueue();
    if (res?.error) { denied.value = res.error; return; }
    denied.value = null;
    claims.value = res?.claims ?? [];
    reports.value = res?.reports ?? [];
    // Deliberately not awaited: the queue is the page, billing is a footnote.
    fetchBillingConfig()
      .then((cfg) => { if (!cfg?.error) billing.value = cfg; })
      .catch((e) => console.error("AdminReviewPage: billing config failed", e));
  } catch (e) {
    console.error("AdminReviewPage: load failed", e);
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await getCurrentSession();
  onAuthChange(() => load());
  load();
});

function startDecline(id) { decliningId.value = id; noteText.value = ""; }
function cancelDecline()  { decliningId.value = null; noteText.value = ""; }

async function decide(claim, decision) {
  if (busyId.value) return;
  const note = decision === "decline" ? noteText.value.trim() : "";
  if (decision === "decline" && !note) return;
  busyId.value = claim.id;
  failed.value = false;
  try {
    const res = await decideClaim(claim.id, decision, note);
    if (res?.error) throw new Error(res.error);
    claims.value = claims.value.filter((c) => c.id !== claim.id);
    cancelDecline();
  } catch (e) {
    console.error("AdminReviewPage: decide failed", e);
    failed.value = true;
  } finally {
    busyId.value = null;
  }
}

async function resolve(report, status) {
  if (busyId.value) return;
  busyId.value = `r${report.id}`;
  failed.value = false;
  try {
    const res = await resolveReport(report.id, status);
    if (res?.error) throw new Error(res.error);
    reports.value = reports.value.filter((r) => r.id !== report.id);
  } catch (e) {
    console.error("AdminReviewPage: resolve failed", e);
    failed.value = true;
  } finally {
    busyId.value = null;
  }
}

function when(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(i18nLocale.value, {
    day: "numeric", month: "short", year: "numeric",
  });
}

const isEmpty = computed(() => claims.value.length === 0 && reports.value.length === 0);
</script>

<template>
  <div class="ar">
    <h1 class="ar__title">{{ t('adminReview.title') }}</h1>

    <p v-if="loading" class="ar__state" role="status">{{ t('adminReview.loading') }}</p>

    <p v-else-if="denied === 'not_authenticated'" class="ar__state">{{ t('adminReview.signIn') }}</p>
    <p v-else-if="denied" class="ar__state">{{ t('adminReview.notAdmin') }}</p>

    <template v-else>
      <p v-if="failed" class="ar__failed" role="alert">{{ t('adminReview.failed') }}</p>

      <p v-if="isEmpty" class="ar__state">{{ t('adminReview.empty') }}</p>

      <!-- ── Verification requests ──────────────────────────────────── -->
      <section v-if="claims.length" class="ar__section">
        <h2 class="ar__h2">{{ t('adminReview.reviewsTitle') }}</h2>

        <article v-for="c in claims" :key="c.id" class="ar__row">
          <div class="ar__head">
            <router-link
              class="ar__name"
              :to="{ name: 'communityProfile', params: { ...localeParams, slug: c.community.slug } }"
              target="_blank"
            >{{ c.community.name }}</router-link>
            <span v-for="k in kindsOf(c.community)" :key="k" class="ar__kind">
              <CommunityKindIcon :kind="k" :size="12" />{{ t(TYPE_KEYS[k] ?? TYPE_KEYS.group) }}
            </span>
            <span class="ar__meta">
              {{ c.origin === 'self' ? t('adminReview.originCreated') : t('adminReview.originClaiming') }}
              · {{ when(c.manual_review_at) }}
            </span>
          </div>

          <p class="ar__said">{{ c.manual_review_reason }}</p>

          <div v-if="c.community.website || c.community.city" class="ar__facts">
            <a v-if="c.community.website" :href="c.community.website" target="_blank" rel="noopener noreferrer">
              {{ c.community.website }}
            </a>
            <span v-if="c.community.city">{{ c.community.city }}<template v-if="c.community.country">, {{ c.community.country }}</template></span>
          </div>

          <div v-if="decliningId === c.id" class="ar__decline">
            <label class="ar__label">
              {{ t('adminReview.declineNote') }}
              <textarea
                v-model="noteText"
                class="ar__textarea"
                maxlength="500"
                :placeholder="t('adminReview.declinePlaceholder')"
              />
            </label>
            <div class="ar__actions">
              <button
                type="button"
                class="ar__btn ar__btn--danger"
                :disabled="!noteText.trim() || busyId === c.id"
                @click="decide(c, 'decline')"
              >{{ t('adminReview.confirmDecline') }}</button>
              <button type="button" class="ar__link" @click="cancelDecline">{{ t('adminReview.cancel') }}</button>
            </div>
          </div>

          <div v-else class="ar__actions">
            <button
              type="button"
              class="ar__btn ar__btn--go"
              :disabled="busyId === c.id"
              @click="decide(c, 'approve')"
            >{{ t('adminReview.approve') }}</button>
            <button type="button" class="ar__link" @click="startDecline(c.id)">{{ t('adminReview.decline') }}</button>
          </div>
        </article>
      </section>

      <!-- ── Reports ────────────────────────────────────────────────── -->
      <section v-if="reports.length" class="ar__section">
        <h2 class="ar__h2">{{ t('adminReview.reportsTitle') }}</h2>

        <article v-for="r in reports" :key="r.id" class="ar__row">
          <div class="ar__head">
            <router-link
              class="ar__name"
              :to="{ name: 'communityProfile', params: { ...localeParams, slug: r.community.slug } }"
              target="_blank"
            >{{ r.community.name }}</router-link>
            <span class="ar__meta">{{ when(r.created_at) }}</span>
          </div>

          <p class="ar__said">{{ r.reason }}</p>

          <div class="ar__actions">
            <button
              type="button"
              class="ar__btn"
              :disabled="busyId === `r${r.id}`"
              @click="resolve(r, 'reviewed')"
            >{{ t('adminReview.markReviewed') }}</button>
            <button type="button" class="ar__link" @click="resolve(r, 'dismissed')">
              {{ t('adminReview.dismiss') }}
            </button>
          </div>
        </article>
      </section>

      <!-- ── Billing configuration ──────────────────────────────────────
           Not queue work. It is here because it is the only place in the
           product that can answer "are the Stripe prices actually wired up",
           and the alternative is finding out when a shop fails at Checkout. -->
      <section v-if="billing" class="ar__section ar__section--quiet">
        <h2 class="ar__h2">{{ t('adminReview.billingTitle') }}</h2>

        <div v-for="key in ['year', 'month']" :key="key" class="ar__row ar__bill">
          <div class="ar__billHead">
            <span class="ar__billName">{{ t(`communityVerify.plans.${key}.name`) }}</span>
            <span class="ar__mono">{{ billing[key].id ?? '—' }}</span>
            <span v-if="billing[key].livemode != null" class="ar__meta">
              {{ billing[key].livemode ? t('adminReview.billingLive') : t('adminReview.billingTest') }}
            </span>
          </div>
          <p v-if="priceCurrencies(billing[key]).length" class="ar__billPrices">
            {{ priceCurrencies(billing[key]).join(' · ') }}
          </p>
          <p v-for="problem in priceProblems(billing[key])" :key="problem" class="ar__failed">
            {{ problem }}
          </p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.ar { padding: 24px 24px 72px; max-width: 760px; margin: 0 auto; }

.ar__title { font-size: 1.5rem; font-weight: 800; color: var(--c-text); margin: 0 0 22px; letter-spacing: -0.015em; }
.ar__h2 { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-muted); margin: 0 0 4px; }

.ar__state { font-size: 14px; color: var(--c-muted); margin: 0; }
.ar__failed { font-size: 13px; color: var(--c-error, #ef4444); margin: 0 0 16px; }

.ar__section { margin-bottom: 40px; }

/* Rows divided by rules rather than boxed into cards: this is a list of things
   to read, and a border around each one would only repeat what the gap says. */
.ar__row { padding: 18px 0; border-top: 1px solid var(--c-border); }

.ar__head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 10px; }
.ar__name { font-size: 15px; font-weight: 700; color: var(--c-text); text-decoration: none; }
.ar__name:hover { text-decoration: underline; }
.ar__kind {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--c-muted);
}
.ar__kind .v-icon, .ar__kind .cpi-svg { color: var(--c-trade); }
.ar__meta { font-size: 12px; color: var(--c-muted); margin-left: auto; }

/* ── Billing configuration ────────────────────────────────────────────────
   A footnote, set quieter than the queue it sits under. */
.ar__section--quiet { margin-top: 8px; }
.ar__bill { padding: 14px 0; }
.ar__billHead { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 10px; }
.ar__billName { font-size: 13.5px; font-weight: 700; color: var(--c-text); }
/* A Stripe price id is an identifier, so it reads in mono like every other
   one on the site. */
.ar__mono {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 12px; color: var(--c-muted); word-break: break-all;
}
.ar__billPrices { margin: 6px 0 0; font-size: 12.5px; color: var(--c-muted); }

/* What the applicant wrote, in their words. */
.ar__said {
  margin: 0 0 10px; font-size: 14px; line-height: 1.6; color: var(--c-text);
  max-width: 62ch; white-space: pre-wrap;
}

.ar__facts { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-bottom: 12px; font-size: 12.5px; color: var(--c-muted); }
.ar__facts a { color: var(--c-trade); }

.ar__label { display: block; font-size: 12px; color: var(--c-muted); margin-bottom: 12px; }
.ar__textarea {
  /* Same measure as the text above it. A full-width box for two sentences
     reads as a form to fill in rather than a sentence to write. */
  display: block; margin-top: 6px; width: 100%; max-width: 62ch; min-height: 76px;
  padding: 9px 11px; font: inherit; font-size: 13.5px;
  background: var(--c-surface); color: var(--c-text);
  border: 1px solid var(--c-border); border-radius: 10px; resize: vertical;
}
.ar__textarea:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 1px; }

.ar__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; }

.ar__btn {
  padding: 8px 15px; border-radius: 9px; border: 1px solid var(--c-border);
  background: var(--c-surface); color: var(--c-text);
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.ar__btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--c-trade) 50%, var(--c-border)); }
.ar__btn--go { background: var(--c-trade); border-color: transparent; color: var(--c-on-accent); }
.ar__btn--danger { background: var(--c-error, #ef4444); border-color: transparent; color: #fff; }
.ar__btn:disabled { opacity: 0.45; cursor: default; }

.ar__link {
  background: none; border: none; padding: 0;
  font-size: 13px; color: var(--c-muted); cursor: pointer;
}
.ar__link:hover { color: var(--c-text); }
</style>
