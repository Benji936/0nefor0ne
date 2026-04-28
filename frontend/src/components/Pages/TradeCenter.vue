<script setup>
import UserCard from "@/components/UserCard.vue";
import ProposeTradeDialog from "@/components/ProposeTradeDialog.vue";
</script>

<template>
  <div class="flex flex-col gap-8 py-6">
    <!-- Header -->
    <div class="flex flex-col gap-1">
      <p v-if="filterCardName" class="text-sm" style="color: var(--c-muted)">
        Filtered by card:
        <span class="font-medium" style="color: var(--c-text)">{{ filterCardName }}</span>
        <a class="ml-3 text-pink-400 underline cursor-pointer" @click="$emit('clearFilter')">clear</a>
      </p>
      <p v-else class="text-sm" style="color: var(--c-muted)">
        Traders who overlap with your wishlist or trade pile.
      </p>
    </div>

    <!-- Loading / empty / not-logged-in states -->
    <p v-if="!login" class="self-center text-lg py-10" style="color: var(--c-muted)">
      Log in to see your trade matches.
    </p>
    <p v-else-if="loading" class="self-center text-lg py-10" style="color: var(--c-muted)">
      Looking for matches…
    </p>
    <p v-else-if="totalMatches === 0" class="self-center text-lg py-10" style="color: var(--c-muted)">
      No matches yet. Add cards to your wishlist or trade pile to find traders.
    </p>

    <!-- Mutual matches first - the gold -->
    <section v-if="buckets.mutual.length > 0" class="flex flex-col gap-4">
      <div class="flex flex-row items-center gap-3">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Mutual matches</p>
        <v-chip size="small" color="var(--c-mutual)" variant="flat" class="text-white">
          {{ buckets.mutual.length }}
        </v-chip>
      </div>
      <p class="text-sm" style="color: var(--c-muted)">
        Both sides have something for each other. Start here.
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <UserCard v-for="u in buckets.mutual" :key="u.id" :user="u" @openTrade="onOpenTrade" />
      </div>
    </section>

    <section v-if="buckets.theyHave.length > 0" class="flex flex-col gap-4">
      <div class="flex flex-row items-center gap-3">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Have what you want</p>
        <v-chip size="small" color="var(--c-trade)" variant="flat" class="text-white">
          {{ buckets.theyHave.length }}
        </v-chip>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <UserCard v-for="u in buckets.theyHave" :key="u.id" :user="u" @openTrade="onOpenTrade" />
      </div>
    </section>

    <section v-if="buckets.theyWant.length > 0" class="flex flex-col gap-4 border-t pt-4" style="border-color: var(--c-border)">
      <div class="flex flex-row items-center gap-3">
        <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Want what you have</p>
        <v-chip size="small" color="var(--c-accent)" variant="flat" class="text-white">
          {{ buckets.theyWant.length }}
        </v-chip>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <UserCard v-for="u in buckets.theyWant" :key="u.id" :user="u" @openTrade="onOpenTrade" />
      </div>
    </section>

    <ProposeTradeDialog
      v-model="dialogOpen"
      :user="dialogUser"
      @submitted="onTradeSubmitted"
    />

    <v-snackbar v-model="snackbar.open" :timeout="4000" color="var(--c-mutual)">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { fetchMatches, filterByCardName, bucketMatches } from "@/lib/matches";

export default {
  // login: the auth response stored in App.vue (has .user.id)
  // filterCardName: optional - when arriving from "See traders" we narrow down
  props: {
    login: { type: Object, default: null },
    filterCardName: { type: String, default: "" },
  },
  emits: ["clearFilter"],
  data() {
    return {
      loading: false,
      allMatches: [],
      subscription: null,
      dialogOpen: false,
      dialogUser: null,
      snackbar: { open: false, message: "" },
    };
  },
  computed: {
    visibleMatches() {
      return filterByCardName(this.allMatches, this.filterCardName);
    },
    buckets() {
      return bucketMatches(this.visibleMatches);
    },
    totalMatches() {
      return this.visibleMatches.length;
    },
  },
  methods: {
    async load() {
      if (!this.login?.user?.id) return;
      this.loading = true;
      try {
        this.allMatches = await fetchMatches();
      } catch (err) {
        console.error(err);
      } finally {
        this.loading = false;
      }
    },
    onOpenTrade(user) {
      this.dialogUser = user;
      this.dialogOpen = true;
    },
    onTradeSubmitted(tradeId) {
      this.snackbar = {
        open: true,
        message: `Proposal sent (trade #${tradeId}).`,
      };
      // The Card table didn't change, but Trade did - reload to be safe.
      this.load();
    },
  },
  async mounted() {
    await this.load();

    // Live updates: when any Card row changes, recompute matches. Cheap because
    // the heavy lifting is server-side in the RPC.
    this.subscription = getClient()
      .channel("trade-center-cards")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "Card" },
        () => this.load()
      )
      .subscribe();
  },
  beforeUnmount() {
    if (this.subscription) {
      getClient().removeChannel(this.subscription);
    }
  },
};
</script>
