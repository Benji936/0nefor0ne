<script setup>
/**
 * One tournament, from the inside.
 *
 * The page is ordered by what the reader came for, and for a player that is one
 * thing: which table am I on and who am I playing. That answer is the first
 * block under the header, before the pairing list, before the standings —
 * scanning a list of twenty tables for your own name is exactly the friction
 * this product exists to remove. Everyone else falls through to the list.
 *
 * Every control on this page is offered by lib/tournaments.js and enforced
 * again by the database. Nothing here decides anything: a spectator is shown no
 * action because matchAction() gives them none, and would be refused by RLS if
 * the markup were wrong. The interface's job is not to offer a button that is
 * going to fail.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";
import { getCurrentSession, onAuthChange } from "@/lib/supabaseClient";
import {
  fetchTournament, fetchPlayers, fetchRounds, fetchMatches, fetchStandings, fetchMyEntry,
  registerForTournament, checkInToTournament, dropFromTournament,
  setTournamentStatus, startTournament, finishTournament, generateRound,
  submitResult, confirmResult, disputeResult, resolveMatch,
  matchAction, myPairing, opponentOf, scoreFor, organizerControls, playerControls,
  byTable, isLegalScore, roundsToWin,
} from "@/lib/tournaments";

const route = useRoute();
const { t } = useI18n();

const tournamentId = computed(() => Number(route.params.id));
const localeParam  = computed(() => route.params.locale || "en");

const tournament = ref(null);
const players    = ref([]);
const rounds     = ref([]);
const matches    = ref([]);
const standings  = ref([]);
const myEntry    = ref(null);
const userId     = ref(null);

const loading  = ref(true);
const notFound = ref(false);
const busy     = ref(null);   // the id of whatever action is in flight
const errorMsg = ref("");

let unsub = null;

// ── Derived ───────────────────────────────────────────────────────────────────

const isOrganizer = computed(() => !!userId.value && tournament.value?.community?.owner === userId.value);
const myEntrantId = computed(() => myEntry.value?.id ?? null);

const currentRound = computed(() => {
  const rs = rounds.value;
  return rs.length ? rs[rs.length - 1] : null;
});

const roundMatches = computed(() =>
  byTable(matches.value.filter((m) => m.round === currentRound.value?.id)));

const nameOf = computed(() => {
  const byId = new Map(players.value.map((p) => [p.id, p.display_name]));
  return (entrantId) => byId.get(entrantId) ?? "—";
});

const myMatch = computed(() => myPairing(roundMatches.value, myEntrantId.value));

const ctrl   = computed(() => organizerControls(tournament.value, roundMatches.value));
const pctrl  = computed(() => playerControls(tournament.value, myEntry.value));

const activePlayers = computed(() => players.value.filter((p) => !p.dropped_at));

function actionFor(m) {
  return matchAction(m, myEntrantId.value, {
    isOrganizer: isOrganizer.value,
    tournamentStatus: tournament.value?.status,
  });
}

function statusLabel(status) {
  const key = {
    draft: "statusDraft", registration: "statusRegistration", check_in: "statusCheckIn",
    active: "statusActive", completed: "statusCompleted", cancelled: "statusCancelled",
  }[status];
  return key ? t(`tournament.${key}`) : status;
}

const progressLabel = computed(() => {
  const x = tournament.value;
  if (!x || x.status !== "active") return null;
  if (!x.current_round) return t("tournament.notStarted");
  return x.total_rounds
    ? t("tournament.roundOf", { n: x.current_round, total: x.total_rounds })
    : t("tournament.round", { n: x.current_round });
});

// Unlinked from search on purpose while this is new: a tournament page is for
// the people in it, and an empty one indexed is worse than none.
useHead(() => ({
  title: tournament.value ? `${tournament.value.name} — 0nefor.one` : "0nefor.one",
  meta: [{ name: "robots", content: "noindex" }],
}));

// ── Loading ───────────────────────────────────────────────────────────────────

let reqId = 0;
async function load() {
  const id = tournamentId.value;
  if (!Number.isFinite(id)) { notFound.value = true; loading.value = false; return; }
  const myId = ++reqId;
  loading.value = true;
  try {
    const row = await fetchTournament(id);
    if (myId !== reqId) return;
    if (!row) { notFound.value = true; return; }
    tournament.value = row;

    const [ps, rs, ms, st, mine] = await Promise.all([
      fetchPlayers(id),
      fetchRounds(id),
      fetchMatches(id),
      fetchStandings(id),
      fetchMyEntry(id, userId.value),
    ]);
    if (myId !== reqId) return;
    players.value   = ps;
    rounds.value    = rs;
    matches.value   = ms;
    standings.value = st;
    myEntry.value   = mine;
  } catch (e) {
    if (myId !== reqId) return;
    console.error("TournamentPage: load failed", e);
    notFound.value = true;
  } finally {
    if (myId === reqId) loading.value = false;
  }
}

onMounted(async () => {
  const session = await getCurrentSession();
  userId.value = session?.user?.id ?? null;
  unsub = onAuthChange((auth) => {
    userId.value = auth?.user?.id ?? null;
    load();
  });
  await load();
});

onBeforeUnmount(() => { unsub?.(); });
watch(tournamentId, load);

// ── Acting ────────────────────────────────────────────────────────────────────
//
// One wrapper for every mutation. They all have the same shape: lock the
// control, call the RPC, reload, and put the database's refusal on the screen
// rather than in the console. A tournament is a live event and a silent failure
// mid-round is the worst kind.
async function act(key, fn) {
  if (busy.value) return;
  busy.value = key;
  errorMsg.value = "";
  try {
    await fn();
    await load();
  } catch (e) {
    console.error(`TournamentPage: ${key} failed`, e);
    errorMsg.value = e?.message || t("tournament.actionFailed");
  } finally {
    busy.value = null;
  }
}

// ── Reporting a result ────────────────────────────────────────────────────────

const reportFor  = ref(null);   // match id whose report form is open
const reportMine = ref(0);
const reportTheirs = ref(0);
const reportDraws  = ref(0);

const disputeFor    = ref(null);
const disputeReason = ref("");

const resolveFor = ref(null);
const resolveA   = ref(0);
const resolveB   = ref(0);
const resolveDraws = ref(0);
const resolveNote  = ref("");

function openReport(m) {
  reportFor.value = m.id;
  const s = scoreFor(m, myEntrantId.value);
  reportMine.value   = s.mine;
  reportTheirs.value = s.theirs;
  reportDraws.value  = s.draws;
  errorMsg.value = "";
}

function openResolve(m) {
  resolveFor.value = m.id;
  resolveA.value = m.score_a;
  resolveB.value = m.score_b;
  resolveDraws.value = m.draws ?? 0;
  resolveNote.value = m.resolution_note ?? "";
  errorMsg.value = "";
}

const fmt = computed(() => tournament.value?.match_format ?? 3);
const maxGames = computed(() => roundsToWin(fmt.value));

const reportValid = computed(() =>
  isLegalScore(fmt.value, Number(reportMine.value), Number(reportTheirs.value), Number(reportDraws.value)));
const resolveValid = computed(() =>
  isLegalScore(fmt.value, Number(resolveA.value), Number(resolveB.value), Number(resolveDraws.value)));

/** The reporter's numbers are entered from their own seat, so they are put back
 *  into the match's A/B order before they are sent. */
async function sendReport(m) {
  const flipped = m.player_b === myEntrantId.value;
  const a = flipped ? Number(reportTheirs.value) : Number(reportMine.value);
  const b = flipped ? Number(reportMine.value)   : Number(reportTheirs.value);
  await act(`report-${m.id}`, () => submitResult(m.id, a, b, Number(reportDraws.value)));
  reportFor.value = null;
}

async function sendDispute(m) {
  await act(`dispute-${m.id}`, () => disputeResult(m.id, disputeReason.value));
  disputeFor.value = null;
  disputeReason.value = "";
}

async function sendResolve(m) {
  await act(`resolve-${m.id}`, () =>
    resolveMatch(m.id, Number(resolveA.value), Number(resolveB.value), Number(resolveDraws.value), resolveNote.value));
  resolveFor.value = null;
}
</script>

<template>
  <div class="tp">
    <div v-if="loading" class="tp__state">
      <v-progress-circular indeterminate size="28" width="3" color="primary" />
    </div>

    <p v-else-if="notFound" class="tp__state tp__state--muted">{{ t('tournament.notFound') }}</p>

    <template v-else>
      <!-- ── Header ───────────────────────────────────────────────────────── -->
      <header class="tp-head">
        <router-link
          class="tp-head__back"
          :to="{ name: 'communityProfile', params: { locale: localeParam, slug: tournament.community.slug } }"
        >
          <v-icon icon="mdi-chevron-left" size="18" />
          {{ tournament.community.name }}
        </router-link>

        <h1 class="tp-head__name">{{ tournament.name }}</h1>

        <div class="tp-head__meta">
          <span class="chip" :class="`chip--${tournament.status}`">{{ statusLabel(tournament.status) }}</span>
          <span class="chip chip--quiet">{{ t('tournament.swiss') }}</span>
          <span class="chip chip--quiet">{{ t('tournament.bestOf', { n: tournament.match_format }) }}</span>
          <span v-if="progressLabel" class="chip chip--quiet">{{ progressLabel }}</span>
          <span class="chip chip--quiet">{{ t('tournament.playersCount', { n: activePlayers.length }) }}</span>
        </div>

        <p v-if="tournament.description" class="tp-head__desc">{{ tournament.description }}</p>
      </header>

      <p v-if="errorMsg" class="tp-error" role="alert">
        <v-icon icon="mdi-alert-circle-outline" size="16" />{{ errorMsg }}
      </p>

      <!-- ── Joining ──────────────────────────────────────────────────────── -->
      <section v-if="pctrl.register || pctrl.checkIn || pctrl.registered" class="tp-join">
        <template v-if="userId">
          <button
            v-if="pctrl.register"
            type="button"
            class="btn-primary"
            :disabled="busy === 'register'"
            @click="act('register', () => registerForTournament(tournament.id))"
          >
            <v-icon icon="mdi-account-plus-outline" size="17" />
            {{ t('tournament.register') }}
          </button>

          <template v-else-if="pctrl.registered">
            <span class="tp-join__in">
              <v-icon icon="mdi-check-circle-outline" size="17" />
              {{ myEntry.checked_in ? t('tournament.checkedIn') : t('tournament.registered') }}
            </span>
            <button
              v-if="pctrl.checkIn"
              type="button"
              class="btn-agree"
              :disabled="busy === 'checkin'"
              @click="act('checkin', () => checkInToTournament(tournament.id))"
            >
              {{ t('tournament.checkIn') }}
            </button>
            <button
              v-if="pctrl.drop"
              type="button"
              class="btn-quiet"
              :disabled="busy === 'drop'"
              @click="act('drop', () => dropFromTournament(tournament.id))"
            >
              {{ t('tournament.drop') }}
            </button>
          </template>
        </template>
        <p v-else class="tp-join__signin">{{ t('tournament.signInToJoin') }}</p>
      </section>

      <!-- ── Your match, first ────────────────────────────────────────────── -->
      <section v-if="myMatch" class="tp-mine" aria-labelledby="tp-mine-h">
        <h2 id="tp-mine-h" class="section-h">{{ t('tournament.yourMatch') }}</h2>
        <div class="mine-card">
          <span class="mine-card__table">{{ t('tournament.table', { n: myMatch.table_number }) }}</span>

          <p v-if="!myMatch.player_b" class="mine-card__bye">{{ t('tournament.bye') }}</p>

          <template v-else>
            <p class="mine-card__vs">
              <span class="mine-card__you">{{ myEntry.display_name }}</span>
              <span class="mine-card__sep">{{ t('tournament.versus') }}</span>
              <span class="mine-card__opp">{{ nameOf(opponentOf(myMatch, myEntrantId)) }}</span>
            </p>

            <p v-if="myMatch.status !== 'pending'" class="mine-card__score">
              {{ t('tournament.resultLine', scoreFor(myMatch, myEntrantId)) }}
            </p>

            <!-- What this player may do, straight from matchAction. -->
            <div class="mine-card__act">
              <template v-if="actionFor(myMatch) === 'report'">
                <button type="button" class="btn-primary" @click="openReport(myMatch)">
                  {{ t('tournament.reportResult') }}
                </button>
              </template>

              <template v-else-if="actionFor(myMatch) === 'awaiting_opponent'">
                <span class="mine-card__wait">
                  <v-icon icon="mdi-clock-outline" size="16" />
                  {{ t('tournament.awaitingOpponent', { name: nameOf(opponentOf(myMatch, myEntrantId)) }) }}
                </span>
                <button type="button" class="btn-quiet" @click="openReport(myMatch)">
                  {{ t('tournament.edit') }}
                </button>
              </template>

              <template v-else-if="actionFor(myMatch) === 'respond'">
                <span class="mine-card__wait">
                  {{ t('tournament.awaitingYou', { name: nameOf(myMatch.reported_by) }) }}
                </span>
                <button
                  type="button"
                  class="btn-agree"
                  :disabled="busy === `confirm-${myMatch.id}`"
                  @click="act(`confirm-${myMatch.id}`, () => confirmResult(myMatch.id))"
                >
                  <v-icon icon="mdi-check" size="16" />{{ t('tournament.confirm') }}
                </button>
                <button type="button" class="btn-quiet" @click="disputeFor = myMatch.id">
                  {{ t('tournament.dispute') }}
                </button>
              </template>

              <template v-else-if="actionFor(myMatch) === 'disputed'">
                <span class="mine-card__disputed">
                  <v-icon icon="mdi-alert-circle-outline" size="16" />{{ t('tournament.disputed') }}
                </span>
              </template>

              <template v-else-if="actionFor(myMatch) === 'final'">
                <span class="mine-card__final">{{ t('tournament.resultFinal') }}</span>
              </template>
            </div>

            <!-- Report form -->
            <form v-if="reportFor === myMatch.id" class="inline-form" @submit.prevent="sendReport(myMatch)">
              <p class="inline-form__hint">{{ t('tournament.reportHint') }}</p>
              <div class="inline-form__row">
                <label class="num">
                  <span>{{ t('tournament.yourGames') }}</span>
                  <input v-model.number="reportMine" type="number" min="0" :max="maxGames" />
                </label>
                <label class="num">
                  <span>{{ t('tournament.theirGames') }}</span>
                  <input v-model.number="reportTheirs" type="number" min="0" :max="maxGames" />
                </label>
                <label class="num">
                  <span>{{ t('tournament.drawnGames') }}</span>
                  <input v-model.number="reportDraws" type="number" min="0" :max="fmt" />
                </label>
              </div>
              <p v-if="!reportValid" class="inline-form__err">{{ t('tournament.err_scoreInvalid') }}</p>
              <div class="inline-form__act">
                <button type="button" class="btn-quiet" @click="reportFor = null">{{ t('tournament.cancel') }}</button>
                <button type="submit" class="btn-primary" :disabled="!reportValid || busy === `report-${myMatch.id}`">
                  {{ t('tournament.submit') }}
                </button>
              </div>
            </form>

            <!-- Dispute form -->
            <form v-if="disputeFor === myMatch.id" class="inline-form" @submit.prevent="sendDispute(myMatch)">
              <p class="inline-form__hint">{{ t('tournament.disputeHint') }}</p>
              <label class="inline-form__label" for="tp-dispute">{{ t('tournament.disputeTitle') }}</label>
              <textarea
                id="tp-dispute"
                v-model="disputeReason"
                class="inline-form__text"
                rows="2"
                maxlength="500"
                :placeholder="t('tournament.disputePlaceholder')"
              />
              <div class="inline-form__act">
                <button type="button" class="btn-quiet" @click="disputeFor = null">{{ t('tournament.cancel') }}</button>
                <button type="submit" class="btn-danger" :disabled="busy === `dispute-${myMatch.id}`">
                  {{ t('tournament.dispute') }}
                </button>
              </div>
            </form>
          </template>
        </div>
      </section>

      <!-- ── Pairings ─────────────────────────────────────────────────────── -->
      <section v-if="currentRound" class="tp-block" aria-labelledby="tp-pair-h">
        <h2 id="tp-pair-h" class="section-h">
          {{ t('tournament.pairings') }} · {{ t('tournament.round', { n: currentRound.round_number }) }}
        </h2>

        <ul class="pair-list">
          <li v-for="m in roundMatches" :key="m.id" class="pair" :class="{ 'pair--mine': m.id === myMatch?.id }">
            <span class="pair__table">{{ m.table_number }}</span>
            <div class="pair__names">
              <span class="pair__a" :class="{ 'pair__won': m.winner === m.player_a }">{{ nameOf(m.player_a) }}</span>
              <template v-if="m.player_b">
                <span class="pair__sep">{{ t('tournament.versus') }}</span>
                <span class="pair__b" :class="{ 'pair__won': m.winner === m.player_b }">{{ nameOf(m.player_b) }}</span>
              </template>
              <span v-else class="pair__bye">{{ t('tournament.byeShort') }}</span>
            </div>

            <span v-if="m.status === 'completed'" class="pair__score">{{ m.score_a }}–{{ m.score_b }}</span>
            <span v-else-if="m.status === 'disputed'" class="pair__flag pair__flag--dispute">
              <v-icon icon="mdi-alert-circle-outline" size="14" />
            </span>
            <span v-else-if="m.status === 'awaiting_confirmation'" class="pair__flag">
              <v-icon icon="mdi-clock-outline" size="14" />
            </span>

            <button
              v-if="isOrganizer && m.player_b"
              type="button"
              class="pair__resolve"
              @click="openResolve(m)"
            >
              {{ t('tournament.resolve') }}
            </button>

            <!-- Organizer ruling, inline under the row it belongs to. -->
            <form v-if="resolveFor === m.id" class="inline-form pair__form" @submit.prevent="sendResolve(m)">
              <p class="inline-form__hint">{{ t('tournament.resolveHint') }}</p>
              <p v-if="m.dispute_reason" class="inline-form__quote">
                {{ t('tournament.disputedBy', { name: nameOf(m.disputed_by) }) }}: “{{ m.dispute_reason }}”
              </p>
              <div class="inline-form__row">
                <label class="num">
                  <span>{{ nameOf(m.player_a) }}</span>
                  <input v-model.number="resolveA" type="number" min="0" :max="maxGames" />
                </label>
                <label class="num">
                  <span>{{ nameOf(m.player_b) }}</span>
                  <input v-model.number="resolveB" type="number" min="0" :max="maxGames" />
                </label>
                <label class="num">
                  <span>{{ t('tournament.drawnGames') }}</span>
                  <input v-model.number="resolveDraws" type="number" min="0" :max="fmt" />
                </label>
              </div>
              <label class="inline-form__label" :for="`tp-note-${m.id}`">{{ t('tournament.resolutionNote') }}</label>
              <textarea
                :id="`tp-note-${m.id}`"
                v-model="resolveNote"
                class="inline-form__text"
                rows="2"
                maxlength="500"
                :placeholder="t('tournament.resolutionPlaceholder')"
              />
              <p v-if="!resolveValid" class="inline-form__err">{{ t('tournament.err_scoreInvalid') }}</p>
              <div class="inline-form__act">
                <button type="button" class="btn-quiet" @click="resolveFor = null">{{ t('tournament.cancel') }}</button>
                <button type="submit" class="btn-primary" :disabled="!resolveValid || busy === `resolve-${m.id}`">
                  {{ t('tournament.resolve') }}
                </button>
              </div>
            </form>
          </li>
        </ul>
      </section>

      <p v-else-if="tournament.status === 'active'" class="tp-empty">{{ t('tournament.noPairingsYet') }}</p>

      <!-- ── Standings ────────────────────────────────────────────────────── -->
      <section v-if="standings.length" class="tp-block" aria-labelledby="tp-stand-h">
        <h2 id="tp-stand-h" class="section-h">{{ t('tournament.standings') }}</h2>
        <div class="table-scroll">
          <table class="stand">
            <thead>
              <tr>
                <th scope="col" class="stand__num">{{ t('tournament.colRank') }}</th>
                <th scope="col">{{ t('tournament.colPlayer') }}</th>
                <th scope="col" class="stand__num">{{ t('tournament.colPlayed') }}</th>
                <th scope="col" class="stand__num">{{ t('tournament.colWins') }}</th>
                <th scope="col" class="stand__num">{{ t('tournament.colDraws') }}</th>
                <th scope="col" class="stand__num">{{ t('tournament.colLosses') }}</th>
                <th scope="col" class="stand__num">{{ t('tournament.colPoints') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in standings"
                :key="s.entrant_id"
                :class="{ 'stand--me': s.entrant_id === myEntrantId, 'stand--out': s.dropped }"
              >
                <td class="stand__num">{{ s.rank }}</td>
                <td>
                  {{ s.display_name }}
                  <span v-if="s.dropped" class="stand__dropped">{{ t('tournament.dropped') }}</span>
                </td>
                <td class="stand__num">{{ s.played }}</td>
                <td class="stand__num">{{ s.wins }}</td>
                <td class="stand__num">{{ s.draws }}</td>
                <td class="stand__num">{{ s.losses }}</td>
                <td class="stand__num stand__pts">{{ s.points }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Participants, before anyone has played ───────────────────────── -->
      <section v-if="tournament.status !== 'active' && tournament.status !== 'completed'" class="tp-block" aria-labelledby="tp-part-h">
        <h2 id="tp-part-h" class="section-h">{{ t('tournament.participants') }}</h2>
        <ul v-if="activePlayers.length" class="part-list">
          <li v-for="p in activePlayers" :key="p.id" class="part">
            <span class="part__name">{{ p.display_name }}</span>
            <v-icon v-if="p.checked_in" icon="mdi-check-circle-outline" size="15" class="part__in" />
          </li>
        </ul>
        <p v-else class="tp-empty">{{ t('tournament.noParticipants') }}</p>
      </section>

      <!-- ── Organizer ────────────────────────────────────────────────────── -->
      <section v-if="isOrganizer" class="tp-org" aria-labelledby="tp-org-h">
        <h2 id="tp-org-h" class="section-h">{{ t('tournament.organizerTitle') }}</h2>

        <p v-if="ctrl.disputes" class="tp-org__note tp-org__note--warn">
          <v-icon icon="mdi-alert-circle-outline" size="15" />
          {{ t('tournament.disputesWaiting', { n: ctrl.disputes }) }}
        </p>
        <p v-else-if="ctrl.roundInProgress" class="tp-org__note">
          <v-icon icon="mdi-clock-outline" size="15" />
          {{ t('tournament.roundInProgress', { n: ctrl.openMatches }) }}
        </p>

        <div class="tp-org__row">
          <button
            v-if="ctrl.openRegistration"
            type="button" class="btn-primary" :disabled="!!busy"
            @click="act('open-reg', () => setTournamentStatus(tournament.id, 'registration'))"
          >{{ t('tournament.openRegistration') }}</button>

          <button
            v-if="ctrl.openCheckIn"
            type="button" class="btn-quiet" :disabled="!!busy"
            @click="act('open-checkin', () => setTournamentStatus(tournament.id, 'check_in'))"
          >{{ t('tournament.openCheckIn') }}</button>

          <button
            v-if="ctrl.start"
            type="button" class="btn-primary" :disabled="!!busy"
            @click="act('start', () => startTournament(tournament.id))"
          >{{ t('tournament.startTournament') }}</button>

          <button
            v-if="ctrl.generateRound"
            type="button" class="btn-primary" :disabled="!!busy"
            @click="act('round', () => generateRound(tournament.id))"
          >{{ t('tournament.generateRound', { n: ctrl.nextRoundNumber }) }}</button>

          <button
            v-if="ctrl.finish"
            type="button" class="btn-agree" :disabled="!!busy"
            @click="act('finish', () => finishTournament(tournament.id))"
          >{{ t('tournament.finishTournament') }}</button>

          <button
            v-if="ctrl.cancel"
            type="button" class="btn-quiet" :disabled="!!busy"
            @click="act('cancel', () => setTournamentStatus(tournament.id, 'cancelled'))"
          >{{ t('tournament.cancelTournament') }}</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tp {
  max-width: 900px; margin: 0 auto;
  padding: 20px 16px 64px;
  display: flex; flex-direction: column; gap: 26px;
}
@media (min-width: 700px) { .tp { padding: 32px 24px 80px; } }

.tp__state { display: flex; justify-content: center; padding: 60px 0; }
.tp__state--muted { color: var(--c-muted); font-size: 0.9rem; }

/* ── Header ── */
.tp-head { display: flex; flex-direction: column; gap: 10px; }
.tp-head__back {
  display: inline-flex; align-items: center; gap: 2px; align-self: flex-start;
  min-height: 34px; color: var(--c-muted); font-size: 0.8rem; font-weight: 700;
  text-decoration: none; transition: color 0.15s ease;
}
.tp-head__back:hover { color: var(--c-trade); }
.tp-head__back:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }

.tp-head__name { margin: 0; font-size: 1.5rem; font-weight: 800; line-height: 1.2; color: var(--c-text); }
@media (min-width: 700px) { .tp-head__name { font-size: 1.85rem; } }

.tp-head__meta { display: flex; flex-wrap: wrap; gap: 6px; }
.tp-head__desc { margin: 4px 0 0; color: var(--c-muted); font-size: 0.9rem; line-height: 1.55; max-width: 65ch; }

.chip {
  display: inline-flex; align-items: center;
  padding: 4px 10px; border-radius: 999px;
  font-size: 0.66rem; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase;
  background: var(--c-surface-2); color: var(--c-muted); white-space: nowrap;
}
.chip--quiet { background: transparent; border: 1px solid var(--c-border); }
.chip--registration, .chip--check_in { background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade); }
.chip--active { background: color-mix(in srgb, var(--c-trade) 28%, transparent); color: var(--c-trade); }

.tp-error {
  display: flex; align-items: center; gap: 7px; margin: 0;
  padding: 10px 13px; border-radius: 11px;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  color: #ef4444; font-size: 0.82rem; font-weight: 600;
}

/* The Uppercase Section Rule. */
.section-h {
  margin: 0 0 12px;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--c-muted);
}

.tp-block { display: flex; flex-direction: column; }
.tp-empty { margin: 0; color: var(--c-muted); font-size: 0.88rem; }

/* ── Buttons ──
   Amethyst offers, teal agrees (DESIGN.md, The Agreement Rule): Confirm and
   Finish are the two moments where two parties line up, so they are the two
   teal controls on the page. */
.btn-primary, .btn-agree, .btn-quiet, .btn-danger {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 38px; padding: 0 16px; border-radius: 999px;
  font-size: 0.8rem; font-weight: 700; cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.btn-primary { background: var(--c-trade); color: var(--c-on-accent); }
.btn-agree   { background: var(--c-mutual); color: var(--c-on-accent); }
.btn-quiet   { background: transparent; border: 1px solid var(--c-border); color: var(--c-muted); }
.btn-danger  { background: color-mix(in srgb, #ef4444 14%, transparent); color: #ef4444; }
.btn-primary:hover:not(:disabled), .btn-agree:hover:not(:disabled) { opacity: 0.88; }
.btn-quiet:hover:not(:disabled) { background: var(--c-surface-2); color: var(--c-text); }
.btn-danger:hover:not(:disabled) { background: color-mix(in srgb, #ef4444 24%, transparent); }
.btn-primary:disabled, .btn-agree:disabled, .btn-quiet:disabled, .btn-danger:disabled { opacity: 0.45; pointer-events: none; }
.btn-primary:focus-visible, .btn-agree:focus-visible, .btn-quiet:focus-visible, .btn-danger:focus-visible {
  outline: 2px solid var(--c-trade); outline-offset: 2px;
}

/* ── Joining ── */
.tp-join { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.tp-join__in {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--c-mutual); font-size: 0.85rem; font-weight: 700;
}
.tp-join__signin { margin: 0; color: var(--c-muted); font-size: 0.85rem; }

/* ── Your match ── */
.mine-card {
  display: flex; flex-direction: column; gap: 10px;
  padding: 16px 18px; border-radius: 16px;
  background: var(--c-surface);
  border: 1px solid color-mix(in srgb, var(--c-trade) 40%, transparent);
}
.mine-card__table {
  align-self: flex-start;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.68rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--c-trade);
}
.mine-card__vs { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.mine-card__you, .mine-card__opp { font-size: 1.05rem; font-weight: 700; color: var(--c-text); }
.mine-card__sep { color: var(--c-muted); font-size: 0.8rem; }
.mine-card__bye { margin: 0; color: var(--c-muted); font-size: 0.9rem; }
.mine-card__score {
  margin: 0; font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 1.15rem; font-weight: 700; color: var(--c-text);
}
.mine-card__act { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.mine-card__wait { display: inline-flex; align-items: center; gap: 6px; color: var(--c-muted); font-size: 0.82rem; }
.mine-card__disputed { display: inline-flex; align-items: center; gap: 6px; color: #ef4444; font-size: 0.82rem; font-weight: 600; }
.mine-card__final { color: var(--c-muted); font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }

/* ── Inline forms ── */
.inline-form {
  display: flex; flex-direction: column; gap: 10px;
  padding: 14px; border-radius: 12px;
  background: var(--c-bg); border: 1px solid var(--c-border);
}
.inline-form__hint { margin: 0; color: var(--c-muted); font-size: 0.78rem; line-height: 1.5; }
.inline-form__quote { margin: 0; color: var(--c-text); font-size: 0.82rem; font-style: italic; }
.inline-form__row { display: flex; flex-wrap: wrap; gap: 10px; }
.inline-form__label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--c-muted); }
.inline-form__text {
  width: 100%; background: var(--c-surface); border: 1.5px solid var(--c-border);
  border-radius: 10px; padding: 8px 11px; font-size: 0.85rem; color: var(--c-text);
  font-family: inherit; resize: none; outline: none;
}
.inline-form__text:focus { border-color: var(--c-trade); }
.inline-form__err { margin: 0; color: #ef4444; font-size: 0.78rem; font-weight: 600; }
.inline-form__act { display: flex; gap: 8px; justify-content: flex-end; }

.num { display: flex; flex-direction: column; gap: 4px; flex: 1 1 92px; min-width: 0; }
.num > span { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--c-muted); }
.num > input {
  width: 100%; background: var(--c-surface); border: 1.5px solid var(--c-border);
  border-radius: 10px; padding: 8px 11px; font-size: 0.95rem; font-weight: 700;
  color: var(--c-text); outline: none;
}
.num > input:focus { border-color: var(--c-trade); }

/* ── Pairings ── */
.pair-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.pair {
  display: grid;
  grid-template-columns: 34px 1fr auto auto;
  align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 11px;
  background: var(--c-surface); border: 1px solid transparent;
}
.pair--mine { border-color: color-mix(in srgb, var(--c-trade) 40%, transparent); }
.pair__table {
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: 0.85rem; font-weight: 700; color: var(--c-muted); text-align: center;
}
.pair__names { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; min-width: 0; }
.pair__a, .pair__b { font-size: 0.9rem; font-weight: 600; color: var(--c-text); }
.pair__won { font-weight: 800; }
.pair__sep, .pair__bye { color: var(--c-muted); font-size: 0.78rem; }
.pair__score { font-family: ui-monospace, "Cascadia Code", monospace; font-weight: 700; color: var(--c-text); font-size: 0.9rem; }
.pair__flag { color: var(--c-muted); display: inline-flex; }
.pair__flag--dispute { color: #ef4444; }
.pair__resolve {
  min-height: 30px; padding: 0 11px; border-radius: 999px;
  border: 1px solid var(--c-border); background: transparent;
  color: var(--c-muted); font-size: 0.72rem; font-weight: 700; cursor: pointer;
}
.pair__resolve:hover { background: var(--c-surface-2); color: var(--c-text); }
.pair__resolve:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; }
/* The ruling form spans the row it belongs to rather than sitting in a column. */
.pair__form { grid-column: 1 / -1; margin-top: 8px; }

/* ── Standings ── */
/* Wide content scrolls inside its own box; the page body never scrolls sideways. */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.stand { width: 100%; border-collapse: collapse; font-size: 0.87rem; min-width: 460px; }
.stand th {
  text-align: left; padding: 8px 10px;
  font-size: 0.66rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--c-muted); border-bottom: 1px solid var(--c-border);
}
.stand td { padding: 9px 10px; border-bottom: 1px solid color-mix(in srgb, var(--c-border) 45%, transparent); color: var(--c-text); }
.stand__num { text-align: right; font-variant-numeric: tabular-nums; }
.stand th.stand__num { text-align: right; }
.stand__pts { font-weight: 800; }
.stand--me td { background: color-mix(in srgb, var(--c-trade) 10%, transparent); }
.stand--out td { color: var(--c-muted); }
.stand__dropped {
  margin-left: 6px; font-size: 0.66rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--c-muted);
}

/* ── Participants ── */
.part-list { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.part {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px; border-radius: 999px;
  background: var(--c-surface); border: 1px solid var(--c-border);
  font-size: 0.83rem; color: var(--c-text);
}
.part__in { color: var(--c-mutual); }

/* ── Organizer ── */
.tp-org {
  padding: 16px 18px; border-radius: 16px;
  background: var(--c-surface); border: 1px solid var(--c-border);
}
.tp-org__row { display: flex; flex-wrap: wrap; gap: 8px; }
.tp-org__note { display: flex; align-items: center; gap: 6px; margin: 0 0 12px; color: var(--c-muted); font-size: 0.82rem; }
.tp-org__note--warn { color: #ef4444; font-weight: 600; }

@media (pointer: coarse) {
  .btn-primary, .btn-agree, .btn-quiet, .btn-danger { min-height: 44px; }
  .pair__resolve { min-height: 36px; }
}
@media (prefers-reduced-motion: reduce) {
  .tp-head__back, .btn-primary, .btn-agree, .btn-quiet, .btn-danger { transition: none; }
}
</style>
