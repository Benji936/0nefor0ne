<script setup>
import { ref, computed, nextTick } from 'vue';

const props = defineProps({
  player: { type: Object, required: true },
  isMe: { type: Boolean, default: false },
  isTurn: { type: Boolean, default: false },
});
const emit = defineEmits(['adjust', 'set']);

const steps = [100, 500, 1000];
const editing = ref(false);
const draft = ref('');
const inputEl = ref(null);

const lpClass = computed(() => {
  const lp = props.player.lp;
  if (lp <= 0) return 'dead';
  if (lp <= 2000) return 'low';
  return '';
});

async function startEdit() {
  draft.value = String(props.player.lp);
  editing.value = true;
  await nextTick();
  inputEl.value?.focus();
  inputEl.value?.select();
}

function applyEdit() {
  const value = parseInt(draft.value, 10);
  if (!Number.isNaN(value)) emit('set', Math.max(0, value));
  editing.value = false;
}

function halve() {
  emit('set', Math.max(0, Math.ceil(props.player.lp / 2)));
}
</script>

<template>
  <div class="player" :class="{ me: isMe, turn: isTurn, offline: !player.online }">
    <div class="pname">
      <span class="dot" :class="{ on: player.online }"></span>
      <span class="nm">{{ player.name }}</span>
      <span v-if="isMe" class="you">you</span>
      <span v-if="isTurn" class="turn-tag">turn</span>
    </div>

    <button class="lp" :class="lpClass" type="button" @click="startEdit">
      <span v-if="!editing">{{ player.lp }}</span>
      <input
        v-else
        ref="inputEl"
        v-model="draft"
        class="lp-input"
        type="number"
        inputmode="numeric"
        @keyup.enter="applyEdit"
        @blur="applyEdit"
        @click.stop
      />
    </button>

    <div class="controls">
      <button v-for="s in steps" :key="'m' + s" class="btn minus" type="button" @click="emit('adjust', -s)">
        -{{ s }}
      </button>
    </div>
    <div class="controls">
      <button v-for="s in steps" :key="'p' + s" class="btn plus" type="button" @click="emit('adjust', s)">
        +{{ s }}
      </button>
    </div>
    <div class="controls">
      <button class="btn half" type="button" @click="halve">Halve LP</button>
    </div>
  </div>
</template>
