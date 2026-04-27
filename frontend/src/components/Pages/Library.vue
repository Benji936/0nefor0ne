<script setup>
import AddCard from '../AddCard.vue';
import CardElement from '../CardElement.vue';
</script>

<template>



    <div class="flex flex-col gap-2 pb-2">
        <p class="text-gray-400">
            Two lists, two buttons. Cards you <span class="text-pink-300">want</span>
            go in your wishlist; cards you <span class="text-blue-300">have</span>
            go in your trade pile.
        </p>
    </div>


    <div class="flex row justify-between gap-6 py-5">

        <!-- Trade pile (left) -->
        <div class="flex flex-column gap-3 w-45/100">
            <div class="flex flex-row items-center justify-between">
                <p class="text-left text-xl uppercase text-gray-300">Cards for trade</p>
                <AddCard mode="trade"></AddCard>
            </div>
            <div class="flex flex-row gap-3 w-100" v-for="trade in trade_cards.value">
                <CardElement :wish="trade"></CardElement>
            </div>
            <p class="self-center text-gray-400 text-base py-4" v-if="trades_quantity < 1">
                Nothing here yet. Click "Add card" to list cards you have for trade.
            </p>
        </div>

        <!-- Wishlist (right) -->
        <div class="flex flex-column gap-3 w-45/100">
            <div class="flex flex-row items-center justify-between">
                <p class="text-left text-xl uppercase text-gray-300">Wishlist</p>
                <AddCard mode="wish"></AddCard>
            </div>
            <div class="flex flex-row gap-3 w-100" v-for="wish in wished_cards.value">
                <CardElement :wish="wish"></CardElement>
            </div>
            <p class="self-center text-gray-400 text-base py-4" v-if="wishes_quantity < 1">
                Nothing here yet. Click "Add card" to list cards you're hunting for.
            </p>
        </div>

    </div>

</template>

<script>
import { getClient } from "@/lib/supabaseClient";
import { ref } from "vue";

    export default {
        props:['login'],
        data(){
            return{
                wished_cards: ref([]),
                wishes_quantity: 0,
                trade_cards: ref([]),
                trades_quantity:0,

            }
        },
        methods:{

        },
        async mounted(){
            console.log(this.login.user.id)
            const wishes = await getClient().from('Card').select('*').eq('wish',true).eq('trader',this.login.user.id)
            const trades = await getClient().from('Card').select('*').eq('wish',false).eq('trader',this.login.user.id)
            this.wished_cards.value = wishes.data
            this.trade_cards.value = trades.data
            this.wishes_quantity = wishes.data.length
            this.trades_quantity = trades.data.length

            const subscription = getClient().channel('custom-all-channel')
            .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'Card' },
            async (payload) => {
                console.log('Change received!', payload)
                let wish_req = await getClient().from('Card').select('*').eq('wish',true).eq('trader',this.login.user.id)
                let trade_req = await getClient().from('Card').select('*').eq('wish',false).eq('trader',this.login.user.id)
                this.wished_cards.value = wish_req.data
                this.trade_cards.value = trade_req.data
            }
            )
            .subscribe((status) => {
                console.log('Channel status:', status)
            })
            //console.log(this.wished_cards)
        },

        async unmounted(){

        }
    };

</script>