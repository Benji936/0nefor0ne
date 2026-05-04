<script setup>
</script>

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
            class="size-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0 select-none"
            style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); border: 1.5px solid color-mix(in srgb, var(--c-trade) 30%, transparent)"
          >{{ initials }}</div>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-lg leading-tight truncate" style="color: var(--c-text)">
              {{ profile.Name || 'No name set' }}
            </span>
            <span class="text-sm mt-0.5" style="color: var(--c-muted)">
              {{ [profile.City, profile.Country].filter(Boolean).join(', ') || 'Location not set' }}
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
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">City</label>
                <input
                  v-model="draft.City"
                  class="rounded-lg px-3 py-2 text-sm border outline-none transition-colors"
                  :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                  placeholder="Your city"
                  @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
                  @blur="e => e.target.style.borderColor = 'var(--c-border)'"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Country</label>
                <input
                  v-model="draft.Country"
                  class="rounded-lg px-3 py-2 text-sm border outline-none transition-colors"
                  :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
                  placeholder="Your country"
                  @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
                  @blur="e => e.target.style.borderColor = 'var(--c-border)'"
                />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">Phone</label>
                <div class="flex gap-2">
                  <select
                    v-model="draft.Phone_region"
                    class="rounded-lg px-2 py-2 text-sm border outline-none shrink-0 cursor-pointer"
                    :style="{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                  >
                    <option value="41">+41</option>
                    <option value="33">+33</option>
                  </select>
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

export default {
  props: ['login'],
  emits: ['logout'],

  data() {
    return {
      profile: { Name: '', City: '', Country: '', Phone_number: null, Phone_region: '41' },
      draft:   { Name: '', City: '', Country: '', Phone_number: null, Phone_region: '41' },
      editing: false,
      saving:  false,
      saveError: '',
      loadingStats: true,
      tradeCount:    0,
      wishCount:     0,
      completedCount: 0,
      snackbar: { open: false, message: '', color: '', icon: '' },
    };
  },

  computed: {
    initials() {
      const name = this.profile.Name?.trim();
      if (!name) return '?';
      return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
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
    startEdit() {
      this.draft = { ...this.profile };
      this.saveError = '';
      this.editing = true;
    },
    cancelEdit() {
      this.editing = false;
      this.saveError = '';
    },
    async saveProfile() {
      this.saving = true;
      this.saveError = '';
      try {
        const { error } = await getClient()
          .from('Trader')
          .update({
            Name:         this.draft.Name,
            City:         this.draft.City,
            Country:      this.draft.Country,
            Phone_number: this.draft.Phone_number ? Number(this.draft.Phone_number) : null,
            Phone_region: this.draft.Phone_region,
          })
          .eq('id', this.login.user.id);
        if (error) throw error;
        this.profile = { ...this.draft };
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

    const [traderRes, cardsRes, tradesRes] = await Promise.all([
      getClient().from('Trader').select('Name, City, Country, Phone_number, Phone_region').eq('id', userId).single(),
      getClient().from('Card').select('wish').eq('trader', userId).neq('status', 'traded').neq('status', 'locked'),
      getClient().from('Trade').select('id', { count: 'exact', head: true })
        .or(`user1.eq.${userId},user2.eq.${userId}`)
        .eq('status', 'completed'),
    ]);

    if (traderRes.data) {
      this.profile = {
        Name:         traderRes.data.Name         ?? '',
        City:         traderRes.data.City         ?? '',
        Country:      traderRes.data.Country      ?? '',
        Phone_number: traderRes.data.Phone_number ?? null,
        Phone_region: traderRes.data.Phone_region ?? '41',
      };
    }

    if (cardsRes.data) {
      this.tradeCount = cardsRes.data.filter(c => !c.wish).length;
      this.wishCount  = cardsRes.data.filter(c =>  c.wish).length;
    }

    this.completedCount = tradesRes.count ?? 0;
    this.loadingStats   = false;
  },
};
</script>

<style scoped>
.form-slide-enter-active { transition: all 0.2s ease-out; }
.form-slide-leave-active { transition: all 0.15s ease-in; }
.form-slide-enter-from,
.form-slide-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
