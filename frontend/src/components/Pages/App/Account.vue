<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { getClient, updateTraderProfile, linkDiscordAccount, syncDiscordIdToTrader } from "@/lib/supabaseClient";
import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/countries";
import { fetchMyCommunities } from "@/lib/community";
import CommunityEditDialog from "@/components/community/CommunityEditDialog.vue";

const { t } = useI18n();

const props = defineProps({ login: { type: Object, default: null } });
const emit  = defineEmits(["logout"]);

// ── Profile state ─────────────────────────────────────────────────────────
const loading   = ref(false);
const saving    = ref(false);
const saved     = ref(false);
const errorMsg  = ref("");

const name        = ref("");
const countryCode = ref("");
const city        = ref("");
const tradeScope  = ref("worldwide");
const discordId       = ref(null);  // null = not linked, string = linked
const discordUsername = ref(null);  // Discord display name from session
const discordLinking  = ref(false);
const discordSyncing  = ref(false);
const discordSynced   = ref(false); // shows ✓ briefly after re-sync
const discordError    = ref("");

const SCOPES = computed(() => [
  { value: "local",     label: t('account.scopes.local'),     icon: "mdi-map-marker"  },
  { value: "national",  label: t('account.scopes.national'),  icon: "mdi-flag-outline" },
  { value: "worldwide", label: t('account.scopes.worldwide'), icon: "mdi-earth"        },
]);

const countryItems = COUNTRIES.map(c => ({ title: `${c.flag} ${c.name}`, value: c.code }));

const initials = computed(() => {
  const n = name.value.trim();
  if (!n) return "?";
  return n.split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();
});

const countryDisplay = computed(() => {
  const c = countryByCode(countryCode.value);
  return c ? `${c.flag} ${c.name}` : "";
});

// ── Trade history ─────────────────────────────────────────────────────────
const trades   = ref([]);
const loadingTrades = ref(false);

const statusMeta = computed(() => ({
  pending:   { label: t('account.status.pending'),   color: "var(--c-trade)"  },
  accepted:  { label: t('account.status.accepted'),  color: "var(--c-mutual)" },
  completed: { label: t('account.status.completed'), color: "var(--c-mutual)" },
  declined:  { label: t('account.status.declined'),  color: "var(--c-accent)" },
  cancelled: { label: t('account.status.cancelled'), color: "var(--c-muted)"  },
}));

async function loadProfile() {
  if (!props.login?.user?.id) return;
  loading.value = true;
  try {
    const { data } = await getClient()
      .from("Trader")
      .select("Name, country_code, City, trade_scope, discord_id")
      .eq("id", props.login.user.id)
      .single();
    if (data) {
      name.value        = data.Name        ?? "";
      countryCode.value = data.country_code ?? "";
      city.value        = data.City        ?? "";
      tradeScope.value  = data.trade_scope  ?? "worldwide";
      discordId.value   = data.discord_id   ?? null;
    }
    // Also read Discord username from current session identities (instant, no extra query)
    const discordIdentity = props.login?.user?.identities?.find(i => i.provider === 'discord');
    if (discordIdentity) {
      discordUsername.value = discordIdentity.identity_data?.full_name
        || discordIdentity.identity_data?.name
        || discordIdentity.identity_data?.preferred_username
        || null;
    }
  } finally {
    loading.value = false;
  }
}

async function loadTrades() {
  if (!props.login?.user?.id) return;
  loadingTrades.value = true;
  try {
    const { data } = await getClient().rpc("fetch_my_trade_history", { p_limit: 20 });
    trades.value = data ?? [];
  } finally {
    loadingTrades.value = false;
  }
}

async function saveProfile() {
  if (!props.login?.user?.id || saving.value) return;
  saving.value = true;
  saved.value  = false;
  errorMsg.value = "";
  try {
    const country = COUNTRIES.find(c => c.code === countryCode.value)?.name ?? "";
    const { error } = await updateTraderProfile(props.login.user.id, {
      name: name.value.trim(), countryCode: countryCode.value, country, city: city.value.trim(), tradeScope: tradeScope.value,
    });
    if (error) { errorMsg.value = error.message ?? "Save failed."; return; }
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } finally {
    saving.value = false;
  }
}

async function connectDiscord() {
  discordLinking.value = true;
  discordError.value = "";
  try {
    const { error } = await linkDiscordAccount();
    if (error) discordError.value = error.message ?? "Could not start Discord linking.";
    // On success the browser redirects to Discord — no further action needed here.
  } catch (err) {
    discordError.value = err?.message ?? "Unexpected error.";
    discordLinking.value = false;
  }
}

async function resyncDiscord() {
  discordSyncing.value = true;
  discordError.value = "";
  discordSynced.value = false;
  try {
    const identity = await syncDiscordIdToTrader();
    if (identity) {
      discordId.value = identity.id;
      discordUsername.value = identity.identity_data?.full_name
        || identity.identity_data?.name
        || identity.identity_data?.preferred_username
        || null;
      discordSynced.value = true;
      setTimeout(() => { discordSynced.value = false; }, 3000);
    } else {
      discordError.value = "No Discord identity found in your session. Try connecting again.";
    }
  } catch (err) {
    discordError.value = err?.message ?? "Re-sync failed.";
  } finally {
    discordSyncing.value = false;
  }
}

// ── My communities ───────────────────────────────────────────────────────
const communities        = ref([]);
const loadingCommunities = ref(false);
const editOpen           = ref(false);
const editing            = ref(null);

const KIND_LABELS = computed(() => ({
  store:   t('community.kindStore'),
  discord: t('community.kindDiscord'),
  group:   t('community.kindGroup'),
}));

async function loadCommunities() {
  if (!props.login?.user?.id) return;
  loadingCommunities.value = true;
  try {
    communities.value = await fetchMyCommunities();
  } finally {
    loadingCommunities.value = false;
  }
}

watch(() => props.login?.user?.id, (id) => {
  if (id) { loadProfile(); loadTrades(); loadCommunities(); }
}, { immediate: true });

const route = useRoute();
const locale = computed(() => route.params.locale || "en");

function statusStyle(status) {
  const color = status === "published" ? "var(--c-mutual)" : status === "hidden" ? "var(--c-accent)" : "var(--c-muted)";
  return { color, background: `color-mix(in srgb, ${color} 12%, transparent)` };
}

function openEditCommunity(row) {
  editing.value = row;
  editOpen.value = true;
}

function onCommunitySaved(row) {
  const idx = communities.value.findIndex(c => c.id === row.id);
  if (idx !== -1) communities.value[idx] = row;
}
</script>

<template>
  <div class="flex flex-col gap-5 py-4 md:py-8 max-w-2xl mx-auto">

    <!-- Profile card -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <!-- Header band -->
      <div class="h-1 w-full" style="background: linear-gradient(90deg, var(--c-trade), var(--c-accent))" />

      <div class="px-6 py-5 flex flex-col gap-5">

        <!-- Identity row -->
        <div class="flex items-center gap-4">
          <div
            class="size-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 select-none"
            style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1px solid color-mix(in srgb, var(--c-trade) 30%, transparent)"
          >
            <template v-if="loading">
              <div class="size-full rounded-2xl animate-pulse" style="background: var(--c-skeleton)" />
            </template>
            <span v-else>{{ initials }}</span>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-xl truncate" style="color: var(--c-text)">{{ name || login?.user?.email }}</span>
            <span class="text-sm mt-1" style="color: var(--c-muted)">
              {{ [countryDisplay, city].filter(Boolean).join(", ") || t('account.locationNotSet') }}
            </span>
          </div>
        </div>

        <!-- Edit form -->
        <div class="flex flex-col gap-3">
          <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--c-muted)">{{ t('account.profile') }}</p>

          <v-text-field
            v-model="name"
            :label="t('account.displayName')"
            variant="outlined"
            density="comfortable"
            hide-details
            prepend-inner-icon="mdi-account-outline"
            :disabled="loading || saving"
          />

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <v-autocomplete
              v-model="countryCode"
              :items="countryItems"
              :label="t('account.country')"
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              prepend-inner-icon="mdi-earth"
              :disabled="loading || saving"
            />
            <v-text-field
              v-model="city"
              :label="t('account.city')"
              variant="outlined"
              density="comfortable"
              hide-details
              prepend-inner-icon="mdi-map-marker-outline"
              :disabled="loading || saving"
            />
          </div>

          <!-- Trade scope -->
          <div class="flex flex-col gap-2">
            <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">{{ t('account.tradingRange') }}</p>
            <div class="flex gap-2">
              <button
                v-for="s in SCOPES"
                :key="s.value"
                type="button"
                class="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer"
                :style="tradeScope === s.value
                  ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)', borderColor: 'var(--c-accent)', color: 'var(--c-accent)' }
                  : { background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                :disabled="loading || saving"
                @click="tradeScope = s.value"
              >
                <v-icon :icon="s.icon" size="14" />
                {{ s.label }}
              </button>
            </div>
          </div>

          <v-alert v-if="errorMsg" type="error" variant="tonal" density="compact">{{ errorMsg }}</v-alert>

          <v-btn
            variant="flat"
            style="background: var(--c-accent); color: white"
            prepend-icon="mdi-content-save-outline"
            :loading="saving"
            :disabled="loading"
            @click="saveProfile"
          >{{ saved ? t('account.saved') : t('account.save') }}</v-btn>
        </div>
      </div>
    </div>

    <!-- My communities -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="px-5 py-4 flex items-center gap-2" style="border-bottom: 1px solid var(--c-border)">
        <v-icon icon="mdi-storefront-outline" size="16" color="var(--c-muted)" />
        <span class="text-sm font-semibold" style="color: var(--c-text)">{{ t('community.myCommunities') }}</span>
      </div>

      <div v-if="loadingCommunities" class="flex flex-col divide-y" style="border-color: var(--c-border)">
        <div v-for="i in 2" :key="i" class="flex items-center gap-3 px-5 py-3 animate-pulse">
          <div class="h-4 rounded w-32" style="background: var(--c-skeleton)" />
          <div class="h-5 rounded w-16 ml-auto" style="background: var(--c-skeleton)" />
        </div>
      </div>

      <div v-else-if="communities.length === 0" class="px-5 py-8 text-center text-sm" style="color: var(--c-muted)">
        <router-link :to="{ name: 'community', params: { locale } }" class="font-semibold" style="color: var(--c-accent)">
          {{ t('community.addYours') }}
        </router-link>
      </div>

      <div v-else class="flex flex-col divide-y" style="border-color: var(--c-border)">
        <div
          v-for="row in communities"
          :key="row.id"
          class="flex items-center gap-3 px-5 py-3 text-sm"
        >
          <div class="flex flex-col min-w-0" style="gap: 2px">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="font-semibold truncate" style="color: var(--c-text)">{{ row.name }}</span>
              <v-icon v-if="row.verified" icon="mdi-check-decagram" size="14" style="color: var(--c-mutual)" :title="t('community.verified')" />
            </div>
            <span class="text-xs truncate" style="color: var(--c-muted)">{{ KIND_LABELS[row.kind] ?? row.kind }}</span>
          </div>

          <span
            class="ml-auto shrink-0 text-xs font-semibold px-2 py-1 rounded-md"
            :style="{ textTransform: 'capitalize', ...statusStyle(row.status) }"
          >{{ row.status }}</span>

          <router-link
            :to="{ name: 'communityProfile', params: { locale, slug: row.slug } }"
            class="shrink-0 text-xs font-semibold"
            style="color: var(--c-trade)"
          >{{ t('community.manage') }}</router-link>

          <button
            type="button"
            class="shrink-0 flex items-center justify-center size-7 rounded-md cursor-pointer transition-colors"
            style="border: 1px solid var(--c-border); color: var(--c-muted)"
            :aria-label="t('community.editTitle')"
            :title="t('community.editTitle')"
            @click="openEditCommunity(row)"
          >
            <v-icon icon="mdi-pencil-outline" size="14" />
          </button>
        </div>
      </div>
    </div>

    <CommunityEditDialog v-model="editOpen" :community="editing" @saved="onCommunitySaved" />

    <!-- Trade history -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="px-5 py-4 flex items-center gap-2" style="border-bottom: 1px solid var(--c-border)">
        <v-icon icon="mdi-swap-horizontal" size="16" color="var(--c-muted)" />
        <span class="text-sm font-semibold" style="color: var(--c-text)">{{ t('account.tradeHistory') }}</span>
      </div>

      <div v-if="loadingTrades" class="flex flex-col divide-y" style="border-color: var(--c-border)">
        <div v-for="i in 4" :key="i" class="flex items-center gap-3 px-5 py-3 animate-pulse">
          <div class="h-4 rounded w-16" style="background: var(--c-skeleton)" />
          <div class="h-4 rounded w-32" style="background: var(--c-skeleton)" />
          <div class="h-5 rounded w-20 ml-auto" style="background: var(--c-skeleton)" />
        </div>
      </div>

      <div v-else-if="trades.length === 0" class="px-5 py-8 text-center text-sm" style="color: var(--c-muted)">
        {{ t('account.noHistory') }}
      </div>

      <div v-else class="flex flex-col divide-y" style="border-color: var(--c-border)">
        <div
          v-for="trade in trades"
          :key="trade.trade_id"
          class="flex items-center gap-3 px-5 py-3 text-sm"
        >
          <span class="font-mono text-xs shrink-0" style="color: var(--c-muted)">#{{ trade.trade_id }}</span>
          <span class="truncate" style="color: var(--c-text)">{{ trade.counterparty_name ?? t('common.anonymous') }}</span>
          <span
            class="ml-auto shrink-0 text-xs font-semibold px-2 py-1 rounded-md"
            :style="{ color: (statusMeta[trade.status] ?? statusMeta.pending).color, background: `color-mix(in srgb, ${(statusMeta[trade.status] ?? statusMeta.pending).color} 12%, transparent)` }"
          >{{ (statusMeta[trade.status] ?? statusMeta.pending).label }}</span>
        </div>
      </div>
    </div>

    <!-- Discord connection -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="flex items-center gap-2 px-5 py-4" style="border-bottom: 1px solid var(--c-border)">
        <svg width="16" height="16" viewBox="0 0 127.14 96.36" style="fill: var(--c-muted); flex-shrink:0">
          <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
        </svg>
        <span class="text-sm font-semibold" style="color: var(--c-text)">Discord</span>
      </div>

      <div class="flex items-center justify-between gap-4 px-5 py-4">
        <!-- Left: status text -->
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-sm font-semibold" style="color: var(--c-text)">
            {{ discordId ? 'Connected' : 'Not connected' }}
          </span>

          <!-- When linked: show username + discord_id for verification -->
          <template v-if="discordId">
            <span v-if="discordUsername" class="text-xs font-medium" style="color: #5865F2">
              @{{ discordUsername }}
            </span>
            <span class="text-xs font-mono truncate" style="color: var(--c-muted)" :title="discordId">
              ID: {{ discordId }}
            </span>
          </template>
          <span v-else class="text-xs" style="color: var(--c-muted)">
            Link your Discord account to post announces from the server
          </span>

          <v-alert v-if="discordError" type="error" variant="tonal" density="compact" class="mt-1 text-xs">
            {{ discordError }}
          </v-alert>
        </div>

        <!-- Right: action buttons -->
        <div class="flex flex-col items-end gap-2 shrink-0">

          <!-- Re-sync button (only when linked) -->
          <button
            v-if="discordId"
            id="discord-resync-btn"
            :disabled="discordSyncing"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
            style="border: 1px solid var(--c-border); background: transparent; color: var(--c-muted)"
            :style="discordSyncing ? { opacity: 0.6 } : {}"
            @click="resyncDiscord"
          >
            <v-icon
              :icon="discordSynced ? 'mdi-check-circle' : 'mdi-refresh'"
              size="13"
              :style="discordSynced ? { color: '#57f287' } : {}"
              :class="discordSyncing ? 'animate-spin' : ''"
            />
            {{ discordSynced ? 'Synced!' : discordSyncing ? 'Syncing…' : 'Re-sync' }}
          </button>

          <!-- Linked badge (alongside re-sync) -->
          <div
            v-if="discordId"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
            style="background: color-mix(in srgb, #57f287 12%, transparent); border: 1px solid color-mix(in srgb, #57f287 30%, transparent)"
          >
            <v-icon icon="mdi-check-circle" size="13" style="color: #57f287" />
            <span class="text-xs font-semibold" style="color: #57f287">Linked</span>
          </div>

          <!-- Connect button (when not linked) -->
          <button
            v-else
            id="discord-link-btn"
            :disabled="discordLinking || loading"
            class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-opacity"
            style="background: #5865F2; color: white; border: none;"
            :style="discordLinking ? { opacity: 0.6, cursor: 'not-allowed' } : {}"
            @click="connectDiscord"
          >
            <svg width="14" height="14" viewBox="0 0 127.14 96.36" fill="white">
              <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
            </svg>
            {{ discordLinking ? 'Redirecting…' : 'Connect Discord' }}
          </button>

        </div>
      </div>
    </div>

    <!-- Account settings -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="flex items-center justify-between px-5 py-4" style="border-bottom: 1px solid var(--c-border)">
        <div class="flex flex-col">
          <span class="text-sm font-semibold" style="color: var(--c-text)">{{ t('account.emailAddress') }}</span>
          <span class="text-xs mt-1" style="color: var(--c-muted)">{{ login?.user?.email ?? "—" }}</span>
        </div>
        <v-icon icon="mdi-email-outline" size="18" color="var(--c-muted)" />
      </div>

      <div class="flex items-center justify-between px-5 py-4">
        <div class="flex flex-col">
          <span class="text-sm font-semibold" style="color: var(--c-text)">{{ t('userMenu.signOut') }}</span>
        </div>
        <v-btn
          size="small"
          variant="outlined"
          prepend-icon="mdi-logout"
          style="border-color: var(--c-accent); color: var(--c-accent)"
          @click="$emit('logout')"
        >{{ t('userMenu.signOut') }}</v-btn>
      </div>
    </div>

  </div>
</template>
