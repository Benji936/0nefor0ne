<script setup>
import UserCard from "@/components/UserCard.vue";
import ProposeTradeDialog from "@/components/ProposeTradeDialog.vue";
import ProposalRow from "@/components/ProposalRow.vue";
import TraderProfileDialog from "@/components/TraderProfileDialog.vue";
import { notifMeta, notifText, timeAgo } from '@/lib/notifications';
</script>

<template>
  <div class="flex flex-col gap-6 py-6">

    <!-- ── Recent notifications ────────────────────────────────────────── -->
    <div
      v-if="login && recentNotifs.length > 0"
      class="flex flex-col rounded-2xl border overflow-hidden"
      style="background: var(--c-surface); border-color: var(--c-border)"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3" style="border-bottom: 1px solid var(--c-border)">
        <div class="flex items-center gap-2">
          <v-icon icon="mdi-bell-outline" size="14" style="color: var(--c-muted)" />
          <span class="text-[11px] font-bold uppercase tracking-widest" style="color: var(--c-muted)">Recent activity</span>
        </div>
      </div>

      <!-- Rows -->
      <button
        v-for="n in recentNotifs"
        :key="n.id"
        class="notif-row flex items-center gap-3 px-4 py-3 w-full text-left cursor-pointer transition-colors"
        :style="{ backgroundColor: n.read ? 'transparent' : `color-mix(in srgb, ${notifMeta(n).color} 5%, transparent)` }"
        @click="onNotifClick"
      >
        <!-- Icon -->
        <div
          class="size-7 rounded-full shrink-0 flex items-center justify-center"
          :style="{ background: `color-mix(in srgb, ${notifMeta(n).color} 14%, transparent)` }"
        >
          <v-icon :icon="notifMeta(n).icon" size="14" :color="notifMeta(n).color" />
        </div>

        <!-- Text -->
        <span
          class="text-sm grow truncate"
          :style="{
            color: n.read ? 'var(--c-muted)' : 'var(--c-text)',
            fontWeight: n.read ? '400' : '500',
          }"
        >{{ notifText(n) }}</span>

        <!-- Time + unread dot -->
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-[11px] tabular-nums" style="color: var(--c-muted)">{{ timeAgo(n.created_at, { short: true }) }}</span>
          <span
            v-if="!n.read"
            class="size-2 rounded-full"
            :style="{ backgroundColor: notifMeta(n).color }"
          />
        </div>
      </button>
    </div>

    <!-- Text tabs with animated bottom-border indicator -->
    <div class="flex items-center" style="border-bottom: 1px solid var(--c-border)">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="relative flex items-center gap-2 px-5 py-3 text-sm font-semibold cursor-pointer transition-colors duration-200 whitespace-nowrap"
        :style="{
          color: activeTab === tab.key ? 'var(--c-text)' : 'var(--c-muted)',
          borderBottom: activeTab === tab.key ? '2px solid var(--c-accent)' : '2px solid transparent',
          marginBottom: '-1px',
        }"
        @click="activeTab = tab.key"
      >
        <v-icon :icon="tab.icon" size="16" />
        {{ tab.label }}
        <span
          v-if="tab.badge > 0"
          class="px-1 py-1 w-6 h-6 rounded-md text-[11px] items-center font-bold tabular-nums"
          style="background: var(--c-accent); color: white"
        >{{ tab.badge }}</span>
      </button>
    </div>

    <!-- ─── MATCHES TAB ─── -->
    <template v-if="activeTab === 'matches'">

      <!-- Matches search -->
      <div v-if="!loadingMatches && allMatches.length > 0" class="relative">
        <v-icon icon="mdi-magnify" size="16" class="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" color="var(--c-muted)" />
        <input
          v-model="matchSearch"
          placeholder="Filter by card or trader name…"
          class="w-full rounded-xl pl-9 pr-4 py-3 text-sm border outline-none transition-colors"
          :style="{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', color: 'var(--c-text)' }"
          @focus="e => e.target.style.borderColor = 'var(--c-trade)'"
          @blur="e => e.target.style.borderColor = 'var(--c-border)'"
        />
        <button
          v-if="matchSearch"
          class="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-opacity hover:opacity-70"
          style="color: var(--c-muted)"
          @click="matchSearch = ''"
        >
          <v-icon icon="mdi-close" size="14" />
        </button>
      </div>

      <!-- Filter notice -->
      <div v-if="filterCardName" class="flex items-center gap-2 text-sm" style="color: var(--c-muted)">
        <v-icon icon="mdi-filter-outline" size="15" />
        Filtered by card:
        <span class="font-semibold" style="color: var(--c-text)">{{ filterCardName }}</span>
        <button
          class="ml-1 cursor-pointer transition-opacity hover:opacity-70"
          style="color: var(--c-accent)"
          @click="$emit('clearFilter')"
        >clear</button>
      </div>

      <!-- Not logged in -->
      <div v-if="!login" class="flex flex-col items-center gap-3 py-16 text-center">
        <v-icon icon="mdi-lock-outline" size="36" color="var(--c-muted)" />
        <p class="text-sm" style="color: var(--c-muted)">Log in to see your trade matches.</p>
      </div>

      <!-- Skeleton loading — mirrors UserCard structure -->
      <template v-else-if="loadingMatches">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="i in 6"
            :key="i"
            class="flex flex-col rounded-2xl border overflow-hidden"
            :style="{
              borderColor: 'var(--c-border)',
              backgroundColor: 'var(--c-surface)',
              opacity: 1 - (i - 1) * 0.1,
            }"
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
      <div
        v-else-if="totalMatches === 0"
        class="flex flex-col items-center gap-3 py-16 text-center"
      >
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
            <span
              class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)"
            >{{ buckets.mutual.length }}</span>
          </div>
          <p class="text-xs -mt-2" style="color: var(--c-muted)">Both sides have something for each other. Start here.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <UserCard v-for="u in buckets.mutual" :key="u.id" :user="u" @openTrade="onOpenTrade" @openProfile="onOpenProfile" />
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
            <span
              class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)"
            >{{ buckets.theyHave.length }}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <UserCard v-for="u in buckets.theyHave" :key="u.id" :user="u" @openTrade="onOpenTrade" @openProfile="onOpenProfile" />
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
            <span
              class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-accent) 15%, transparent); color: var(--c-accent)"
            >{{ buckets.theyWant.length }}</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <UserCard v-for="u in buckets.theyWant" :key="u.id" :user="u" @openTrade="onOpenTrade" @openProfile="onOpenProfile" />
          </div>
        </section>
      </template>
    </template>

    <!-- ─── PROPOSALS TAB ─── -->
    <template v-if="activeTab === 'proposals'">

      <!-- Not logged in -->
      <div v-if="!login" class="flex flex-col items-center gap-3 py-16 text-center">
        <v-icon icon="mdi-lock-outline" size="36" color="var(--c-muted)" />
        <p class="text-sm" style="color: var(--c-muted)">Log in to see your proposals.</p>
      </div>

      <!-- Skeleton loading — mirrors ProposalRow structure -->
      <template v-else-if="loadingProposals">
        <div class="flex flex-col gap-3">
          <div
            v-for="i in 3"
            :key="i"
            class="rounded-xl border overflow-hidden"
            :style="{
              borderColor: 'var(--c-border)',
              backgroundColor: 'var(--c-surface)',
              opacity: 1 - (i - 1) * 0.2,
            }"
          >
            <div class="flex items-center gap-3 px-4 py-3">
              <div class="size-8 rounded-full shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
              <div class="flex flex-col gap-2 grow">
                <div class="h-4 rounded animate-pulse" style="background: var(--c-skeleton); width: 42%" />
                <div class="h-3 rounded animate-pulse" style="background: var(--c-skeleton); width: 28%" />
              </div>
              <div class="h-6 w-20 rounded-lg shrink-0 animate-pulse" style="background: var(--c-skeleton)" />
            </div>
            <div
              class="h-20 animate-pulse"
              style="background: var(--c-skeleton); border-top: 1px solid var(--c-border)"
            />
          </div>
        </div>
      </template>

      <!-- Empty state -->
      <div
        v-else-if="proposals.length === 0"
        class="flex flex-col items-center gap-3 py-16 text-center"
      >
        <div
          class="size-14 rounded-2xl flex items-center justify-center mb-1"
          style="background: color-mix(in srgb, var(--c-muted) 12%, transparent)"
        >
          <v-icon icon="mdi-swap-horizontal" size="28" color="var(--c-muted)" />
        </div>
        <p class="text-base font-semibold" style="color: var(--c-text)">No proposals yet</p>
        <p class="text-sm max-w-xs leading-relaxed" style="color: var(--c-muted)">
          Send one from the Matches tab when you find a trader you want to deal with.
        </p>
      </div>

      <!-- Proposal sections -->
      <template v-else>

        <!-- Incoming pending -->
        <section v-if="incomingPending.length > 0" class="flex flex-col gap-4">
          <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
            <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
            <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Incoming</h2>
            <span
              class="text-[11px] font-bold px-1 py-1 w-6 h-6 text-center rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)"
            >{{ incomingPending.length }}</span>
          </div>
          <p class="text-xs -mt-2" style="color: var(--c-muted)">These traders want to deal with you. Accept or decline.</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in incomingPending"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @accept="onAccept"
              @decline="onDecline"
              @cancel="onCancel"
              @complete="onComplete"
              @counter="onCounter"
              @openProfile="onOpenProfile"
            />
          </div>
        </section>

        <!-- Outgoing pending -->
        <section
          v-if="outgoingPending.length > 0"
          class="flex flex-col gap-4"
          :class="{ 'border-t pt-6': incomingPending.length > 0 }"
          :style="incomingPending.length > 0 ? 'border-color: var(--c-border)' : ''"
        >
          <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
            <div class="size-2 rounded-full shrink-0" style="background: var(--c-trade)" />
            <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Sent</h2>
            <span
              class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-trade) 15%, transparent); color: var(--c-trade)"
            >{{ outgoingPending.length }}</span>
          </div>
          <p class="text-xs -mt-2" style="color: var(--c-muted)">Waiting for the other side to respond.</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in outgoingPending"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @edit="onEdit"
              @cancel="onCancel"
              @complete="onComplete"
              @openProfile="onOpenProfile"
            />
          </div>
        </section>

        <!-- Accepted — awaiting physical exchange -->
        <section v-if="acceptedTrades.length > 0" class="flex flex-col gap-4 border-t pt-6" style="border-color: var(--c-border)">
          <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
            <div class="size-2 rounded-full shrink-0" style="background: var(--c-mutual)" />
            <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-text)">Awaiting exchange</h2>
            <span
              class="text-[11px] font-bold px-2 py-1 rounded-md tabular-nums"
              style="background: color-mix(in srgb, var(--c-mutual) 15%, transparent); color: var(--c-mutual)"
            >{{ acceptedTrades.length }}</span>
          </div>
          <p class="text-xs -mt-2" style="color: var(--c-muted)">Both sides agreed. Confirm once cards have changed hands, or cancel to release them.</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in acceptedTrades"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @cancel="onCancel"
              @complete="onComplete"
              @openProfile="onOpenProfile"
            />
          </div>
        </section>

        <!-- History -->
        <section v-if="history.length > 0" class="flex flex-col gap-4 border-t pt-6" style="border-color: var(--c-border)">
          <div class="flex items-center gap-3 pb-3" style="border-bottom: 1px solid var(--c-border)">
            <div class="size-2 rounded-full shrink-0" style="background: var(--c-muted)" />
            <h2 class="text-sm font-bold uppercase tracking-widest grow" style="color: var(--c-muted)">History</h2>
          </div>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in history"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @cancel="onCancel"
              @complete="onComplete"
              @openProfile="onOpenProfile"
            />
          </div>
        </section>

      </template>
    </template>

    <!-- Dialogs -->
    <ProposeTradeDialog
      v-model="dialogOpen"
      :user="dialogUser"
      :edit-proposal="editProposal"
      :counter-proposal="counterProposal"
      @submitted="onTradeSubmitted"
      @updated="onTradeUpdated"
      @countered="onTradeCountered"
    />

    <TraderProfileDialog
      v-model="profileDialogOpen"
      :trader-id="profileTraderId"
      :current-user-id="login?.user?.id"
      @propose="onProposeFromProfile"
    />

    <v-snackbar v-model="snackbar.open" :timeout="4000" :color="snackbar.color ?? 'var(--c-mutual)'">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { fetchMatches, filterByCardName, bucketMatches, fetchMyProposals, updateProposalStatus, completeTradeProposal, cancelTradeProposal, declineTradeProposal } from "@/lib/matches";

export default {
  props: {
    login: { type: Object, default: null },
    filterCardName: { type: String, default: "" },
  },
  emits: ["clearFilter"],
  data() {
    return {
      activeTab: "matches",
      // Matches
      loadingMatches: false,
      allMatches: [],
      // Proposals
      loadingProposals: false,
      proposals: [],
      matchSearch: "",
      // Profile dialog
      profileDialogOpen: false,
      profileTraderId:   null,
      // Recent notifications
      recentNotifs: [],
      // Shared
      subscription: null,
      dialogOpen: false,
      dialogUser: null,
      editProposal: null,
      counterProposal: null,
      snackbar: { open: false, message: "", color: null },
    };
  },
  computed: {
    tabs() {
      const pendingCount = this.proposals.filter(
        (p) => p.status === "pending" && !p.i_am_proposer
      ).length;
      return [
        { key: "matches",   label: "Matches",   icon: "mdi-account-group-outline", badge: 0 },
        { key: "proposals", label: "Proposals", icon: "mdi-swap-horizontal-bold",  badge: pendingCount },
      ];
    },
    visibleMatches() {
      return filterByCardName(this.allMatches, this.filterCardName);
    },
    searchedMatches() {
      const q = this.matchSearch.toLowerCase().trim();
      if (!q) return this.visibleMatches;
      return this.visibleMatches.filter(u => {
        if ((u.name ?? "").toLowerCase().includes(q)) return true;
        if (u.theyHave.some(c => c.name.toLowerCase().includes(q))) return true;
        if (u.theyWant.some(c => c.name.toLowerCase().includes(q))) return true;
        return false;
      });
    },
    buckets() {
      return bucketMatches(this.searchedMatches);
    },
    totalMatches() {
      return this.searchedMatches.length;
    },
    incomingPending() {
      return this.proposals.filter((p) => p.status === "pending" && !p.i_am_proposer);
    },
    outgoingPending() {
      return this.proposals.filter((p) => p.status === "pending" && p.i_am_proposer);
    },
    acceptedTrades() {
      return this.proposals.filter((p) => p.status === "accepted");
    },
    history() {
      return this.proposals.filter((p) => !["pending", "accepted"].includes(p.status));
    },
  },
  methods: {
    async loadMatches() {
      if (!this.login?.user?.id) return;
      this.loadingMatches = true;
      try {
        this.allMatches = await fetchMatches();
      } catch (err) {
        console.error(err);
      } finally {
        this.loadingMatches = false;
      }
    },
    async loadProposals() {
      if (!this.login?.user?.id) return;
      this.loadingProposals = true;
      try {
        this.proposals = await fetchMyProposals();
      } catch (err) {
        console.error(err);
      } finally {
        this.loadingProposals = false;
      }
    },
    onOpenTrade(user) {
      this.editProposal = null;
      this.counterProposal = null;
      this.dialogUser = user;
      this.dialogOpen = true;
    },
    onEdit(proposal) {
      this.dialogUser = null;
      this.counterProposal = null;
      this.editProposal = proposal;
      this.dialogOpen = true;
    },
    onCounter(proposal) {
      this.dialogUser = null;
      this.editProposal = null;
      this.counterProposal = proposal;
      this.dialogOpen = true;
    },
    onTradeCountered(tradeId) {
      this.snackbar = { open: true, message: `Counter-offer #${tradeId} sent.`, color: "var(--c-mutual)" };
      this.loadProposals();
    },
    onTradeSubmitted(tradeId) {
      this.snackbar = { open: true, message: `Proposal #${tradeId} sent.`, color: "var(--c-mutual)" };
      this.loadMatches();
      this.loadProposals();
      this.activeTab = "proposals";
    },
    onTradeUpdated() {
      this.snackbar = { open: true, message: "Proposal updated.", color: "var(--c-mutual)" };
      this.loadProposals();
    },
    async onComplete(proposal) {
      try {
        const result = await completeTradeProposal(proposal.id);
        if (result?.status === 'completed') {
          this.snackbar = { open: true, message: "Exchange complete — cards have been updated.", color: "var(--c-mutual)" };
          await Promise.all([this.loadMatches(), this.loadProposals()]);
        } else {
          this.snackbar = { open: true, message: "Your side confirmed. Waiting for the other trader.", color: "var(--c-mutual)" };
          await this.loadProposals();
        }
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to confirm.", color: "var(--c-accent)" };
      }
    },
    async onAccept(proposal) {
      try {
        await updateProposalStatus(proposal.id, "accepted");
        this.snackbar = { open: true, message: "Trade accepted!", color: "var(--c-mutual)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to accept.", color: "var(--c-accent)" };
      }
    },
    async onDecline(payload) {
      // payload is either a proposal object or { proposal, reason }
      const proposal = payload?.proposal ?? payload;
      const reason   = payload?.reason   ?? null;
      try {
        await declineTradeProposal(proposal.id, reason);
        this.snackbar = { open: true, message: "Trade declined.", color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to decline.", color: "var(--c-accent)" };
      }
    },
    async onCancel(proposal) {
      try {
        await cancelTradeProposal(proposal.id);
        this.snackbar = { open: true, message: "Trade cancelled.", color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to cancel.", color: "var(--c-accent)" };
      }
    },
    onOpenProfile(traderId) {
      this.profileTraderId  = traderId;
      this.profileDialogOpen = true;
    },
    onProposeFromProfile(traderId) {
      // Find the match entry if it exists (gives us theyWant for card tagging)
      const existing = this.allMatches.find(u => u.id === traderId);
      this.editProposal    = null;
      this.counterProposal = null;
      this.dialogUser      = existing ?? { id: traderId, name: null, theyWant: [], theyHave: [] };
      this.dialogOpen      = true;
    },
    switchToProposals() {
      this.activeTab = "proposals";
    },
    async loadRecentNotifs() {
      if (!this.login?.user?.id) return;
      const { data } = await getClient()
        .from("notification")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3);
      this.recentNotifs = data ?? [];
    },
    onNotifClick() {
      this.activeTab = "proposals";
    },
  },
  async mounted() {
    await Promise.all([this.loadMatches(), this.loadProposals(), this.loadRecentNotifs()]);

    // Live updates on Card, Trade, and Notification changes
    this.subscription = getClient()
      .channel("trade-center-live")
      .on("postgres_changes", { event: "*",    schema: "public", table: "Card" },         () => this.loadMatches())
      .on("postgres_changes", { event: "*",    schema: "public", table: "Trade" },        () => this.loadProposals())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notification",
          filter: `user_id=eq.${this.login?.user?.id}` },
        (payload) => {
          this.recentNotifs = [payload.new, ...this.recentNotifs].slice(0, 3);
        })
      .subscribe();
  },
  beforeUnmount() {
    if (this.subscription) {
      getClient().removeChannel(this.subscription);
    }
  },
};
</script>

<style scoped>
.notif-row:not(:last-child) {
  border-bottom: 1px solid var(--c-border);
}
.notif-row:hover {
  background-color: var(--c-surface-2) !important;
}
</style>
