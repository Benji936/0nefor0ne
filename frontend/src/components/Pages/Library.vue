<script setup>
import AddCard from '../AddCard.vue';
import CardElement from '../CardElement.vue';
</script>

<template>



    <p class="text-gray-400">Here you can add cards you're searching for and cards you are willing to trade</p>

    <div class="flex row justify-between py-5 px-5">

        <div class="flex flex-column gap-5 w-45/100">
            <p class="text-center text-xl uppercase text-gray-300">Cards for trade</p>
            <AddCard></AddCard>

            
        </div>

        <div class="flex flex-column gap-5 w-45/100">
            <p class="text-center text-xl uppercase text-gray-300">Wishlist</p>
            <AddCard></AddCard>
            <div class="flex flex-row gap-3 w-100" v-for="wish in wished_cards">
                <CardElement :wish="wish"></CardElement>
            </div>
        </div>

    </div>

</template>

<script>
import { query } from "@/lib/supabaseClient";

    export default {
        data(){
            return{
                wished_cards: [],
                trade_cards: [],
            }
        },
        methods:{

        },
        async mounted(){
            const response = await query('Card').select('*').eq('wish',true)
            this.wished_cards = response.data
            console.log(this.wished_cards)
        },
    };

</script>