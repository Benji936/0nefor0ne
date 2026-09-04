<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { setupDiscord, requestContext, submitResult } from './discord.js';
import { createRoom } from './realtime.js';
import PlayerLife from './components/PlayerLife.vue';
import ToolsBar from './components/ToolsBar.vue';
import DuelTimer from './components/DuelTimer.vue';
import SidePanel from './components/SidePanel.vue';
import MatchPanel from './components/MatchPanel.vue';
import { canReport, resultForViewer, opponentName } from '../shared/tournamentResult.js';

const status = ref('connecting'); // connecting | ready | error
const errorMsg = ref('');
const me = ref(null);
const state = ref(null);
// Only ever set by a failed filing. The success path is visible in the state
// itself, because the room records it.
const reportError = ref('');
const reporting = ref(false);
let room = null;

const players = computed(() => {
  if (!state.value) return [];
  return Object.entries(state.value.players)
    .map(([uid, p]) => ({ uid, ...p, lp: state.value.lp[uid] ?? state.value.startLp }))
    .sort((a, b) => a.order - b.order);
});

function send(action) {
  if (room) room.send(action);
}

// ── The tournament, if this duel is one ──────────────────────────────────────

const tournament = computed(() => state.value?.tournament ?? null);
const opponent = computed(() => (state.value ? opponentName(state.value, me.value) : null));
const myResult = computed(() => (state.value ? resultForViewer(state.value, me.value) : null));
const reportable = computed(() => (state.value ? canReport(state.value) : { ok: false }));

/**
 * File the result with 0nefor.one.
 *
 * The scores go in the pairing's A/B order, which canReport worked out from the
 * seat map — sending them the other way round would file a loss as a win.
 *
 * The room is told afterwards, and only on success, so the other player's
 * screen stops asking. That message is a courtesy, not the record: what counts
 * is the row this just wrote, and the opponent still has to confirm it exactly
 * as they would a result typed on the website.
 */
async function report() {
  const check = reportable.value;
  if (!check.ok || reporting.value || !tournament.value) return;

  reporting.value = true;
  reportError.value = '';
  const res = await submitResult({
    matchId: tournament.value.matchId,
    scoreA: check.scoreA,
    scoreB: check.scoreB,
    draws: check.draws,
  });
  reporting.value = false;

  if (res.ok) {
    send({ t: 'tournament:reported', scoreA: check.scoreA, scoreB: check.scoreB, draws: check.draws });
  } else {
    reportError.value = res.message;
  }
}

onMounted(async () => {
  try {
    const ctx = await setupDiscord();
    me.value = ctx.user.id;

    // Never fatal. A duel that cannot get a grant is still a duel; it just has
    // no match tracking and no table number, which is exactly what a casual one
    // has.
    const { grant } = await requestContext({ guildId: ctx.guildId, room: ctx.instanceId });

    room = createRoom({
      instanceId: ctx.instanceId,
      user: ctx.user,
      grant,
      onState: (next) => {
        state.value = next;
        if (status.value !== 'ready') status.value = 'ready';
      },
    });
  } catch (err) {
    console.error(err);
    errorMsg.value = err?.message || String(err);
    status.value = 'error';
  }
});

onUnmounted(() => {
  if (room) room.close();
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="mark">Remote Duel</span>
        <span class="sub">{{ state?.host?.name || '0nefor.one' }}</span>
        <span v-if="tournament" class="table">
          R{{ tournament.roundNumber }} &middot; Table {{ tournament.tableNumber }}
        </span>
      </div>
    </header>

    <div v-if="status === 'connecting'" class="center muted">Connecting to your duel…</div>

    <div v-else-if="status === 'error'" class="center error">
      <p>Couldn't start the duel.</p>
      <p class="small">{{ errorMsg }}</p>
    </div>

    <main v-else class="board">
      <div class="main">
        <section class="players" :class="{ solo: players.length < 2 }">
          <PlayerLife
            v-for="p in players"
            :key="p.uid"
            :player="p"
            :is-me="p.uid === me"
            :is-turn="state.turn === p.uid"
            @adjust="(delta) => send({ t: 'adjustLp', target: p.uid, delta })"
            @set="(value) => send({ t: 'setLp', target: p.uid, value })"
          />
          <p v-if="players.length < 2" class="waiting muted">
            Waiting for your opponent to open the activity…
          </p>
        </section>

        <!-- Only in a verified store's server. Absent, not disabled: a free
             duel should look complete, not like a trial of something else. -->
        <MatchPanel
          v-if="state.tracked"
          :match="state.match"
          :players="players"
          :tournament="state.tournament"
          :reported="state.reported"
          :opponent="opponent"
          :my-result="myResult"
          :reportable="reportable"
          :reporting="reporting"
          :report-error="reportError"
          @start="(bestOf) => send({ t: 'match:start', bestOf })"
          @round="(winner) => send({ t: 'match:round', winner })"
          @undo="send({ t: 'match:undo' })"
          @clear="send({ t: 'match:reset' })"
          @report="report"
        />

        <ToolsBar
          :coin="state.coin"
          :dice="state.dice"
          @coin="send({ t: 'coin' })"
          @dice="send({ t: 'dice' })"
          @first-turn="send({ t: 'firstTurn' })"
          @reset="send({ t: 'resetDuel' })"
        />

        <DuelTimer
          :timer="state.timer"
          @start="send({ t: 'timer:start' })"
          @pause="send({ t: 'timer:pause' })"
          @reset="send({ t: 'timer:reset' })"
        />
      </div>

      <SidePanel
        :log="state.log"
        :chat="state.chat"
        :me="me"
        @send="(text) => send({ t: 'chat', text })"
      />
    </main>
  </div>
</template>
