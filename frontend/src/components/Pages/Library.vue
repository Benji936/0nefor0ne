<script setup>
import AddCard from '../AddCard.vue';
</script>

<template>



    <p class="text-gray-400">Here you can add cards you're searching for and cards you are willing to trade</p>

    <div class="flex row justify-between py-5 px-5">

        <div class="flex flex-column gap-5 w-1/3">
            <p class="text-center text-xl uppercase text-gray-300">Cards for trade</p>
            <AddCard></AddCard>
        </div>

        <div class="flex flex-column gap-5 w-1/3">
            <p class="text-center text-xl uppercase text-gray-300">Wishlist</p>
            <AddCard></AddCard>
        </div>

    </div>

    

</template>