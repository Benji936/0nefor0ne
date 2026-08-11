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

    <!--
      Cancelling an accepted trade cannot be undone, so it is the one action in
      this flow that asks. Named, not generic: the counterparty is in the
      sentence, because "are you sure?" tells nobody anything.
    -->
    <v-dialog v-model="cancelConfirm.open" max-width="440">
      <v-card style="background-color: var(--c-surface); color: var(--c-text); border: 1px solid var(--c-border)" class="!rounded-2xl">
        <div class="flex flex-col gap-3 px-6 pt-6">
          <div class="flex items-center gap-3">
            <v-icon icon="mdi-alert-circle-outline" size="22" color="var(--c-accent)" />
            <p class="text-base font-bold" style="color: var(--c-text)">{{ $t('tradeCenter.cancelConfirmTitle') }}</p>
          </div>
          <p class="text-sm" style="color: var(--c-muted); line-height: 1.55">
            {{ $t('tradeCenter.cancelConfirmBody', { name: cancelConfirm.proposal?.counterparty_name ?? $t('common.anonymous') }) }}
          </p>
        </div>
        <div class="flex justify-end gap-2 px-6 py-5">
          <v-btn variant="text" style="color: var(--c-muted)" :disabled="cancelConfirm.working"
            @click="cancelConfirm.open = false">{{ $t('tradeCenter.cancelConfirmKeep') }}</v-btn>
          <v-btn variant="flat" style="background-color: var(--c-accent); color: white"
            :loading="cancelConfirm.working"
            @click="doCancel(cancelConfirm.proposal)">{{ $t('tradeCenter.cancelConfirmDo') }}</v-btn>
        </div>
      </v-card>
    </v-dialog>

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
import { tradeErrorKey, isStaleTradeError } from "@/lib/tradeErrors";
import { fetchAnnounces } from "@/lib/announces";

/** The tabs, in order. First one is what a bare /trade means. Kept in step with
 *  the route's `:tab` matcher in router/index.js. */
const TABS = ["matches", "proposals", "announces"];

export default {
  props: {
    login:          { type: Object, default: null },
    filterCardName: { type: String, default: "" },
  },
  emits: ["clearFilter"],
  data() {
    return {
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
      // Set when a reload was asked for while one was already running.
      matchesStale:       false,
      proposalsStale:     false,
      announcesStale:     false,
      dialogOpen:         false,
      dialogUser:         null,
      editProposal:       null,
      counterProposal:    null,
      snackbar:           { open: false, message: "", color: null },
      // Cancelling an accepted trade is asked about first; see onCancel.
      cancelConfirm:      { open: false, proposal: null, working: false },
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
    // The open tab IS the URL. Reading and writing it through the route means a
    // tab is linkable, survives a refresh and answers the back button, and it
    // keeps every existing `activeTab = "proposals"` in this file working —
    // those now navigate instead of mutating local state.
    activeTab: {
      get() { return this.$route.params.tab || TABS[0]; },
      set(tab) {
        if (!TABS.includes(tab) || tab === this.activeTab) return;
        this.$router.push({ name: "TradeCenter", params: { ...this.$route.params, tab } });
      },
    },
    tabs() {
      const pendingCount = this.proposals.filter(p => p.status === "pending" && !p.i_am_proposer).length;
      return [
        { key: "matches",   label: this.$t("tradeCenter.matches"),   icon: "mdi-account-group-outline", badge: 0 },
        { key: "proposals", label: this.$t("tradeCenter.proposals"), icon: "mdi-swap-horizontal-bold",  badge: pendingCount },
        { key: "announces", label: this.$t("tradeCenter.announces"), icon: "mdi-bullhorn-outline",  badge: 0 },
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
    // The three loaders below re-run themselves when something asked for a
    // reload while one was already in flight. They used to return early in that
    // case, which threw the request away — and the request thrown away was the
    // most recent one, so a change landing during a slow fetch left the screen
    // showing the state from before it. That is the half of the staleness that
    // survived even once the realtime channel was delivering.
    async loadMatches() {
      if (!this.login?.user?.id) return;
      if (this.loadingMatches) { this.matchesStale = true; return; }
      this.loadingMatches = true;
      try   { this.allMatches = await fetchMatches(); }
      catch (err) { console.error(err); }
      finally { this.loadingMatches = false; }
      if (this.matchesStale) { this.matchesStale = false; return this.loadMatches(); }
    },
    async loadProposals() {
      if (!this.login?.user?.id) return;
      if (this.loadingProposals) { this.proposalsStale = true; return; }
      this.loadingProposals = true;
      try   { this.proposals = await fetchMyProposals(); }
      catch (err) { console.error(err); }
      finally { this.loadingProposals = false; }
      if (this.proposalsStale) { this.proposalsStale = false; return this.loadProposals(); }
    },
    async loadAnnounces() {
      if (!this.login?.user?.id) return;
      if (this.loadingAnnounces) { this.announcesStale = true; return; }
      this.loadingAnnounces = true;
      try   { this.announces = await fetchAnnounces(); }
      catch (err) { console.error(err); }
      finally { this.loadingAnnounces = false; }
      if (this.announcesStale) { this.announcesStale = false; return this.loadAnnounces(); }
    },
    /** Everything the three tabs show, reloaded. Used when we cannot trust that
     *  we heard about changes — coming back to a backgrounded tab, or regaining
     *  a network connection. */
    refreshAll() {
      if (!this.filterCardName) this.loadMatches();
      this.loadProposals();
      this.loadAnnounces();
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
    /**
     * Say what went wrong in the user's language instead of Postgres's.
     *
     * A status clash almost always means the other side acted while this page
     * was open, so the row on screen is a lie either way: reload it.
     */
    reportTradeError(err, fallbackKey) {
      this.snackbar = {
        open: true,
        message: this.$t(tradeErrorKey(err, fallbackKey)),
        color: "var(--c-accent)",
      };
      if (isStaleTradeError(err)) this.loadProposals();
    },
    async onAccept(proposal) {
      try {
        await acceptTradeProposal(proposal.id);
        this.snackbar = { open: true, message: this.$t('tradeCenter.tradeAccepted'), color: "var(--c-mutual)" };
        await this.loadProposals();
      } catch (err) {
        this.reportTradeError(err, 'tradeCenter.failedToAccept');
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
        this.reportTradeError(err, 'tradeCenter.failedToDecline');
      }
    },
    /**
     * Cancelling a pending proposal withdraws an offer nobody has agreed to, so
     * it goes straight through. Cancelling an *accepted* trade tears up an
     * agreement two people made, possibly after arranging to meet, and no path
     * reverses it — that one asks first.
     */
    onCancel(proposal) {
      if (proposal?.status === 'accepted') {
        this.cancelConfirm = { open: true, proposal, working: false };
        return;
      }
      this.doCancel(proposal);
    },
    async doCancel(proposal) {
      if (!proposal) return;
      this.cancelConfirm.working = true;
      try {
        await cancelTradeProposal(proposal.id);
        this.snackbar = { open: true, message: this.$t('tradeCenter.tradeCancelled'), color: "var(--c-muted)" };
        await this.loadProposals();
      } catch (err) {
        this.reportTradeError(err, 'tradeCenter.failedToCancel');
      } finally {
        this.cancelConfirm = { open: false, proposal: null, working: false };
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

    // One canonical URL per view. /trade stays a valid way in — plenty of links
    // and bookmarks point at it — but it settles on /trade/matches.
    //
    // A watcher rather than a line in mounted(): arriving at /trade from inside
    // the app reuses this component, so mounted() would not run and the bare
    // URL would sit there. `immediate` covers the fresh-load case mounted()
    // used to. `replace`, so the back button leaves rather than bouncing here.
    "$route.params.tab": {
      immediate: true,
      handler(tab) {
        if (tab || this.$route.name !== "TradeCenter") return;
        this.$router.replace({ name: "TradeCenter", params: { ...this.$route.params, tab: TABS[0] } });
      },
    },

    // Load once the session actually arrives.
    //
    // App restores the session asynchronously and this component is not gated
    // on it, so opening a tab by its URL mounts us with `login` still null —
    // and every loader bails on that. Nothing ran them again, which is why a
    // deep link came up empty while reaching the same tab from inside the app
    // worked: by then the session was already there.
    //
    // The id, not the object: the session is replaced on every token refresh,
    // and refetching all three tabs each time it is would be pure waste.
    "login.user.id": {
      async handler(id, was) {
        if (!id) {
          // Signed out. Signing out in this tab bounces off the trade centre,
          // but signing out in another one does not — that just clears the
          // session here and leaves us mounted, so drop the previous account's
          // data rather than leaving it on screen for whoever is looking now.
          this.allMatches = []; this.proposals = []; this.announces = [];
          return;
        }
        if (id === was) return;
        await this.loadMyProfile();  // trade_scope decides which matches survive
        this.refreshAll();
      },
    },
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

    // One channel per table, not one channel for all three.
    //
    // These used to share a channel, and that is what broke the whole tab. A
    // postgres_changes binding naming a table that is not in the supabase_realtime
    // publication invalidates the entire channel — every other binding on it goes
    // silent too, while subscribe() still reports SUBSCRIBED. `Trade` was not
    // published, so it took matches and announces down with it and said nothing.
    // The publication is fixed (20260810_trade_realtime.sql); separate channels
    // are so the next such mistake costs one tab instead of three.
    //
    // Kept off `data`: Vue would hand back a reactive proxy of the channel, and
    // removeChannel matches by identity.
    this._subscriptions = [
      ["trade-center-matches",   "Card",     debouncedLoadMatches],
      ["trade-center-proposals", "Trade",    debouncedLoadProposals],
      ["trade-center-announces", "announce", debouncedLoadAnnounces],
    ].map(([name, table, handler]) =>
      getClient()
        .channel(name)
        .on("postgres_changes", { event: "*", schema: "public", table }, handler)
        // Without this the failure modes are all silent. A channel that errors
        // or times out simply stops updating, and the only clue is a screen
        // that will not move. CLOSED is not in the list: leaving the page closes
        // these on purpose, and shouting about it would bury the real faults.
        .subscribe((status) => {
          if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
            console.error(`realtime: ${name} is ${status}; ${table} will not live-update`);
          }
        })
    );

    // A websocket does not survive a sleeping laptop or a backgrounded tab, and
    // whatever happened while it was down was never delivered. Re-read on the
    // way back rather than trusting a connection we know was interrupted.
    this._onWake = () => { if (document.visibilityState === "visible") this.refreshAll(); };
    document.addEventListener("visibilitychange", this._onWake);
    window.addEventListener("online", this._onWake);
  },
  beforeUnmount() {
    (this._subscriptions ?? []).forEach((ch) => getClient().removeChannel(ch));
    this._subscriptions = [];
    if (this._onWake) {
      document.removeEventListener("visibilitychange", this._onWake);
      window.removeEventListener("online", this._onWake);
    }
  },
};
</script>
