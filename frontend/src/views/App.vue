
<script setup>
import CardYugi from "@/components/CardYugi.vue";
</script>

<template>
  <header class="">
    
  </header>

  <main>

    <nav class="flex flex-row flex-shrink gap-6 shadow-xs bg-white w-full place-items-center justify-between px-3">
      <div class="flex flex-row w-2/3 gap-6">
        <img alt="TradeMarket Logo" class="" src="../assets/theLogo.png" width="250"/>
        <div class="flex my-2 rounded-md bg-gray-100 has-[input:focus-within]:outline-[#85144B] has-[input:focus-within]:outline-2 w-3/5 justify-between">

          <input
            v-model="searchQuery"
            v-on:keyup.enter="update"
            class="placeholder:text-white-500 mx-4 my-2 outline-none"
            placeholder="Rechercher"
            type="text"
            name="search"
          />

          <div class="grid shrink-0 grid-cols-1 focus-within:relative bg-gray-100 rounded-md">
            <select id="currency" name="currency" aria-label="Currency" class="col-start-1 row-start-1 w-full appearance-none rounded-md py-1.5 pr-7 pl-3 text-base text-gray-500 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-[#85144B] sm:text-sm/6">
              <option>YuGiHo!</option>
              <option>Pokemon</option>
              <option>OnePiece</option>
              <option>Lorcana</option>
            </select>
            <svg class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
              <path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
      </div>
      

      
      <img src="../assets/login.svg" class="size-8 cursor-pointer" v-on:click="login" v-if="!authenticated" alt="">
      <img src="../assets/logout.svg" class="size-8 cursor-pointer" v-on:click="logout" v-if="authenticated" alt="">

    </nav>

    <div class="flex flex-wrap gap-y-4 p-4 py-7" >
      <CardYugi :componentCard="card" class="w-1/5 h-fit rounded-md text-xs" v-for="card in cards.data"></CardYugi>
    </div>
    
    
    
    


  </main>
</template>


<script>
import { searchCardByName, searchCardBySetCode, searchById } from "@/api";  
import { signInWithEmail, signOut, signUpNewUser } from "@/lib/supabaseClient";


  export default {
      

      data() {
          return {
              searchQuery: "",
              cards:[],
              authenticated: false,
          };
      },
      methods: {
        async update(){
          const response = await searchCardByName(this.searchQuery);
          if(response.data.length === 0){
            console.log("pas un nom, essaie pour setcode")
            const alternative_response = await searchCardBySetCode(this.searchQuery)
            if(alternative_response){
              console.log(alternative_response)
              const new_response = await searchById(alternative_response.data.id)
              this.cards = new_response.data
            }
          }else{
            this.cards = response.data
          }
          
          
          //console.log(this.cards)
        },    
        async login(){
          this.authenticated = await signInWithEmail("Benjaminsitbon@hotmail.com","Okwuntughe7!");
          console.log(this.authenticated)
          
        },
        async logout(){
          this.authenticated = await signOut();
        }
      },
      mounted() {
          
      },
  };
</script>