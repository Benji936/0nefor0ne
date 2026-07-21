<script setup>
import MatchesTab          from "./trade-center/MatchesTab.vue";
import ProposalsTab        from "./trade-center/ProposalsTab.vue";
import AnnouncesTab        from "./trade-center/AnnouncesTab.vue";
import ProposeTradeDialog  from "@/components/trade/ProposeTradeDialog.vue";
import TraderProfileDialog from "@/components/trade/TraderProfileDialog.vue";
import CreateAnnounceDialog from "@/components/trade/CreateAnnounceDialog.vue";
import AnnounceDetailDialog from "@/components/trade/AnnounceDetailDialog.vue";
</script>

<template>
  <div class="flex flex-col gap-4 md:gap-6 py-4 md:py-10">

    <!-- Tab bar — hidden on desktop (tabs are in the side nav); shown only on mobile -->
    <div class="flex items-center sm:hidden" style="border-bottom: 1px solid var(--c-border)">
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

    <!-- Matches tab -->
    <MatchesTab
      v-if="activeTab === 'matches'"
      :login="login"
      :loading="isLoadingVisible"
      :all-matches-count="allMatches.length"
      :location-country="locationCountry"
      :location-city="locationCity"
      :available-countries="availableCountries"
      :filter-card-name="filterCardName"
      :buckets="buckets"
      :total-matches="totalMatches"
      @update:locationCountry="locationCountry = $event"
      @update:locationCity="locationCity = $event"
      @clearFilter="$emit('clearFilter')"
      @openTrade="onOpenTrade"
      @openProfile="onOpenProfile"
    />

    <!-- Proposals tab -->
    <ProposalsTab
      v-if="activeTab === 'proposals'"
      :login="login"
      :loading="loadingProposals"
      :incoming-pending="incomingPending"
      :outgoing-pending="outgoingPending"
      :accepted-trades="acceptedTrades"
      :history="history"
      :current-user-id="login?.user?.id"
      @accept="onAccept"
      @decline="onDecline"
      @cancel="onCancel"
      @complete="onComplete"
      @counter="onCounter"
      @edit="onEdit"
      @openProfile="onOpenProfile"
    />

    <!-- Announces tab -->
    <AnnouncesTab
      v-if="activeTab === 'announces'"
      kind="sell"
      :login="login"
      :loading="loadingAnnounces"
      :announces="announces"
      @openCreate="onOpenCreateAnnounce"
      @openDetail="onOpenAnnounceDetail"
    />

    <!-- Looking For tab — same component, filtered to the other kind -->
    <AnnouncesTab
      v-if="activeTab === 'lookingfor'"
      kind="looking_for"
      :login="login"
      :loading="loadingAnnounces"
      :announces="announces"
      @openCreate="onOpenCreateAnnounce"
      @openDetail="onOpenAnnounceDetail"
    />

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

    <CreateAnnounceDialog
      v-model="createAnnounceOpen"
      :announce="editAnnounce"
      :kind="createAnnounceKind"
      @created="onAnnounceCreated"
      @updated="onAnnounceUpdated"
    />

    <AnnounceDetailDialog
      v-model="announceDetailOpen"
      :announce="selectedAnnounce"
      :current-user-id="login?.user?.id"
      @deleted="onAnnounceDeleted"
      @updated="onAnnounceUpdated"
      @edit="onEditAnnounce"
      @propose="onProposeFromProfile"
    />

    <v-snackbar v-model="snackbar.open" :timeout="4000" :color="snackbar.color ?? 'var(--c-mutual)'">
      {{ snackbar.message }}
    </v-snackbar>
  </div>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
import { fetchMatches, fetchTradersWithCard, bucketMatches } from "@/lib/matches";
import { fetchMyProposals, acceptTradeProposal, completeTradeProposal, cancelTradeProposal, declineTradeProposal } from "@/lib/proposals";
import { fetchAnnounces } from "@/lib/announces";

export default {
  props: {
    login:          { type: Object, default: null },
    filterCardName: { type: String, default: "" },
    initialTab:     { type: String, default: "matches" },
  },
  emits: ["clearFilter", "tabChange"],
  data() {
    return {
      activeTab:          this.initialTab ?? "matches",
      loadingMatches:     false,
      allMatches:         [],
      loadingCardTraders: false,
      cardTraders:        [],
      loadingProposals:   false,
      proposals:          [],
      locationCountry:    "",
      locationCity:       "",
      profileDialogOpen:  false,
      profileTraderId:    null,
      subscription:       null,
      dialogOpen:         false,
      dialogUser:         null,
      editProposal:       null,
      counterProposal:    null,
      snackbar:           { open: false, message: "", color: null },
      // Current user's trade scope profile
      myTradeScope:       "worldwide",
      myCountry:          "",
      myCity:             "",
      // Announces
      loadingAnnounces:   false,
      announces:          [],
      createAnnounceOpen: false,
      createAnnounceKind: "sell",
      announceDetailOpen: false,
      selectedAnnounce:   null,
      editAnnounce:       null,
    };
  },
  computed: {
    tabs() {
      const pendingCount = this.proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length;
      return [
        { key: "matches",   label: this.$t("tradeCenter.matches"),   icon: "mdi-account-group-outline", badge: 0 },
        { key: "proposals", label: this.$t("tradeCenter.proposals"), icon: "mdi-swap-horizontal-bold",  badge: pendingCount },
        { key: "announces", label: this.$t("tradeCenter.announces"), icon: "mdi-bullhorn-outline",  badge: 0 },
        { key: "lookingfor", label: this.$t("tradeCenter.lookingFor"), icon: "mdi-magnify", badge: 0 },
      ];
    },
    visibleMatches() {
      return this.filterCardName ? this.cardTraders : this.allMatches;
    },
    /** Apply the current user's trade_scope preference to narrow matches. */
    scopeFilteredMatches() {
      const scope = this.myTradeScope;
      if (scope === 'worldwide' || !scope) return this.visibleMatches;
      if (scope === 'national') {
        if (!this.myCountry) return this.visibleMatches;
        return this.visibleMatches.filter(u => u.country === this.myCountry);
      }
      if (scope === 'local') {
        if (!this.myCity) return this.visibleMatches;
        const myCity = this.myCity.toLowerCase();
        return this.visibleMatches.filter(u =>
          (u.city ?? '').toLowerCase() === myCity
          && (!this.myCountry || u.country === this.myCountry)
        );
      }
      return this.visibleMatches;
    },
    availableCountries() {
      return [...new Set(this.scopeFilteredMatches.map(u => u.country).filter(Boolean))].sort();
    },
    filteredMatches() {
      let result = this.scopeFilteredMatches;
      if (this.locationCountry) result = result.filter(u => u.country === this.locationCountry);
      if (this.locationCity.trim()) {
        const city = this.locationCity.trim().toLowerCase();
        result = result.filter(u => (u.city ?? "").toLowerCase().includes(city));
      }
      return result;
    },
    buckets()      { return bucketMatches(this.filteredMatches); },
    totalMatches() { return this.filteredMatches.length; },
    isLoadingVisible() {
      return this.filterCardName ? this.loadingCardTraders : this.loadingMatches;
    },
    incomingPending() { return this.proposals.filter(p => p.status === "pending" && !p.i_am_proposer); },
    outgoingPending() { return this.proposals.filter(p => p.status === "pending" && p.i_am_proposer); },
    acceptedTrades()  { return this.proposals.filter(p => p.status === "accepted"); },
    history()         { return this.proposals.filter(p => !["pending", "accepted"].includes(p.status)); },
  },
  methods: {
    async loadMyProfile() {
      if (!this.login?.user?.id) return;
      try {
        const { data } = await getClient()
          .from('Trader')
          .select('trade_scope, Country, City')
          .eq('id', this.login.user.id)
          .single();
        if (data) {
          this.myTradeScope = data.trade_scope ?? 'worldwide';
          this.myCountry    = data.Country     ?? '';
          this.myCity       = data.City        ?? '';
        }
      } catch (err) {
        console.error('loadMyProfile failed', err);
      }
    },
    async loadMatches() {
      if (!this.login?.user?.id || this.loadingMatches) return;
      this.loadingMatches = true;
      try   { this.allMatches = await fetchMatches(); }
      catch (err) { console.error(err); }
      finally { this.loadingMatches = false; }
    },
    async loadProposals() {
      if (!this.login?.user?.id || this.loadingProposals) return;
      this.loadingProposals = true;
      try   { this.proposals = await fetchMyProposals(); }
      catch (err) { console.error(err); }
      finally { this.loadingProposals = false; }
    },
    async loadAnnounces() {
      if (!this.login?.user?.id || this.loadingAnnounces) return;
      this.loadingAnnounces = true;
      try   { this.announces = await fetchAnnounces(); }
      catch (err) { console.error(err); }
      finally { this.loadingAnnounces = false; }
    },
    onOpenTrade(user) {
      this.editProposal = null; this.counterProposal = null;
      this.dialogUser = user; this.dialogOpen = true;
    },
    onEdit(proposal) {
      this.dialogUser = null; this.counterProposal = null;
      this.editProposal = proposal; this.dialogOpen = true;
    },
    onCounter(proposal) {
      this.dialogUser = null; this.editProposal = null;
      this.counterProposal = proposal; this.dialogOpen = true;
    },
    onTradeCountered(tradeId) {
      this.snackbar = { open: true, message: this.$t('tradeCenter.counterSent', { id: tradeId }), color: "var(--c-mutual)" };
      this.loadProposals();
    },
    onTradeSubmitted(tradeId) {
      this.snackbar = { open: true, message: this.$t('tradeCenter.proposalSent', { id: tradeId }), color: "var(--c-mutual)" };
      Promise.all([this.loadMatches(), this.loadProposals()]);
      this.activeTab = "proposals";
    },
    onTradeUpdated() {
      this.snackbar = { open: true, message: this.$t('tradeCenter.proposalUpdated'), color: "var(--c-mutual)" };
      this.loadProposals();
    },
    async onComplete(proposal) {
      try {
        const result = await completeTradeProposal(proposal.id);
        if (result?.status === 'completed') {
          this.snackbar = { open: true, message: this.$t('tradeCenter.exchangeComplete'), color: "var(--c-mutual)" };
          await Promise.all([this.loadMatches(), this.loadProposals()]);
        } else {
          this.snackbar = { open: true, message: this.$t('tradeCenter.yourSideConfirmed'), color: "var(--c-mutual)" };
          await this.loadProposals();
        }
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? this.$t('tradeCenter.failedToConfirm'), color: "var(--c-accent)" };
      }
    },
    async onAccept(proposal) {
      try {
        await acceptTradeProposal(proposal.id);
        this.snackbar = { open: true, message: this.$t('tradeCenter.tradeAccepted'), color: "var(--c-mutual)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? this.$t('tradeCenter.failedToAccept'), color: "var(--c-accent)" };
      }
    },
    async onDecline(payload) {
      const proposal = payload?.proposal ?? payload;
      const reason   = payload?.reason   ?? null;
      try {
        await declineTradeProposal(proposal.id, reason);
        this.snackbar = { open: true, message: this.$t('tradeCenter.tradeDeclined'), color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? this.$t('tradeCenter.failedToDecline'), color: "var(--c-accent)" };
      }
    },
    async onCancel(proposal) {
      try {
        await cancelTradeProposal(proposal.id);
        this.snackbar = { open: true, message: this.$t('tradeCenter.tradeCancelled'), color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.snackbar = { open: true, message: err.message ?? this.$t('tradeCenter.failedToCancel'), color: "var(--c-accent)" };
      }
    },
    onOpenProfile(traderId) {
      this.profileTraderId = traderId; this.profileDialogOpen = true;
    },
    onProposeFromProfile(traderId) {
      const existing = this.allMatches.find(u => u.id === traderId);
      this.editProposal = null; this.counterProposal = null;
      this.dialogUser = existing ?? { id: traderId, name: null, theyWant: [], theyHave: [] };
      this.dialogOpen = true;
    },
    switchToProposals() { this.activeTab = "proposals"; },
    switchToTab(tab)    { if (tab) this.activeTab = tab; },
    async loadCardTraders(cardName) {
      if (!cardName) { this.cardTraders = []; return; }
      this.loadingCardTraders = true;
      try   { this.cardTraders = await fetchTradersWithCard(cardName); }
      catch (err) { console.error(err); this.cardTraders = []; }
      finally { this.loadingCardTraders = false; }
    },
    onOpenAnnounceDetail(announce) {
      this.selectedAnnounce = announce;
      this.announceDetailOpen = true;
    },
    onOpenCreateAnnounce(kind) {
      this.editAnnounce = null;          // create mode
      this.createAnnounceKind = kind ?? "sell";
      this.createAnnounceOpen = true;
    },
    onEditAnnounce(announce) {
      this.editAnnounce = announce;      // edit mode (detail dialog already closed itself)
      this.createAnnounceOpen = true;
    },
    onAnnounceCreated() {
      this.loadAnnounces();
    },
    onAnnounceDeleted() {
      this.loadAnnounces();
    },
    onAnnounceUpdated() {
      this.loadAnnounces();
    },
  },
  watch: {
    filterCardName(val) { this.loadCardTraders(val); },
    activeTab(val)       { this.$emit('tabChange', val); },
    initialTab(val)      { this.activeTab = val; },
  },
  async mounted() {
    await this.loadMyProfile();
    const matchesLoad = this.filterCardName
      ? this.loadCardTraders(this.filterCardName)
      : this.loadMatches();
    await Promise.all([matchesLoad, this.loadProposals(), this.loadAnnounces()]);

    const debouncedLoadMatches   = debounce(() => { if (!this.filterCardName) this.loadMatches(); }, 600);
    const debouncedLoadProposals = debounce(() => this.loadProposals(), 600);
    const debouncedLoadAnnounces = debounce(() => this.loadAnnounces(), 600);

    this.subscription = getClient()
      .channel("trade-center-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "Card" },  debouncedLoadMatches)
      .on("postgres_changes", { event: "*", schema: "public", table: "Trade" }, debouncedLoadProposals)
      .on("postgres_changes", { event: "*", schema: "public", table: "announce" }, debouncedLoadAnnounces)
      .subscribe();
  },
  beforeUnmount() {
    if (this.subscription) getClient().removeChannel(this.subscription);
  },
};
</script>
