<template>
  <div class="flex flex-col gap-6 py-6 max-w-2xl mx-auto">

    <!-- ── Profile card ──────────────────────────────────────────────────── -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">

      <!-- Header band -->
      <div class="h-1.5 w-full" style="background: linear-gradient(90deg, var(--c-accent), var(--c-trade))" />

      <div class="flex flex-col gap-6 px-6 py-5">

        <!-- Avatar + identity -->
        <div class="flex items-center gap-4">
          <div
            class="relative size-16 rounded-2xl shrink-0 overflow-hidden border-1.5 flex items-center justify-center select-none"
            style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1.5px solid color-mix(in srgb, var(--c-trade) 30%, transparent)"
          >
            <template v-if="editing ? (avatarPreview || draft.avatar_url) : profile.avatar_url">
              <img
                :src="editing ? (avatarPreview || draft.avatar_url) : profile.avatar_url"
                alt="Profile photo"
                class="w-full h-full object-cover"
              />
            </template>
            <span v-else class="text-2xl font-bold" style="color: var(--c-trade)">{{ initials }}</span>

            <template v-if="editing">
              <input
                ref="avatarInput"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="hidden"
                @change="onAvatarSelected"
              />
              <button
                type="button"
                class="absolute inset-x-0 bottom-0 flex justify-center pb-1 cursor-pointer"
                :disabled="uploadingAvatar"
                @click="$refs.avatarInput.click()"
              >
                <span class="rounded-full bg-black/70 text-white text-[10px] px-2 py-1 select-none">
                  {{ uploadingAvatar ? 'Uploading…' : 'Change photo' }}
                </span>
              </button>
            </template>
          </div>
          <div class="flex flex-col grow min-w-0">
            <span class="font-bold text-lg leading-tight truncate" style="color: var(--c-text)">
              {{ profile.Name || 'No name set' }}
            </span>
            <span class="text-sm mt-0.5 flex items-center gap-1.5 flex-wrap" style="color: var(--c-muted)">
              <template v-if="profileCountry">
                <span>{{ profileCountry.flag }}</span>
                <span>{{ [profile.City, profileCountry.name].filter(Boolean).join(', ') }}</span>
              </template>
              <span v-else>{{ profile.City || 'Location not set' }}</span>
              <span
                v-if="profile.trade_scope && profile.trade_scope !== 'worldwide'"
                class="text-[10px] font-semibold px-2 py-1 rounded-md border"
                :style="{ borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
              >{{ profile.trade_scope === 'national' ? 'National only' : 'Local only' }}</span>
            </span>
          </div>
          <v-btn
            class="ml-auto shrink-0"
            :variant="editing ? 'flat' : 'outlined'"
            size="small"
            :prepend-icon="editing ? 'mdi-close' : 'mdi-pencil-outline'"
            :style="editing
              ? 'border-color: var(--c-border); color: var(--c-muted)'
              : 'border-color: var(--c-border); color: var(--c-muted)'"
            @click="editing ? cancelEdit() : startEdit()"
          >{{ editing ? 'Cancel' : 'Edit' }}</v-btn>
        </div>

        <!-- Edit form -->
        <transition name="form-slide">
          <div v-if="editing" class="flex flex-col gap-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <!-- Display name -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Display name</label>
                <input
                  v-model="draft.Name"
                  class="rounded-lg px-3 py-2 text-sm border outline-none transition-colors"
                  :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                  placeholder="Your name"
                  @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
                  @blur="e => e.target.style.borderColor = 'var(--c-border)'"
                />
              </div>

              <!-- Country -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Country</label>
                <v-autocomplete
                  v-model="draft.country_code"
                  :items="countryItems"
                  item-title="title"
                  item-value="value"
                  placeholder="Search country…"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  :menu-props="{ maxHeight: 220 }"
                  @update:model-value="onCountryChange"
                />
              </div>

              <!-- City — combobox so custom cities are allowed -->
              <div class="flex flex-col gap-1 sm:col-span-2">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">City</label>
                <v-combobox
                  v-model="draft.City"
                  :items="draftCityItems"
                  placeholder="Your city"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  :no-filter="false"
                  :menu-props="{ maxHeight: 220 }"
                  :disabled="!draft.country_code"
                  :hint="!draft.country_code ? 'Select a country first' : ''"
                  :persistent-hint="!draft.country_code"
                />
              </div>

              <!-- Phone -->
              <div class="flex flex-col gap-1 sm:col-span-2">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Phone</label>
                <div class="flex gap-2">
                  <!-- Dial code autocomplete -->
                  <v-autocomplete
                    v-model="draft.Phone_region"
                    :items="dialCodeItems"
                    item-title="title"
                    item-value="value"
                    placeholder="+…"
                    density="compact"
                    variant="outlined"
                    hide-details
                    :menu-props="{ maxHeight: 220 }"
                    style="max-width: 130px"
                  />
                  <input
                    v-model="draft.Phone_number"
                    class="rounded-lg px-3 py-2 text-sm border outline-none flex-1 min-w-0 transition-colors"
                    :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                    placeholder="Phone number"
                    type="tel"
                    @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
                    @blur="e => e.target.style.borderColor = 'var(--c-border)'"
                  />
                </div>
              </div>

            </div>

            <!-- Trade scope -->
            <div class="flex flex-col gap-2 pt-1">
              <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Trade range</label>
              <div class="flex gap-2">
                <button
                  v-for="opt in tradeScopes"
                  :key="opt.value"
                  class="flex-1 flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center cursor-pointer transition-all"
                  :style="draft.trade_scope === opt.value
                    ? { borderColor: 'var(--c-trade)', backgroundColor: 'color-mix(in srgb, var(--c-trade) 10%, transparent)', color: 'var(--c-trade)' }
                    : { borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-muted)' }"
                  @click="draft.trade_scope = opt.value"
                >
                  <v-icon :icon="opt.icon" size="16" />
                  <span class="text-[11px] font-semibold">{{ opt.label }}</span>
                  <span class="text-[10px] opacity-70 leading-tight">{{ opt.hint }}</span>
                </button>
              </div>
            </div>

            <div class="flex justify-end pt-1">
              <v-btn
                variant="flat"
                size="small"
                prepend-icon="mdi-check"
                :loading="saving"
                style="background-color: var(--c-trade); color: white"
                @click="saveProfile"
              >Save changes</v-btn>
            </div>

            <!-- Save error -->
            <p v-if="saveError" class="text-xs" style="color: var(--c-accent)">{{ saveError }}</p>
          </div>
        </transition>

        <!-- Static phone row (not editing) -->
        <div
          v-if="!editing && profile.Phone_number"
          class="flex items-center gap-2 text-sm"
          style="color: var(--c-muted)"
        >
          <v-icon icon="mdi-phone-outline" size="15" />
          +{{ profile.Phone_region }} {{ profile.Phone_number }}
        </div>

      </div>
    </div>

    <!-- ── Stats ─────────────────────────────────────────────────────────── -->
    <div>
      <h2 class="text-xs font-bold uppercase tracking-widest mb-3" style="color: var(--c-muted)">Your activity</h2>
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="flex flex-col gap-1 rounded-xl border px-4 py-3"
          style="background: var(--c-surface); border-color: var(--c-border)"
        >
          <div class="flex items-center gap-1.5">
            <v-icon :icon="stat.icon" size="14" :color="stat.color" />
            <span class="text-[11px] font-semibold uppercase tracking-wide" :style="{ color: stat.color }">{{ stat.label }}</span>
          </div>
          <span
            v-if="loadingStats"
            class="h-6 w-10 rounded animate-pulse mt-0.5"
            style="background: var(--c-skeleton); display: block"
          />
          <span v-else class="text-2xl font-bold tabular-nums leading-tight" style="color: var(--c-text)">
            {{ stat.value }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Trade history ────────────────────────────────────────────────── -->
    <div>
      <h2 class="text-xs font-bold uppercase tracking-widest mb-3" style="color: var(--c-muted)">Trade history</h2>

      <!-- Skeleton -->
      <div v-if="loadingHistory" class="flex flex-col gap-2">
        <div
          v-for="i in 4" :key="i"
          class="flex items-center gap-3 rounded-xl px-4 py-3 border animate-pulse"
          :style="{ background: 'var(--c-surface)', borderColor: 'var(--c-border)', opacity: 1 - (i-1)*0.15 }"
        >
          <div class="size-7 rounded-full shrink-0" style="background:var(--c-skeleton)" />
          <div class="flex flex-col gap-1.5 grow">
            <div class="h-3 rounded w-1/3" style="background:var(--c-skeleton)" />
            <div class="h-2.5 rounded w-1/5" style="background:var(--c-skeleton)" />
          </div>
          <div class="h-5 w-16 rounded-lg" style="background:var(--c-skeleton)" />
        </div>
      </div>

      <!-- Empty -->
      <div
        v-else-if="tradeHistory.length === 0"
        class="flex flex-col items-center gap-2 py-10 rounded-2xl border"
        style="background: var(--c-surface); border-color: var(--c-border)"
      >
        <v-icon icon="mdi-history" size="30" color="var(--c-muted)" />
        <p class="text-sm" style="color: var(--c-muted)">No trades yet.</p>
      </div>

      <!-- List -->
      <div v-else class="flex flex-col rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
        <div
          v-for="(trade, idx) in tradeHistory"
          :key="trade.trade_id"
          class="flex items-center gap-3 px-4 py-3"
          :style="idx < tradeHistory.length - 1 ? 'border-bottom: 1px solid var(--c-border)' : ''"
        >
          <!-- Status icon -->
          <div
            class="size-7 rounded-full flex items-center justify-center shrink-0"
            :style="{
              background: `color-mix(in srgb, ${historyMeta(trade.status).color} 14%, transparent)`,
              color: historyMeta(trade.status).color,
            }"
          >
            <v-icon :icon="historyMeta(trade.status).icon" size="14" />
          </div>

          <!-- Name + date -->
          <div class="flex flex-col grow min-w-0">
            <span class="text-sm font-semibold truncate" style="color: var(--c-text)">
              {{ trade.counterparty_name ?? 'Unknown trader' }}
            </span>
            <span class="text-[11px]" style="color: var(--c-muted)">
              {{ historyMeta(trade.status).label }} · {{ formatDate(trade.created_at) }}
            </span>
          </div>

          <!-- Card count pill -->
          <span
            class="text-[11px] font-semibold px-2 py-0.5 rounded-md border shrink-0 tabular-nums"
            :style="{
              color: historyMeta(trade.status).color,
              borderColor: `color-mix(in srgb, ${historyMeta(trade.status).color} 30%, transparent)`,
              background: `color-mix(in srgb, ${historyMeta(trade.status).color} 8%, transparent)`,
            }"
          >{{ trade.card_count }} {{ trade.card_count === 1 ? 'card' : 'cards' }}</span>
        </div>
      </div>
    </div>

    <!-- ── Account ───────────────────────────────────────────────────────── -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="flex flex-col gap-0">

        <div class="flex items-center justify-between px-5 py-4" style="border-bottom: 1px solid var(--c-border)">
          <div class="flex flex-col">
            <span class="text-sm font-semibold" style="color: var(--c-text)">Email address</span>
            <span class="text-xs mt-0.5" style="color: var(--c-muted)">{{ login?.user?.email ?? '—' }}</span>
          </div>
          <v-icon icon="mdi-email-outline" size="18" color="var(--c-muted)" />
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div class="flex flex-col">
            <span class="text-sm font-semibold" style="color: var(--c-text)">Sign out</span>
            <span class="text-xs mt-0.5" style="color: var(--c-muted)">End your current session</span>
          </div>
          <v-btn
            size="small"
            variant="outlined"
            prepend-icon="mdi-logout"
            style="border-color: var(--c-accent); color: var(--c-accent)"
            @click="$emit('logout')"
          >Sign out</v-btn>
        </div>

      </div>
    </div>

  </div>

  <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
    <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
    {{ snackbar.message }}
  </v-snackbar>
</template>

<script>
import { getClient } from '@/lib/supabaseClient';
import { COUNTRY_ITEMS, DIAL_CODE_ITEMS, countryByCode } from '@/lib/countries';
import { citiesForCountry } from '@/lib/cities';

const EMPTY_PROFILE = () => ({
  Name: '', City: '', Country: '',
  country_code: null, trade_scope: 'worldwide',
  Phone_number: null, Phone_region: '41',
  avatar_url: null,
});

export default {
  props: ['login'],
  emits: ['logout'],

  data() {
    return {
      profile:    EMPTY_PROFILE(),
      draft:      EMPTY_PROFILE(),
      editing:    false,
      saving:     false,
      saveError:  '',
      uploadingAvatar: false,
      avatarPreview: null,
      loadingStats:   true,
      loadingHistory: true,
      tradeCount:     0,
      wishCount:      0,
      completedCount: 0,
      tradeHistory:   [],
      snackbar: { open: false, message: '', color: '', icon: '' },
      countryItems:  COUNTRY_ITEMS,
      dialCodeItems: DIAL_CODE_ITEMS,
      tradeScopes: [
        { value: 'local',     label: 'Local',     icon: 'mdi-map-marker',          hint: 'Same city' },
        { value: 'national',  label: 'National',  icon: 'mdi-flag-outline',         hint: 'Same country' },
        { value: 'worldwide', label: 'Worldwide', icon: 'mdi-earth',                hint: 'Anywhere' },
      ],
    };
  },

  computed: {
    initials() {
      const name = this.profile.Name?.trim();
      if (!name) return '?';
      return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    },
    profileCountry() {
      return countryByCode(this.profile.country_code);
    },
    draftCityItems() {
      return citiesForCountry(this.draft.country_code);
    },
    stats() {
      return [
        { label: 'For trade',  icon: 'mdi-cards-outline',     color: 'var(--c-trade)',  value: this.tradeCount },
        { label: 'Wishlist',   icon: 'mdi-heart-outline',      color: 'var(--c-accent)', value: this.wishCount },
        { label: 'Completed',  icon: 'mdi-handshake-outline',  color: 'var(--c-mutual)', value: this.completedCount },
      ];
    },
  },

  methods: {
    historyMeta(status) {
      return {
        completed: { label: 'Completed', icon: 'mdi-handshake',             color: 'var(--c-mutual)' },
        cancelled: { label: 'Cancelled', icon: 'mdi-cancel',                color: 'var(--c-muted)'  },
        declined:  { label: 'Declined',  icon: 'mdi-close-circle-outline',  color: 'var(--c-accent)' },
      }[status] ?? { label: status, icon: 'mdi-help-circle-outline', color: 'var(--c-muted)' };
    },
    formatDate(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    },
    onCountryChange(code) {
      // Clear city when country changes — it likely no longer applies
      this.draft.City = null;
      // Auto-fill dial code from the selected country if phone region is empty
      if (code) {
        const country = countryByCode(code);
        if (country && !this.draft.Phone_number) {
          this.draft.Phone_region = country.dialCode;
        }
      }
    },
    startEdit() {
      this.draft = { ...this.profile };
      this.avatarPreview = null;
      this.saveError = '';
      this.editing = true;
    },
    cancelEdit() {
      this.editing = false;
      this.avatarPreview = null;
      this.saveError = '';
    },
    async onAvatarSelected(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.saveError = 'Please upload a valid image file.';
        return;
      }
      if (!this.login?.user?.id) {
        this.saveError = 'Unable to upload without a signed-in user.';
        return;
      }

      this.uploadingAvatar = true;
      this.saveError = '';
      try {
        const userId = this.login.user.id;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${userId}/avatar-${Date.now()}.${ext}`;

        const { error: storageError } = await getClient()
          .storage.from('profile-avatars')
          .upload(path, file, { contentType: file.type, upsert: true });
        if (storageError) throw storageError;

        const { data: urlData } = getClient()
          .storage.from('profile-avatars')
          .getPublicUrl(path);

        this.draft.avatar_url = urlData.publicUrl;
        this.avatarPreview = urlData.publicUrl;
        this.snackbar = { open: true, message: 'Profile photo uploaded.', color: 'var(--c-mutual)', icon: 'mdi-check-circle' };
      } catch (err) {
        this.saveError = err.message ?? 'Failed to upload photo.';
      } finally {
        this.uploadingAvatar = false;
        event.target.value = '';
      }
    },
    async saveProfile() {
      this.saving = true;
      this.saveError = '';
      try {
        // Resolve the display name from the selected country code
        const country = countryByCode(this.draft.country_code);

        const { error } = await getClient()
          .from('Trader')
          .update({
            Name:         this.draft.Name,
            City:         this.draft.City,
            Country:      country?.name ?? null,
            country_code: this.draft.country_code ?? null,
            trade_scope:  this.draft.trade_scope,
            Phone_number: this.draft.Phone_number ? Number(this.draft.Phone_number) : null,
            Phone_region: this.draft.Phone_region,
            avatar_url:   this.draft.avatar_url ?? null,
          })
          .eq('id', this.login.user.id);
        if (error) throw error;

        this.profile = { ...this.draft, Country: country?.name ?? '' };
        this.editing = false;
        this.snackbar = { open: true, message: 'Profile saved.', color: 'var(--c-mutual)', icon: 'mdi-check-circle' };
      } catch (err) {
        this.saveError = err.message ?? 'Failed to save.';
      } finally {
        this.saving = false;
      }
    },
  },

  async mounted() {
    if (!this.login?.user?.id) return;
    const userId = this.login.user.id;

    const [traderRes, cardsRes, tradesRes, historyRes] = await Promise.all([
      getClient().from('Trader')
        .select('Name, City, Country, country_code, trade_scope, Phone_number, Phone_region')
        .eq('id', userId).single(),
      getClient().from('Card').select('wish')
        .eq('trader', userId).neq('status', 'traded').neq('status', 'locked'),
      getClient().from('Trade').select('id', { count: 'exact', head: true })
        .or(`user1.eq.${userId},user2.eq.${userId}`)
        .eq('status', 'completed'),
      getClient().rpc('fetch_my_trade_history', { p_limit: 15 }),
    ]);

    if (traderRes.data) {
      this.profile = {
        Name:         traderRes.data.Name         ?? '',
        City:         traderRes.data.City         ?? '',
        Country:      traderRes.data.Country      ?? '',
        country_code: traderRes.data.country_code ?? null,
        trade_scope:  traderRes.data.trade_scope  ?? 'worldwide',
        Phone_number: traderRes.data.Phone_number ?? null,
        Phone_region: traderRes.data.Phone_region ?? '41',
        avatar_url:   traderRes.data.avatar_url ?? null,
      };
    }

    if (cardsRes.data) {
      this.tradeCount = cardsRes.data.filter(c => !c.wish).length;
      this.wishCount  = cardsRes.data.filter(c =>  c.wish).length;
    }

    this.completedCount = tradesRes.count ?? 0;
    this.tradeHistory   = historyRes.data ?? [];
    this.loadingStats   = false;
    this.loadingHistory = false;
  },
};
</script>

<style scoped>
.form-slide-enter-active { transition: all 0.2s ease-out; }
.form-slide-leave-active { transition: all 0.15s ease-in; }
.form-slide-enter-from,
.form-slide-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
