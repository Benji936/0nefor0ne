<script setup>
// Match tracking, which only a verified store's server gets.
//
// The panel is deliberately the size of the job: a shop running locals needs to
// say who took the round and see the score, between duels, on a phone-sized
// frame. Everything else about the duel is unchanged.
//
// Two modes, and the difference is who decided the format. A tracked duel picks
// its own length. A tournament match arrives with the length already set by the
// organizer, so the chooser is absent rather than disabled — offering a control
// that would disagree with the row the result files against is worse than not
// having one — and in its place is the one thing that table needs at the end:
// file the result.
import { computed } from 'vue';
import { matchScore, matchWinner, roundsToWin } from '../../shared/duelReducer.js';

const props = defineProps({
  match: { type: Object, default: null },
  players: { type: Array, default: () => [] },
  // Null for a tracked-but-casual duel; the pairing when this is a real match.
  tournament: { type: Object, default: null },
  reported: { type: Object, default: null },
  opponent: { type: String, default: null },
  myResult: { type: Object, default: null },
  reportable: { type: Object, default: () => ({ ok: false }) },
  reporting: { type: Boolean, default: false },
  reportError: { type: String, default: '' },
});
defineEmits(['start', 'round', 'undo', 'clear', 'report']);

const LENGTHS = [1, 3, 5];

const score = computed(() => matchScore(props.match));
const winner = computed(() => matchWinner(props.match));
const winnerName = computed(
  () => props.players.find((p) => p.uid === winner.value)?.name ?? 'Duelist',
);
const roundNumber = computed(() => (props.match?.rounds.length ?? 0) + 1);
const needed = computed(() => roundsToWin(props.match?.bestOf));
</script>

<template>
  <section class="match">
    <!-- No match yet: pick a length. Three buttons rather than a select, since
         this is being tapped between duels, often by someone standing up.
         A tournament match never reaches here — context:set gave it a match at
         the organizer's format the moment the room bound. -->
    <template v-if="!match && !tournament">
      <p class="mhead">
        <span class="mtitle">Match</span>
        <span class="mhint">best of</span>
      </p>
      <div class="mstart">
        <button
          v-for="n in LENGTHS"
          :key="n"
          class="mbtn"
          type="button"
          @click="$emit('start', n)"
        >{{ n }}</button>
      </div>
    </template>

    <template v-else>
      <p class="mhead">
        <span class="mtitle">Best of {{ match.bestOf }}</span>
        <span v-if="winner" class="mwin">{{ winnerName }} wins</span>
        <span v-else class="mhint">Round {{ roundNumber }} · first to {{ needed }}</span>
      </p>

      <ul class="mscore">
        <li v-for="p in players" :key="p.uid">
          <span class="mname">{{ p.name }}</span>
          <span class="mcount" :class="{ lead: (score[p.uid] ?? 0) >= needed }">{{ score[p.uid] ?? 0 }}</span>
        </li>
      </ul>

      <!-- Who took the round. Hidden once the match is decided, so the last tap
           of a match cannot become an accidental extra round. -->
      <div v-if="!winner && players.length" class="mwinners">
        <button
          v-for="p in players"
          :key="p.uid"
          class="mbtn wide"
          type="button"
          @click="$emit('round', p.uid)"
        >{{ p.name }} won</button>
      </div>

      <!-- ── Filing the result ────────────────────────────────────────────
           Present from the first game played, not only once the match is
           decided: a tournament match that ran out of time at one game each is
           a real result, and hiding the button until somebody "wins" would push
           the players into inventing a third game. -->
      <div v-if="tournament" class="mreport">
        <p v-if="reported" class="mdone">
          Reported {{ reported.scoreA }}&ndash;{{ reported.scoreB }}. Your opponent confirms it on 0nefor.one.
        </p>
        <template v-else>
          <button
            class="mfile"
            type="button"
            :disabled="!reportable.ok || reporting"
            @click="$emit('report')"
          >
            <template v-if="reporting">Sending&hellip;</template>
            <template v-else-if="myResult && reportable.ok">
              Report {{ myResult.mine }}&ndash;{{ myResult.theirs }} to 0nefor.one
            </template>
            <template v-else>Report result</template>
          </button>
          <p v-if="!reportable.ok && reportable.reason" class="mwhy">{{ reportable.reason }}</p>
          <p v-if="reportError" class="mwhy err">{{ reportError }}</p>
        </template>
      </div>

      <div class="mfoot">
        <button
          v-if="match.rounds.length"
          class="mlink"
          type="button"
          @click="$emit('undo')"
        >Undo round {{ match.rounds.length }}</button>
        <!-- Absent in a tournament: the match belongs to the pairing, and
             clearing it would leave the table with no format to file against.
             A misreported round is what Undo is for. -->
        <button v-if="!tournament" class="mlink danger" type="button" @click="$emit('clear')">Clear match</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.match {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mhead { display: flex; align-items: baseline; gap: 8px; margin: 0; flex-wrap: wrap; }
.mtitle { font-weight: 800; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; }
.mhint { font-size: 12px; color: var(--muted); }
.mwin { font-size: 12px; font-weight: 800; color: var(--accent); }

.mstart { display: flex; gap: 8px; }

.mbtn {
  flex: 1;
  min-height: 38px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  color: var(--text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.mbtn:hover { border-color: var(--accent-2); }
.mbtn.wide { font-size: 13px; }

.mscore { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.mscore li { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mname {
  font-size: 13px; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mcount {
  font-variant-numeric: tabular-nums;
  font-size: 18px; font-weight: 800; color: var(--muted);
}
/* The winner's count is the one number worth finding at a glance. */
.mcount.lead { color: var(--accent); }

.mwinners { display: flex; gap: 8px; }

/* Which table this is, under the format line. Quiet: it confirms where you are
   rather than competing with the score. */
.mpair {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.mreport { display: flex; flex-direction: column; gap: 6px; }
/* The one button on this panel that leaves the room, so it is the one that
   looks like a commitment rather than a counter. */
.mfile {
  min-height: 40px;
  background: var(--accent);
  border: none;
  border-radius: 10px;
  color: var(--bg);
  font: inherit;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
}
.mfile:disabled { opacity: 0.4; cursor: default; }
.mwhy { margin: 0; font-size: 12px; color: var(--muted); }
.mwhy.err { color: var(--minus); }
.mdone { margin: 0; font-size: 12px; color: var(--muted); }

.mfoot { display: flex; gap: 12px; justify-content: flex-end; }
.mlink {
  background: none; border: none; padding: 0;
  color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
}
.mlink:hover { color: var(--text); }
.mlink.danger:hover { color: var(--minus); }
</style>
