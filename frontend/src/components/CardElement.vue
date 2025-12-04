<script setup>
import LanguageTooltip from './tooltips/LanguageTooltip.vue';
import ConditionTooltip from './tooltips/ConditionTooltip.vue';
</script>

<template>


    <img :src="'src/assets/Cards/'+wish.image_id+'.jpg'" alt="image" width="40px">
    <div class="flex flex-col justify-between">
        <div class="flex flex-row gap-5">
            <h1>{{ wish.name }}</h1>
            <h1> x {{ quantityCount }}</h1>
        </div>
        
        <div class="flex flex-row gap-3">

            <ConditionTooltip :condition="wish.condition"></ConditionTooltip>

            <LanguageTooltip :language="wish.language"></LanguageTooltip>
                    
            <p class="py-1 px-1 bg-amber-lighten-4 rounded text-xs h-fit">{{ wish.rarity}}</p>
                

            <h1> {{ wish.extension }} </h1> 
        </div>
    </div>
    
    <v-number-input
        bg-color="pink-darken-4"
        class="place-items-end align-self-center"
        hide-input
        hide-details
        density="compact"
        variant="solo-filled"
        control-variant="split"
        v-model="quantityCount"
        @update:model-value="onQuantityChange"
        :rules="[v=> v>0 || 'Quantity must be more than 0']">
    </v-number-input>
    

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