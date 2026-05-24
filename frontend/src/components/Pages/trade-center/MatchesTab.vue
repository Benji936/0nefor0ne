<script setup>
import UserCard from "@/components/UserCard.vue";

defineProps({
  login:             { type: Object,  default: null },
  loading:           { type: Boolean, default: false },
  allMatchesCount:   { type: Number,  default: 0 },
  matchSearch:       { type: String,  default: "" },
  locationCountry:   { type: String,  default: "" },
  locationCity:      { type: String,  default: "" },
  availableCountries:{ type: Array,   default: () => [] },
  filterCardName:    { type: String,  default: "" },
  buckets:           { type: Object,  required: true },
  totalMatches:      { type: Number,  default: 0 },
});

const emit = defineEmits([
  "update:matchSearch",
  "update:locationCountry",
  "update:locationCity",
  "clearFilter",
  "openTrade",
  "openProfile",
]);
</script>

<template>
  <!-- Not logged in -->
  <div v-if="!login" class="flex flex-col items-center gap-3 py-16 text-center">
    <v-icon icon="mdi-lock-outline" size="36" color="var(--c-muted)" />
    <p class="text-sm" style="color: var(--c-muted)">Log in to see your trade matches.</p>
  </div>

  <template v-else>
    <!-- Search bar -->
    <div v-if="!loading && allMatchesCount > 0" class="relative">
      <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
      <input
        :value="matchSearch"
        placeholder="Filter by card or trader name…"
        class="w-full rounded-xl pl-9 pr-4 py-3 text-sm border outline-none transition-colors"
        :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
        @input="emit('update:matchSearch', $event.target.value)"
        @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
        @blur="e => e.target.style.borderColor = 'var(--c-border)'"
      />
      <button
        v-if="matchSearch"
        class="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-opacity hover:opacity-70"
        style="color: var(--c-muted)"
        @click="emit('update:matchSearch', '')"
      >
        <v-icon icon="mdi-close" size="14" />
      </button>
    </div>

    <!-- Location filters -->
    <div v-if="!loading && allMatchesCount > 0" class="flex flex-wrap items-center gap-2">
      <select
        :value="locationCountry"
        class="flex-1 min-w-[120px] rounded-xl px-3 py-2 text-sm border outline-none transition-colors cursor-pointer"
        :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: locationCountry ? 'var(--c-text)' : 'var(--c-muted)' }"
        @change="emit('update:locationCountry', $event.target.value)"
      >
        <option value="">All countries</option>
        <option v-for="c in availableCountries" :key="c" :value="c">{{ c }}</option>
      </select>

      <div class="relative flex-1 min-w-[100px]">
        <input
          :value="locationCity"
          placeholder="City"
          class="w-full rounded-xl pl-3 pr-3 py-2 text-sm border outline-none transition-colors"
          :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
          @input="emit('update:locationCity', $event.target.value)"
          @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
          @blur="e => e.target.style.borderColor = 'var(--c-border)'"
        />
      </div>

      <button
        v-if="locationCountry || locationCity"
        class="text-xs transition-opacity hover:opacity-70 cursor-pointer"
        style="color: var(--c-accent)"
        @click="emit('update:locationCountry', ''); emit('update:locationCity', '')"
      >clear filters</button>
    </div>

    <!-- Card filter notice -->
    <div v-if="filterCardName" class="flex items-center gap-2 text-sm" style="color: var(--c-muted)">
      <v-icon icon="mdi-magnify" size="15" />
      Traders with:
      <span class="font-semibold" style="color: var(--c-text)">{{ filterCardName }}</span>
      <button
        class="ml-1 cursor-pointer transition-opacity hover:opacity-70"
        style="color: var(--c-accent)"
        @click="emit('clearFilter')"
      >clear</button>
    </div>

    <!-- Skeleton -->
    <template v-if="loading">
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          v-for="i in 6" :key="i"
          class="flex flex-col rounded-2xl border overflow-hidden"
          :style="{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)', opacity: 1 - (i - 1) * 0.1 }"
        >
          <div class="h-[3px] w-full animate-pulse" style="background: var(--c-skeleton)" />
          <div class="flex items-center gap-3 px-4 pt-3 pb-2">
            <div class="size-9 rounded-full shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
            <div class="flex flex-col gap-2 grow">
              <div class="h-4 rounded animate-pulse" style="background: var(--c-skeleton); width: 54%" />
              <div class="h-3 rounded animate-pulse" style="background: var(--c-skeleton); width: 38%" />
            </div>
            <div class="h-5 w-16 rounded-lg shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
          </div>
          <div class="mx-4 mb-3 h-24 rounded-xl animate-pulse" style="background: var(--c-skeleton)" />
          <div class="flex items-center justify-between px-4 pb-4">
            <div class="flex gap-2">
              <div class="h-5 w-9 rounded-md animate-pulse" style="background: var(--c-skeleton)" />
              <div class="h-5 w-9 rounded-md animate-pulse" style="background: var(--c-skeleton)" />
            </div>
            <div class="h-8 w-20 rounded-lg animate-pulse" style="background: var(--c-skeleton)" />
          </div>
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else-if="totalMatches === 0" class="flex flex-col items-center gap-3 py-16 text-center">
      <div
        class="size-14 rounded-2xl flex items-center justify-center mb-1"
        style="background: color-mix(in srgb, var(--c-muted) 12%, transparent)"
      >
        <v-icon icon="mdi-account-search-outline" size="28" color="var(--c-muted)" />
      </div>
      <p class="text-base font-semibold" style="color: var(--c-text)">No matches yet</p>
      <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">
        The more cards you add to your trade pile and wishlist, the more traders you'll find here.
      </p>
    </div>

    <!-- Match sections -->
    <template v-else>
      <section v-if="buckets.mutual.length > 0" class="flex flex-col gap-4">
        <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
          <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
          <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Mutual matches</h2>
          <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)">{{ buckets.mutual.length }}</span>
        </div>
        <p class="text-xs -mt-2" style="color: var(--c-muted)">Both sides have something for each other. Start here.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <UserCard v-for="u in buckets.mutual" :key="u.id" :user="u" @openTrade="emit('openTrade', u)" @openProfile="emit('openProfile', $event)" />
        </div>
      </section>

      <section
        v-if="buckets.theyHave.length > 0"
        class="flex flex-col gap-4"
        :class="{ 'border-t pt-6': buckets.mutual.length > 0 }"
        :style="buckets.mutual.length > 0 ? 'border-color: var(--c-border)' : ''"
      >
        <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
          <div class="size-2 rounded-full shrink-0" style="background: var(--c-trade)" />
          <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Have what you want</h2>
          <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)">{{ buckets.theyHave.length }}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <UserCard v-for="u in buckets.theyHave" :key="u.id" :user="u" @openTrade="emit('openTrade', u)" @openProfile="emit('openProfile', $event)" />
        </div>
      </section>

      <section
        v-if="buckets.theyWant.length > 0"
        class="flex flex-col gap-4 border-t pt-6"
        style="border-color: var(--c-border)"
      >
        <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
          <div class="size-2 rounded-full shrink-0" style="background: var(--c-accent)" />
          <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Want what you have</h2>
          <span class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums" style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)">{{ buckets.theyWant.length }}</span>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <UserCard v-for="u in buckets.theyWant" :key="u.id" :user="u" @openTrade="emit('openTrade', u)" @openProfile="emit('openProfile', $event)" />
        </div>
      </section>
    </template>
  </template>
</template>
