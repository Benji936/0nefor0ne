
<script setup>
import CardYugi from "@/components/CardYugi.vue";
import Library from "@/components/Pages/Library.vue";
</script>

<template>
  <header class="">
    
  </header>

  <main>

    <nav class="flex flex-row py-3 px-5 flex-shrink gap-6 shadow-xs bg-black place-items-center justify-between">
      <div class="flex flex-row w-2/3 gap-6">
        <img alt="TradeMarket Logo" class="" src="../assets/theLogoNobg.png" width="250"/>
        <div class="flex my-2 rounded-md text-gray-300 bg-gray-800 has-[input:focus-within]:outline-[#85144B] has-[input:focus-within]:outline-2 w-3/5 justify-between" v-on:mouseenter="changePage('search')">

          <input
            v-model="searchQuery"
            v-on:keyup.enter="update"
            class="placeholder:text-white-500 mx-4 my-2 outline-none"
            placeholder="Rechercher"
            type="text"
            name="search"
          />

          
        </div>
      </div>


      

      <div class="flex row justify-around w-1/6">
        <img src="../assets/library.svg" class="size-8 cursor-pointer" v-on:click="changePage('library')" v-if="!authenticated" alt="">
        <img src="../assets/user.svg" class="size-8 cursor-pointer" v-on:click="changePage('account')" v-if="!authenticated" alt="">
        <img src="../assets/log-in.svg" class="size-8 cursor-pointer" v-on:click="login" v-if="authenticated" alt="">
        <img src="../assets/log-out.svg" class="size-8 cursor-pointer" v-on:click="logout" v-if="!authenticated" alt="">


      </div>
      
      

    </nav>

   

   
    <p> {{ page }}</p>


    <div class="flex flex-wrap gap-y-4 p-4 py-7" v-if="page=='search'" >
      <CardYugi :componentCard="card" class="w-1/5 h-fit rounded-md text-xs" v-for="card in cards.data"></CardYugi>
    </div>
    
    <Library v-if="page=='library'"></Library>
    
    


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
              page:"",
              previousPage:"",
  
              items: [
                { title: 'Click Me' },
                { title: 'Click Me' },
                { title: 'Click Me' },
                { title: 'Click Me 2' },
              ],
              
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
        },

        changePage(name) {
          console.log(this.page)
          //this.previousPage = this.page;
          this.page = name;
          console.log(this.page)
        },
      },

      


      mounted() {
          
      },
  };
</script>