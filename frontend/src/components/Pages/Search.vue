<script setup>
import CardYugi from '../CardYugi.vue';
const emit = defineEmits(['TradeCenter'])
</script>

<template>

    <div class="d-flex flex-col">
        <div class="flex flex-wrap gap-5 py-6">
            <CardYugi @showTraders="emit('TradeCenter',$event)" :componentCard="card" class="w-1/5 h-fit rounded-md text-xs" v-for="card in searchCards.data"></CardYugi>
        </div>
    </div>
</template>


<script>
  export default {
    props:['searchCards'],
    data() {
    },
    methods: {
  
    },

    mounted() {
        
    },
  };
</script>