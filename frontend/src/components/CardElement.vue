<script setup>
import LanguageTooltip from './tooltips/LanguageTooltip.vue';
import ConditionTooltip from './tooltips/ConditionTooltip.vue';
import { cardImage } from '@/lib/cardImage';
</script>

<template>

  <div class="flex flex-row items-center gap-4 rounded-lg px-5 py-4 w-full transition-colors border" style="background-color: var(--c-surface-2); border-color: var(--c-border)">
    <img :src="cardImage(wish.image_id)" alt="image" class="h-14 w-10 rounded object-contain shrink-0">

    <div class="flex flex-col gap-1 grow min-w-0">
      <p class="font-medium text-sm truncate" style="color: var(--c-text)">{{ wish.name }}</p>
      <div class="flex flex-row flex-wrap gap-2 items-center">
        <ConditionTooltip :condition="wish.condition"></ConditionTooltip>
        <LanguageTooltip :language="wish.language"></LanguageTooltip>
        <span v-if="wish.rarity" class="px-1.5 py-0.5 bg-amber-900/50 border border-amber-700/40 rounded text-xs text-amber-300">{{ wish.rarity }}</span>
        <span v-if="wish.extension" class="text-xs" style="color: var(--c-muted)">{{ wish.extension }}</span>
      </div>
    </div>

    <v-number-input
        class="shrink-0"
        style="width: 130px; flex: 0 0 130px"
        hide-details
        density="compact"
        variant="outlined"
        control-variant="split"
        v-model="quantityCount"
        @update:model-value="onQuantityChange"
        :min="0">
    </v-number-input>
  </div>

</template>

<script>

import { getClient } from "@/lib/supabaseClient";

    
    export default {
        props:['wish'],
        data(){
            return{
                quantityCount: this.wish.quantity,
            }
        },
        methods:{
            async onQuantityChange(){
                const supabase_client = getClient()
                if(this.quantityCount > 0){
                    const {data, error} = await supabase_client.from('Card').update({'quantity':this.quantityCount}).eq('id',this.wish.id).select()
                } 
                else{
                    const {data , error} = await supabase_client.from('Card').delete().eq('id',this.wish.id).select()
                } 
            }
        },
        mounted(){
        },
    };


</script>