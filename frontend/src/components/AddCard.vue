<script setup>
import AddButtonForm from "@/components/AddButtonForm.vue";
import { cardImage } from "@/lib/cardImage";
</script>

<template>

    <v-overlay class="flex items-center place-content-center">

    
    <template v-slot:activator="{ props: activatorProps }">

        <v-btn 
        density="comfortable"
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
                        
                    <img :src="cardImage(card.id)" alt="image" width="60px">
                    <h1 class="align-self-center">{{ card.name }}</h1>
                    <AddButtonForm :card="card"></AddButtonForm>
                    
                    
                </div>
               
            </div>
        </v-card>
    </template>
    </v-overlay>


</template>

<script>

import { searchCardByName, searchCardBySetCode, searchById } from "@/api";  

  export default {
      data() {
          return {
              search: "",
              cards:[],
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
      },
      mounted() {
          
      },
  };

</script>