<script setup>
import AddCard from '../AddCard.vue';
import CardElement from '../CardElement.vue';
</script>

<template>



    <div class="flex flex-col gap-2 pb-4">
        <p style="color: var(--c-muted)">
            Cards you <span class="text-pink-300 font-medium">want</span> go in your wishlist;
            cards you <span class="text-blue-300 font-medium">have</span> go in your trade pile.
        </p>
    </div>


    <div class="flex flex-col gap-10 py-2">

        <!-- Trade pile -->
        <div class="flex flex-col gap-4">
            <div class="flex flex-row items-center justify-between">
                <p class="text-left text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Cards for trade</p>
                <AddCard mode="trade" @added="onCardAdded"></AddCard>
            </div>
            <template v-if="loading">
                <div v-for="i in 3" :key="i" class="flex flex-row items-center gap-4 rounded-lg px-4 py-3 w-full animate-pulse border" style="background-color: var(--c-surface-2); border-color: var(--c-border)">
                    <div class="h-14 w-10 rounded shrink-0" style="background-color: var(--c-skeleton)"></div>
                    <div class="flex flex-col gap-2 grow">
                        <div class="h-3 rounded w-3/4" style="background-color: var(--c-skeleton)"></div>
                        <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)"></div>
                    </div>
                    <div class="h-8 w-32 rounded shrink-0" style="background-color: var(--c-skeleton)"></div>
                </div>
            </template>
            <template v-else>
                <TransitionGroup name="card-slide" tag="div" class="flex flex-wrap gap-3">
                    <CardElement
                        :wish="trade"
                        v-for="trade in trade_cards.value"
                        :key="trade.id"
                        :class="newCardId === trade.id ? 'ring-2 ring-blue-400' : ''"
                    ></CardElement>
                </TransitionGroup>
                <p class="self-center text-sm py-6" style="color: var(--c-muted)" v-if="trades_quantity < 1">
                    Nothing here yet — click "Add card" to list cards you have for trade.
                </p>
            </template>
        </div>

        <!-- Wishlist -->
        <div class="flex flex-col gap-4">
            <div class="flex flex-row items-center justify-between">
                <p class="text-left text-xl uppercase font-semibold tracking-wide" style="color: var(--c-text)">Wishlist</p>
                <AddCard mode="wish" @added="onCardAdded"></AddCard>
            </div>
            <template v-if="loading">
                <div v-for="i in 3" :key="i" class="flex flex-row items-center gap-4 rounded-lg px-4 py-3 w-full animate-pulse border" style="background-color: var(--c-surface-2); border-color: var(--c-border)">
                    <div class="h-14 w-10 rounded shrink-0" style="background-color: var(--c-skeleton)"></div>
                    <div class="flex flex-col gap-2 grow">
                        <div class="h-3 rounded w-3/4" style="background-color: var(--c-skeleton)"></div>
                        <div class="h-3 rounded w-1/2" style="background-color: var(--c-border)"></div>
                    </div>
                    <div class="h-8 w-32 rounded shrink-0" style="background-color: var(--c-skeleton)"></div>
                </div>
            </template>
            <template v-else>
                <TransitionGroup name="card-slide" tag="div" class="flex flex-wrap justify-start gap-3">
                    <CardElement
                        :wish="wish"
                        v-for="wish in wished_cards.value"
                        :key="wish.id"
                        :class="newCardId === wish.id ? 'ring-2 ring-pink-400' : ''"
                    ></CardElement>
                </TransitionGroup>
                <p class="self-center text-sm py-6" style="color: var(--c-muted)" v-if="wishes_quantity < 1">
                    Nothing here yet — click "Add card" to list cards you're hunting for.
                </p>
            </template>
        </div>

    </div>

    <v-snackbar v-model="snackbar.open" :timeout="3000" :color="snackbar.color" location="bottom right">
        <v-icon :icon="snackbar.icon" class="mr-2" size="18" />
        {{ snackbar.message }}
    </v-snackbar>

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
                trades_quantity: 0,
                loading: true,
                newCardId: null,
                snackbar: { open: false, message: '', color: '', icon: '' },
            }
        },
        methods:{
            /**
             * Hide original cards that have a locked copy representing them in an accepted trade.
             * When a trade is accepted, a trigger creates a locked Card copy that points back to
             * the original via locked_original_card_id. Showing both would be confusing — only
             * the locked copy (which carries the "Accepted trade" badge) should appear.
             */
            filterCovered(cards) {
                const lockedOriginalIds = new Set(
                    cards
                        .filter(c => c.status === 'locked' && c.locked_original_card_id)
                        .map(c => c.locked_original_card_id)
                );
                return cards.filter(c => c.status === 'locked' || !lockedOriginalIds.has(c.id));
            },

            onCardAdded(newCard) {
                if (newCard.wish) {
                    this.wished_cards.value = [newCard, ...this.wished_cards.value]
                    this.wishes_quantity++
                    this.snackbar = { open: true, message: `"${newCard.name}" added to wishlist.`, color: 'var(--c-accent)', icon: 'mdi-heart-plus' }
                } else {
                    this.trade_cards.value = [newCard, ...this.trade_cards.value]
                    this.trades_quantity++
                    this.snackbar = { open: true, message: `"${newCard.name}" added to trade pile.`, color: 'var(--c-trade)', icon: 'mdi-plus-box' }
                }
                this.newCardId = newCard.id
                setTimeout(() => { this.newCardId = null }, 2000)
            },
        },
        async mounted(){
            const [wishes, trades] = await Promise.all([
                getClient().from('Card').select('*').eq('wish', true).eq('trader', this.login.user.id).neq('status', 'traded'),
                getClient().from('Card').select('*').eq('wish', false).eq('trader', this.login.user.id).neq('status', 'traded'),
            ])
            this.wished_cards.value = this.filterCovered(wishes.data)
            this.trade_cards.value  = this.filterCovered(trades.data)
            this.wishes_quantity = this.wished_cards.value.length
            this.trades_quantity = this.trade_cards.value.length
            this.loading = false

            const subscription = getClient().channel('custom-all-channel')
            .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'Card' },
            async () => {
                let wish_req  = await getClient().from('Card').select('*').eq('wish',true).eq('trader',this.login.user.id).neq('status','traded')
                let trade_req = await getClient().from('Card').select('*').eq('wish',false).eq('trader',this.login.user.id).neq('status','traded')
                this.wished_cards.value = this.filterCovered(wish_req.data)
                this.trade_cards.value  = this.filterCovered(trade_req.data)
                this.wishes_quantity = this.wished_cards.value.length
                this.trades_quantity = this.trade_cards.value.length
            }
            )
            .subscribe()
        },

    };

</script>

<style scoped>
.card-slide-enter-active {
    transition: all 0.25s ease-out;
}
.card-slide-enter-from {
    opacity: 0;
    transform: translateY(-6px);
}
</style>