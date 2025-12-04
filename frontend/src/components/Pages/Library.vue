<script setup>
import AddCard from '../AddCard.vue';
import CardElement from '../CardElement.vue';
</script>

<template>



    <div class="flex flex-col gap-3">
        <p class="text-gray-400">Here you can add cards you're searching for and cards you are willing to trade</p>
        <div class="">
             <AddCard></AddCard>
        </div>
       
    </div>
    

    <div class="flex row justify-between py-5">

        <div class="flex flex-column gap-5 w-45/100">
            <p class="text-left text-xl uppercase text-gray-300">Cards for trade</p> 
            <div class="flex flex-row gap-3 w-100" v-for="trade in trade_cards.value">
                <CardElement :wish="trade"></CardElement>
                
            </div>    
            <p class="self-center text-gray-400 text-xl" v-if="trades_quantity < 1">No Card for Trades</p>       
        </div>

        <div class="flex flex-column gap-5 w-45/100">
            <p class="text-left text-xl uppercase text-gray-300">Wishlist</p>
            
            <div class="flex flex-row gap-3 w-100" v-for="wish in wished_cards.value">
                <CardElement :wish="wish"></CardElement>
            </div>
            <p class="self-center text-gray-400 text-xl" v-if="wishes_quantity < 1">No wishes</p> 
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