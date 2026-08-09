<script setup>
// Match tracking, which only a verified store's server gets.
//
// The panel is deliberately the size of the job: a shop running locals needs to
// say who took the round and see the score, between duels, on a phone-sized
// frame. Everything else about the duel is unchanged.
import { computed } from 'vue';
import { matchScore, matchWinner, roundsToWin } from '../../shared/duelReducer.js';

const props = defineProps({
  match: { type: Object, default: null },
  players: { type: Array, default: () => [] },
});
defineEmits(['start', 'round', 'undo', 'clear']);

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
         this is being tapped between duels, often by someone standing up. -->
    <template v-if="!match">
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

      <div class="mfoot">
        <button
          v-if="match.rounds.length"
          class="mlink"
          type="button"
          @click="$emit('undo')"
        >Undo round {{ match.rounds.length }}</button>
        <button class="mlink danger" type="button" @click="$emit('clear')">Clear match</button>
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

.mfoot { display: flex; gap: 12px; justify-content: flex-end; }
.mlink {
  background: none; border: none; padding: 0;
  color: var(--muted); font: inherit; font-size: 12px; cursor: pointer;
}
.mlink:hover { color: var(--text); }
.mlink.danger:hover { color: var(--minus); }
</style>
