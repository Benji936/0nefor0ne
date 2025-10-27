<script setup>
import CardYugi from "@/components/CardYugi.vue";
</script>

<template>

    <v-overlay class="flex items-center place-content-center">

    
    <template v-slot:activator="{ props: activatorProps }">

        <v-btn 
        variant="default" 
        style="background-color: #85144B;" 
        prepend-icon="mdi-plus" 
        color="#ffffff"
        v-bind="activatorProps">
            Add a card
        </v-btn>

    </template>

    <template v-slot:default="{ isActive }">
        <v-card class="w-[75vw]">
            <v-card-actions>
                <v-text-field
                    v-model="search"
                    label="Search"
                    prepend-inner-icon="mdi-magnify"
                    variant="outlined"
                    hide-details
                    single-line
                    v-on:keyup.enter="update"
                ></v-text-field>
            </v-card-actions>

            <div class="flex flex-column max-h-[300px] overflow-scroll px-5 py-5 border gap-5">
                <div class="flex flex-row gap-5" v-for="card in cards.data">
                        
                    <img :src="'src/assets/Cards/'+card.id+'.jpg'" alt="image" width="60px">
                    <h1 class="align-self-center">{{ card.name }}</h1>
                    <v-overlay class="border-1 border-red-500 flex items-center place-content-center">
                        <template v-slot:activator="{ props: activatorProps }">
                            <v-btn 
                            class="align-self-center" 
                            key="1" 
                            icon="$plus"
                            v-bind="activatorProps"
                          
                            ></v-btn>
                        </template>

                        <template v-slot:default="{ isActive }">
                            <div class="flex flex-col gap-5 rounded py-8 px-8 bg-white w-fit-content place-self-center self-center">
                                <div class="flex flex-row gap-5">
                                    <img :src="'src/assets/Cards/'+card.id+'.jpg'" alt="image" width="180px">
                                    <div class="flex flex-col">
                                        <h1 class="font-bold">{{ card.name }}</h1>
                                        <h2 class="w-[400px]">{{ card.desc }}</h2>
                                    </div>
                                </div>


                                <form action="">
                                    <div class="flex flex-col gap-3">
                                        <div class="flex flex-col">
                                            <label for="Extension">Extension</label>
                                            <select @change="test" v-model="set_selection" class="bg-grey-lighten-2 px-1 py-1 rounded"  name="Extension" id="">
                                                <option :value=null>Choisir</option>
                                                <option v-for="set in card.card_sets" :value=set>{{ set.set_code }}</option>
                                            </select>
                                        </div>
                                        
                                        <div v-if="set_selection!=null" class="flex flex-col">
                                            <label  for="Rarity">Rarity</label>
                                            <select class="bg-grey-lighten-2 px-1 py-1 rounded"  name="Rarity" id="">
                                                <option :value=set_selection.set_rarity>{{ set_selection.set_rarity }}</option>
                                            </select>
                                        </div>

                                         <div class="flex flex-col">
                                            <label for="Language">Language</label>
                                            <select class="bg-grey-lighten-2 px-1 py-1 rounded"  name="Rarity" id="">
                                                <option value="EN">English</option>
                                                <option value="FR">French</option>
                                                <option value="SP">Spanish</option>
                                                <option value="DE">German</option>
                                                <option value="IT">Italian</option>
                                                <option value="PT">Portuguese</option>
                                            </select>
                                         </div>
                                        
                                    </div>
                                    

                                </form>
                            </div>
                        </template>
                    </v-overlay>
                    
                    
                </div>
               
            </div>
        </v-card>
    </template>
    </v-overlay>


</template>

<script>

import { searchCardByName, searchCardBySetCode, searchById } from "@/api";  
import { ref } from "vue";

  export default {
      

      data() {
          return {
              search: "",
              cards:[],
              set_selection:ref(null),
          };
      },
      methods: {
        async update(){
          const response = await searchCardByName(this.search);
          if(response.data.length === 0){
            console.log("pas un nom, essaie pour setcode")
            const alternative_response = await searchCardBySetCode(this.search)
            if(alternative_response){
              console.log(alternative_response)
              const new_response = await searchById(alternative_response.data.id)
              this.cards = new_response.data
            }
          }else{
            this.cards = response.data
          }
          console.log(this.cards)
        },    
        test(){
            console.log(this.set_selection.set_rarity)
        },
      },

      


      mounted() {
          
      },
  };

</script>