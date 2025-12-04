
<script setup>
import Search from "@/components/Pages/Search.vue";
import Library from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue"
</script>

<template>
  <header class="">
    
  </header>

  <nav class="flex flex-row py-3 px-5 flex-shrink gap-6 shadow-xs bg-black place-items-center justify-between">
      <div class="flex flex-row w-2/3 gap-6">
        <img alt="TradeMarket Logo" class="" src="../assets/theLogoNobg.png" width="250"/>
        <div class="flex my-2 rounded-md text-gray-300 bg-gray-800 has-[input:focus-within]:outline-[#85144B] has-[input:focus-within]:outline-2 w-3/5 justify-between">

          <input
            v-model="searchQuery"
            v-on:focus="changePage('search')"
            v-on:keyup.enter="update"
            class="placeholder:text-white-500 mx-4 my-2 outline-none"
            placeholder="Rechercher"
            type="text"
            name="search"
          />

          
        </div>
      </div>

      <div class="flex row justify-around w-1/6">

        <v-tooltip location="top" text="Collection">
          <template  v-slot:activator="{ props }">
            <img src="../assets/library.svg" class="size-8 cursor-pointer" v-on:click="changePage('library')" v-bind="props" v-if="authenticated" alt="">
          </template>
        </v-tooltip>

        <v-tooltip location="top" color="deep-purple accent-4" text="Account">
          <template v-slot:activator="{ props }">
              <img src="../assets/user.svg" class="size-8 cursor-pointer" v-on:click="changePage('account')"  v-bind="props" v-if="authenticated" alt="">
          </template>

        </v-tooltip>
        
        
        <img src="../assets/log-in.svg" class="size-8 cursor-pointer" v-on:click="login" v-if="!authenticated" alt="">
        <img src="../assets/log-out.svg" class="size-8 cursor-pointer" v-on:click="logout" v-if="authenticated" alt="">


      </div>
      
      

    </nav>

  <main class="px-7">
    <p class="text-3xl uppercase text-gray-300"> {{ page }}</p>

      <div class="d-flex flex-column pa-6 gap-5" v-if="page=='search'">
        <p class="font-bold">Monster</p>
        <v-btn-group
        variant="outlined"
        divided
        density="compact"
        
        >
        <v-btn @click="addFilter('type',category)" size="small" color="white" variant="plain" :active="filters.monster_category == category" activeColor="#B5447B" v-for="category in filters.monster_categories">{{category}}</v-btn>

        </v-btn-group>
      </div>

      
    <TradeCenter :card="show_card" v-if="page=='TradeCenter'"></TradeCenter>
    <Search @TradeCenter="page = 'TradeCenter'; show_card=$event" :searchCards="cards" v-if="page=='search'"></Search>
    <Library :login="authenticated" class="px-10 py-10" v-if="page=='library'"></Library>

  </main>
</template>


<script>
import { get, getUrl } from "@/api";  
import { signInWithEmail, signOut, signUpNewUser } from "@/lib/supabaseClient";


  export default {
      

      data() {
          return {
            show_card:null,
            api: getUrl()+'cardinfo.php',
            applied_filters:{},
            filters:{
              monster_categories:['Normal','Effect','Ritual Effect','Fusion','Synchro','Xyz','Pendulum Effect','Pendulum Normal','Link','Tuner','Flip','Toon','Spirit','Union Effect','Gemini'],
              monster_category: "",
            },
            searchQuery: "",
            cards:[],
            authenticated: false,
            page:"search",
            previousPage:"",
          };
      },
      methods: {
        async update(){
          let i = 0
          for (const [key, value] of Object.entries(this.applied_filters)) {
            if(i==0){
              this.api += '?'
            }
            this.api += key+'='+value
            if(i>0 || i<Object.entries(this.applied_filters).length-1){
              this.api += '&'
            }
            i++
          }

          if(this.searchQuery != ''){
            if(i==0){
              this.api += '?' 
            }else{
              this.api += '&'
            }
            this.api += 'fname='+this.searchQuery
          }

          const response = await get(this.api)
          this.cards = response.data
          this.api = getUrl()+'cardinfo.php'
        }, 
        async addFilter(filter,value){
          this.applied_filters[filter] = value + " Monster"
          this.filters.monster_category = value
          this.update()
        },   
        async signUp(){
          this.authenticated = await signUpNewUser("Benjaminsitbon@hotmail.com","Okwuntughe7!");
          console.log(this.authenticated)
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