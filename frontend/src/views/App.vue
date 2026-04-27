
<script setup>
import Search from "@/components/Pages/Search.vue";
import Library from "@/components/Pages/Library.vue";
import TradeCenter from "@/components/Pages/TradeCenter.vue"
import AuthDialog from "@/components/AuthDialog.vue";
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

      <div class="flex row items-center justify-around w-1/6 gap-1">

        <v-tooltip location="top" text="Collection">
          <template v-slot:activator="{ props }">
            <div
              v-if="authenticated"
              v-bind="props"
              class="flex flex-col items-center gap-0.5 cursor-pointer px-2 py-1 rounded-md transition-colors"
              :class="page === 'library' ? 'bg-white/10' : 'hover:bg-white/5'"
              @click="changePage('library')"
            >
              <img src="../assets/library.svg" class="size-6" alt="">
              <div class="h-0.5 w-4 rounded-full transition-all" :class="page === 'library' ? 'bg-pink-400' : 'bg-transparent'"></div>
            </div>
          </template>
        </v-tooltip>

        <v-tooltip location="top" text="Trade matches">
          <template v-slot:activator="{ props }">
            <div
              v-if="authenticated"
              v-bind="props"
              class="flex flex-col items-center gap-0.5 cursor-pointer px-2 py-1 rounded-md transition-colors"
              :class="page === 'TradeCenter' ? 'bg-white/10' : 'hover:bg-white/5'"
              @click="openMatches()"
            >
              <v-icon
                icon="mdi-swap-horizontal-bold"
                size="24"
                :style="page === 'TradeCenter' ? {} : { color: '#85144B' }"
                :class="page === 'TradeCenter' ? 'text-pink-400' : ''"
              />
              <div class="h-0.5 w-4 rounded-full transition-all" :class="page === 'TradeCenter' ? 'bg-pink-400' : 'bg-transparent'"></div>
            </div>
          </template>
        </v-tooltip>

        <v-tooltip location="top" text="Account">
          <template v-slot:activator="{ props }">
            <div
              v-if="authenticated"
              v-bind="props"
              class="flex flex-col items-center gap-0.5 cursor-pointer px-2 py-1 rounded-md transition-colors"
              :class="page === 'account' ? 'bg-white/10' : 'hover:bg-white/5'"
              @click="changePage('account')"
            >
              <img src="../assets/user.svg" class="size-6" alt="">
              <div class="h-0.5 w-4 rounded-full transition-all" :class="page === 'account' ? 'bg-pink-400' : 'bg-transparent'"></div>
            </div>
          </template>
        </v-tooltip>

        <img src="../assets/log-in.svg" class="size-7 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" v-on:click="openLogin" v-if="!authenticated" alt="">
        <img src="../assets/log-out.svg" class="size-7 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" v-on:click="logout" v-if="authenticated" alt="">

      </div>
      
      

    </nav>

  <main class="px-10 pt-6">

      <div class="flex flex-row items-center gap-3 py-4 overflow-x-auto" v-if="page=='search'">
        <span class="text-xs uppercase text-gray-300 tracking-widest shrink-0">Type</span>
        <div class="flex flex-row gap-2 flex-nowrap">
          <button
            v-for="category in filters.monster_categories"
            :key="category"
            @click="addFilter('type', category)"
            class="px-3 py-1 rounded-full text-xs border transition-all shrink-0 cursor-pointer"
            :class="filters.monster_category === category
              ? 'bg-pink-700 border-pink-700 text-white'
              : 'border-gray-600 text-gray-300 hover:border-gray-300 hover:text-white'"
          >
            {{ category }}
          </button>
        </div>
      </div>

    <TradeCenter
      v-if="page=='TradeCenter'"
      :login="authenticated"
      :filter-card-name="filterCardName"
      @clear-filter="filterCardName = ''"
    ></TradeCenter>
    <Search @TradeCenter="openMatches($event)" :searchCards="cards" v-if="page=='search'"></Search>
    <div v-if="page=='library'" class="py-8">
      <Library :login="authenticated"></Library>
    </div>

    <AuthDialog v-model="authDialogOpen" @authenticated="onAuthenticated" />

  </main>
</template>


<script>
import { get, getUrl } from "@/api";
import { signOut, getCurrentSession, onAuthChange } from "@/lib/supabaseClient";


  export default {
      

      data() {
          return {
            show_card:null,
            filterCardName: "",
            api: getUrl()+'cardinfo.php',
            applied_filters:{},
            filters:{
              monster_categories:['Normal','Effect','Ritual Effect','Fusion','Synchro','Xyz','Pendulum Effect','Pendulum Normal','Link','Tuner','Flip','Toon','Spirit','Union Effect','Gemini'],
              monster_category: "",
            },
            searchQuery: "",
            cards:[],
            // null when logged out, { user, session } when logged in
            authenticated: null,
            authDialogOpen: false,
            authUnsubscribe: null,
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
        openLogin() {
          this.authDialogOpen = true;
        },
        onAuthenticated(session) {
          // Called by AuthDialog after a successful sign in / sign up.
          this.authenticated = session;
        },
        async logout(){
          await signOut();
          // onAuthChange listener will clear `authenticated`, but clear it
          // immediately for snappier UI.
          this.authenticated = null;
          // Bounce back to search so we don't leave them on a logged-in page.
          if (this.page === "library" || this.page === "TradeCenter") {
            this.page = "search";
          }
        },

        changePage(name) {
          console.log(this.page)
          //this.previousPage = this.page;
          this.page = name;
          console.log(this.page)
        },
        // Open the TradeCenter (matches page). If a card is passed (from
        // "See traders" on a card tile), pre-filter the matches by that
        // card's name. Without an arg, opens the global view.
        openMatches(card = null) {
          this.show_card = card;
          this.filterCardName = card?.name ?? "";
          this.page = "TradeCenter";
        },
      },

      


      async mounted() {
        // Restore the session that Supabase persists in localStorage so a
        // page refresh doesn't kick the user out.
        this.authenticated = await getCurrentSession();

        // Stay in sync if the token refreshes or the user signs in/out from
        // another tab.
        this.authUnsubscribe = onAuthChange((session) => {
          this.authenticated = session;
        });
      },
      beforeUnmount() {
        if (typeof this.authUnsubscribe === "function") {
          this.authUnsubscribe();
        }
      },
  };
</script>