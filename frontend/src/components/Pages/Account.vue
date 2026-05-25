<script setup>
import { ref, computed, watch, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { getClient, updateTraderProfile } from "@/lib/supabaseClient";
import { COUNTRIES } from "@/lib/countries";
import { countryByCode } from "@/lib/countries";

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
      .select("Name, country_code, City, trade_scope")
      .eq("id", props.login.user.id)
      .single();
    if (data) {
      name.value        = data.Name        ?? "";
      countryCode.value = data.country_code ?? "";
      city.value        = data.City        ?? "";
      tradeScope.value  = data.trade_scope  ?? "worldwide";
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

watch(() => props.login?.user?.id, (id) => {
  if (id) { loadProfile(); loadTrades(); }
}, { immediate: true });
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
