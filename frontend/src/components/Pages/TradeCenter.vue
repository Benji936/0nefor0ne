<script setup>
import UserCard from "@/components/UserCard.vue";
import ProposeTradeDialog from "@/components/ProposeTradeDialog.vue";
import ProposalRow from "@/components/ProposalRow.vue";
</script>

<template>
  <div class="flex flex-col gap-6 py-6">

    <!-- Tabs -->
    <div class="flex items-center gap-1 p-1 rounded-xl self-start" style="background: var(--c-surface)">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer"
        :style="activeTab === tab.key
          ? 'background: var(--c-surface-2); color: var(--c-text);'
          : 'color: var(--c-muted);'"
        @click="activeTab = tab.key"
      >
        <v-icon :icon="tab.icon" size="16" />
        {{ tab.label }}
        <span
          v-if="tab.badge > 0"
          class="px-1.5 py-0.5 rounded-md text-[11px] font-bold"
          :style="activeTab === tab.key
            ? 'background: var(--c-accent); color: white;'
            : 'background: var(--c-surface-2); color: var(--c-muted);'"
        >{{ tab.badge }}</span>
      </button>
    </div>

    <!-- ─── MATCHES TAB ─── -->
    <template v-if="activeTab === 'matches'">
      <div class="flex flex-col gap-1">
        <p v-if="filterCardName" class="text-sm" style="color: var(--c-muted)">
          Filtered by card:
          <span class="font-medium" style="color: var(--c-text)">{{ filterCardName }}</span>
          <a class="ml-3 cursor-pointer" style="color: var(--c-accent)" @click="$emit('clearFilter')">clear</a>
        </p>
        <p v-else class="text-sm" style="color: var(--c-muted)">
          Traders who overlap with your wishlist or trade pile.
        </p>
      </div>

      <p v-if="!login" class="self-center text-lg py-10" style="color: var(--c-muted)">
        Log in to see your trade matches.
      </p>
      <p v-else-if="loadingMatches" class="self-center text-lg py-10" style="color: var(--c-muted)">
        Looking for matches…
      </p>
      <p v-else-if="totalMatches === 0" class="self-center text-lg py-10" style="color: var(--c-muted)">
        No matches yet. Add cards to your wishlist or trade pile to find traders.
      </p>

      <section v-if="buckets.mutual.length > 0" class="flex flex-col gap-4">
        <div class="flex flex-row items-center gap-3">
          <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Mutual matches</p>
          <v-chip size="small" color="var(--c-mutual)" variant="flat" class="text-white">
            {{ buckets.mutual.length }}
          </v-chip>
        </div>
        <p class="text-sm" style="color: var(--c-muted)">Both sides have something for each other. Start here.</p>
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
    </template>

    <!-- ─── PROPOSALS TAB ─── -->
    <template v-if="activeTab === 'proposals'">
      <p v-if="!login" class="self-center text-lg py-10" style="color: var(--c-muted)">
        Log in to see your proposals.
      </p>
      <p v-else-if="loadingProposals" class="self-center text-lg py-10" style="color: var(--c-muted)">
        Loading proposals…
      </p>
      <p v-else-if="proposals.length === 0" class="self-center text-lg py-10" style="color: var(--c-muted)">
        No proposals yet. Send one from the Matches tab.
      </p>

      <template v-else>
        <!-- Incoming pending -->
        <section v-if="incomingPending.length > 0" class="flex flex-col gap-4">
          <div class="flex items-center gap-3">
            <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Incoming</p>
            <v-chip size="small" color="var(--c-mutual)" variant="flat" class="text-white">{{ incomingPending.length }}</v-chip>
          </div>
          <p class="text-sm -mt-2" style="color: var(--c-muted)">These traders want to deal with you. Accept or decline.</p>
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
            />
          </div>
        </section>

        <!-- Outgoing pending -->
        <section v-if="outgoingPending.length > 0" class="flex flex-col gap-4" :class="{ 'border-t pt-4': incomingPending.length > 0 }" :style="incomingPending.length > 0 ? 'border-color: var(--c-border)' : ''">
          <div class="flex items-center gap-3">
            <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Sent</p>
            <v-chip size="small" color="var(--c-trade)" variant="flat" class="text-white">{{ outgoingPending.length }}</v-chip>
          </div>
          <p class="text-sm -mt-2" style="color: var(--c-muted)">Waiting for the other side to respond.</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in outgoingPending"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @edit="onEdit"
              @cancel="onCancel"
              @complete="onComplete"
            />
          </div>
        </section>

        <!-- Accepted — awaiting physical exchange -->
        <section v-if="acceptedTrades.length > 0" class="flex flex-col gap-4 border-t pt-4" style="border-color: var(--c-border)">
          <div class="flex items-center gap-3">
            <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Awaiting exchange</p>
            <v-chip size="small" color="var(--c-mutual)" variant="flat" class="text-white">{{ acceptedTrades.length }}</v-chip>
          </div>
          <p class="text-sm -mt-2" style="color: var(--c-muted)">Both sides agreed. Confirm once the physical cards have changed hands, or cancel to release them.</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in acceptedTrades"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @cancel="onCancel"
              @complete="onComplete"
            />
          </div>
        </section>

        <!-- History -->
        <section v-if="history.length > 0" class="flex flex-col gap-4 border-t pt-4" style="border-color: var(--c-border)">
          <p class="text-xl uppercase font-semibold tracking-wide" style="color: var(--c-muted)">History</p>
          <div class="flex flex-col gap-3">
            <ProposalRow
              v-for="p in history"
              :key="p.id"
              :proposal="p"
              :current-user-id="login?.user?.id"
              @cancel="onCancel"
              @complete="onComplete"
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
      @submitted="onTradeSubmitted"
      @updated="onTradeUpdated"
    />

    <v-snackbar v-model="snackbar.open" :timeout="4000" :color="snackbar.color ?? 'var(--c-mutual)'">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { fetchMatches, filterByCardName, bucketMatches, fetchMyProposals, updateProposalStatus, completeTradeProposal } from "@/lib/matches";

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
      // Shared
      subscription: null,
      dialogOpen: false,
      dialogUser: null,
      editProposal: null,
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
    buckets() {
      return bucketMatches(this.visibleMatches);
    },
    totalMatches() {
      return this.visibleMatches.length;
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
      this.dialogUser = user;
      this.dialogOpen = true;
    },
    onEdit(proposal) {
      this.dialogUser = null;
      this.editProposal = proposal;
      this.dialogOpen = true;
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
        await completeTradeProposal(proposal.id);
        this.snackbar = { open: true, message: "Trade completed! Cards updated.", color: "var(--c-mutual)" };
        await Promise.all([this.loadMatches(), this.loadProposals()]);
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to complete trade.", color: "var(--c-accent)" };
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
    async onDecline(proposal) {
      try {
        await updateProposalStatus(proposal.id, "declined");
        this.snackbar = { open: true, message: "Trade declined.", color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to decline.", color: "var(--c-accent)" };
      }
    },
    async onCancel(proposal) {
      try {
        await updateProposalStatus(proposal.id, "cancelled");
        this.snackbar = { open: true, message: "Proposal cancelled.", color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? "Failed to cancel.", color: "var(--c-accent)" };
      }
    },
  },
  async mounted() {
    await Promise.all([this.loadMatches(), this.loadProposals()]);

    // Live updates on both Card and Trade changes
    this.subscription = getClient()
      .channel("trade-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "Card" }, () => this.loadMatches())
      .on("postgres_changes", { event: "*", schema: "public", table: "Trade" }, () => this.loadProposals())
      .subscribe();
  },
  beforeUnmount() {
    if (this.subscription) {
      getClient().removeChannel(this.subscription);
    }
  },
};
</script>
