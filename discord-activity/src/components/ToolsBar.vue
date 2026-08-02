<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  coin: { type: Object, default: null },
  dice: { type: Object, default: null },
});
defineEmits(['coin', 'dice', 'first-turn', 'reset']);

// Brief pulse when a new coin/dice result arrives, so both players notice it.
const coinFlash = ref(false);
const diceFlash = ref(false);

watch(
  () => props.coin?.seq,
  (seq) => {
    if (seq == null) return;
    coinFlash.value = true;
    setTimeout(() => (coinFlash.value = false), 600);
  },
);
watch(
  () => props.dice?.seq,
  (seq) => {
    if (seq == null) return;
    diceFlash.value = true;
    setTimeout(() => (diceFlash.value = false), 600);
  },
);
</script>

<template>
  <section class="tools">
    <button class="tool" :class="{ flash: coinFlash }" type="button" @click="$emit('coin')">
      <span class="tlabel">Coin</span>
      <span v-if="coin" class="tres">{{ coin.result }}</span>
    </button>
    <button class="tool" :class="{ flash: diceFlash }" type="button" @click="$emit('dice')">
      <span class="tlabel">Dice</span>
      <span v-if="dice" class="tres">{{ dice.value }}</span>
    </button>
    <button class="tool" type="button" @click="$emit('first-turn')">
      <span class="tlabel">First turn</span>
    </button>
    <button class="tool danger" type="button" @click="$emit('reset')">
      <span class="tlabel">New duel</span>
    </button>
  </section>
</template>
