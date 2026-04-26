<script setup>
import { cardImage } from "@/lib/cardImage";
</script>

<template>

    <v-overlay class="flex items-center place-content-center" v-model="overlay">
        <template v-slot:activator="{ props: activatorProps }">
            <v-btn 
            class="align-self-center" 
            key="1" 
            icon="$plus"
            v-bind="activatorProps"
            v-on:click="cardSelected(card)"
            
            ></v-btn>
        </template>

        <template v-slot:default="{ isActive }">
            <div class="flex flex-col gap-5 rounded py-8 px-8 bg-white w-fit-content place-self-center self-center">
                <div class="flex flex-row gap-5">
                    <img :src="cardImage(card.id)" alt="image" class="h-60 w-40">
                    <div class="flex flex-col">
                        <h1 class="font-bold text-lg">{{ card.name }}</h1>
                        <h2 class="w-[400px] text-sm">{{ card.desc }}</h2>
                    </div>
                </div>


                <v-form validate-on="submit lazy" @submit.prevent="submit(card.name)">
                    <div class="flex flex-col gap-3">
                        
                        
                            <v-select
                            density="comfortable"
                            variant="outlined"
                                v-model="extension"
                                :items="extensions"
                                :rules="[v => !!v || 'Item is required']"
                                label="Extension & Rarity"
                                @update:model-value="extensionSelected"
                                required
                            ></v-select>
                        

                            
                            <v-select
                            density="comfortable"
                            variant="outlined"
                                v-model="language"
                                :items="languages"
                                :rules="[v => !!v || 'Item is required']"
                                label="Language"
                                required
                            ></v-select>

                            <div class="d-flex flex-row gap-5">
                                <v-select
                                    density="comfortable"
                                    variant="outlined"
                                    v-model="condition"
                                    :items="conditions"
                                    :rules="[v => !!v || 'Item is required']"
                                    label="Conditions"
                                    required
                                ></v-select>

                                <v-checkbox 
                                    density="comfortable"
                                    label="First edition"
                                    color="pink-darken-3"
                                    v-model="first_edition" 
                                    ></v-checkbox>

                                    <v-checkbox 
                                    density="comfortable"
                                    label="Trade ?"
                                    color="pink-darken-3"
                                    v-model="trade" 
                                    ></v-checkbox>
                            </div>
                            

                            

                            <v-number-input
                            density="comfortable"
                            v-model="quantity"
                            variant="outlined"
                            control-variant="split"
                            :rules="[v=> v>0 || 'Quantity must be more than 0']"
                            label="Quantity"
                            required>

                            </v-number-input>
                            
                            <v-btn 
                                
                                class="w-full" 
                                size="large"
                                key="1" 
                                color="pink-darken-3"
                                prepend-icon="$plus"
                                type="submit"
                                text="Add card"
                                :loading="loading"
                                @click="overlay = false"
                                ></v-btn>
                        
                    </div>
                    

                </v-form>
            </div>
        </template>
    </v-overlay>

</template>


<script>

import { insert } from "@/lib/supabaseClient";
import { ref } from "vue";

  export default {
        
    props: ['card'],
    data() {
        return {
            overlay: false,
            loading: ref(null),
            language: "English",
            languages: ["English","French","Spanish","German","Italian","Portuguese"],
            extension: ref(null),
            extensions: [],
            quantity: 1,
            rarity: ref(null),
            rarities: [],
            condition: "Near Mint",
            conditions: ["Mint","Near Mint","Excellent","Good","Light Played","Played","Poor"],
            first_edition: false,
            trade: false,
        };
    },
    methods: {
        cardSelected(card){
            this.extensions = []
            this.rarities = []
            for(let i = 0; i<card.card_sets.length; i++){
                this.extensions.push(card.card_sets[i].set_code + " | " + card.card_sets[i].set_rarity)
                this.rarities.push(card.card_sets[i].set_rarity)
            }
        },

        extensionSelected(){
            let splitted = this.extension.split('|')
            this.extension = splitted[0].trim()
            this.rarity = splitted[1].trim()

            console.log(this.extension)
            console.log(this.rarity)
        },
    
        async submit(event){
            this.loading = true
            const results = await event
            this.loading = false
            insert({wish: !this.trade, first_edition: this.first_edition, game:'YGO', url: 'https://db.ygoprodeck.com/api/v7/cardinfo.php?name='+this.card.name, name: this.card.name, extension: this.extension, rarity:this.rarity, language: this.language, condition: this.condition, quantity: this.quantity, trader: 'c9a52548-d363-4574-b72d-e2b1151af266', image_id: this.card.id})
            //alert(JSON.stringify(results, null, 2))
        },    
    },

      


      mounted() {
      },
  };

</script>