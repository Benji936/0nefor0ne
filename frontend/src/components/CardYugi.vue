<script setup>
import { cardImage } from '@/lib/cardImage'
const emit = defineEmits(['showTraders'])

</script>

<template>
    

    <v-overlay class=" w-50 place-self-center align-center">
        <template v-slot:activator="{ props: activatorProps }">

            <div class="hover:outline hover:outline-white" v-bind="activatorProps">
                <img alt="image" @mouseover="toggle" @mouseleave="toggle" class="h-31 w-22" :src="cardImage(componentCard.id)"/>
            </div>
        </template>

        <template v-slot:default="{ isActive }">
            <div class="flex flex-col gap-5 text-black-300 bg-white px-10 py-7 rounded-xl">
                <div class="flex flex-row gap-5">
                    <img alt="image" class="h-61 w-44" :src="cardImage(componentCard.id)"/>
                    <div class="flex flex-col gap-2">
                        <p class="font-bold text-xl">{{ componentCard.name }}</p>
                        <div class="flex flex-row gap-3 text-lg">
                            <p v-if="componentCard.atk != null" >ATK {{ componentCard.atk }} </p>
                            <p v-if="componentCard.def != null" > DEF {{ componentCard.def }}</p>
                            <p v-if="componentCard.level != null">Level {{ componentCard.level }}</p>
                            <p>{{ componentCard.race }}</p>
                            
                        </div>
                        <p class="text-justify text-[16px]">{{ componentCard.desc }}</p>
                    </div>
                    
                </div>
                

                
                <div class="d-flex flex-row gap-3">


                    <v-btn
                        class="grow"
                        variant="outlined" 
                        style="background-color: #669911;" 
                        prepend-icon="mdi-plus" 
                        color="#ffffff">
                        trades
                    </v-btn>

                    <v-btn
                        class="grow"
                        variant="default" 
                        style="background-color: #116699;" 
                        prepend-icon="mdi-plus" 
                        color="#ffffff">
                        wishes
                    </v-btn>

                    <v-btn
                        class="grow"
                        variant="default" 
                        style="background-color: #85144B;" 
                        append-icon="mdi-swap-horizontal" 
                        color="#ffffff"
                        @click="emit('showTraders',componentCard)">
                        See traders
                    </v-btn>
                </div>

                
               
            </div>
        </template>
    </v-overlay>
</template>

<script>
    export default {
      
        props: ['componentCard'],
        data() {
            return {
                over: false,
            };
        
        },
        methods: {
            toggle(){
                this.over = !this.over;
            },
        },
        mounted() {
            
        },
  };

</script>
