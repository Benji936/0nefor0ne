<template>

    <p v-if="traders.length > 0" v-for="card_trader in traders">
        {{ card_trader.trader }}
    </p>
    <p v-if="traders.length < 1">No Results</p>

</template>


<script>

import { getClient } from "@/lib/supabaseClient";

export default {
    props:['card'],
    data() {
        return {
            traders: []
        };
    },
    methods: {
    
    },
    async mounted() {
        const response = await getClient().from('Card').select('*').eq('name',this.card.name).eq('wish',false)
        this.traders = response.data
        console.log(this.traders)
    },
  };
</script>