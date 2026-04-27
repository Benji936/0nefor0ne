<script setup>
import AddButtonForm from "@/components/AddButtonForm.vue";
import { cardImage } from "@/lib/cardImage";
import { computed } from "vue";

const props = defineProps({
  // 'wish' = adding to my wishlist (cards I want)
  // 'trade' = adding to my trade pile (cards I have)
  mode: { type: String, default: "trade", validator: (m) => ["wish", "trade"].includes(m) },
  // Optional override for the activator button label (e.g. "Add a card to offer").
  buttonLabel: { type: String, default: "" },
});

const emit = defineEmits(["added"]);

const meta = computed(() =>
  props.mode === "wish"
    ? {
        title: "Add to wishlist",
        subtitle: "Pick a card you're hunting for.",
        color: "#85144B", // pink/magenta - matches Wishlist accent
        icon: "mdi-heart-plus",
      }
    : {
        title: "Add card for trade",
        subtitle: "Pick a card you have to offer.",
        color: "#116699", // blue - matches Trade pile accent
        icon: "mdi-plus-box",
      }
);
</script>

<template>
  <v-overlay class="flex items-center place-content-center">
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn
        density="comfortable"
        variant="flat"
        :style="{ backgroundColor: meta.color, color: 'white' }"
        :prepend-icon="meta.icon"
        v-bind="activatorProps"
      >
        {{ buttonLabel || "Add card" }}
      </v-btn>
    </template>

    <template v-slot:default>
      <v-card class="w-[75vw]">
        <!-- Mode banner so users always know which side they're filling -->
        <div
          class="px-5 py-3 flex flex-row items-center gap-3"
          :style="{ backgroundColor: meta.color, color: 'white' }"
        >
          <v-icon :icon="meta.icon" size="24" />
          <div class="flex flex-col">
            <span class="font-bold">{{ meta.title }}</span>
            <span class="text-sm opacity-90">{{ meta.subtitle }}</span>
          </div>
        </div>

        <v-card-actions>
          <v-text-field
            v-model="search"
            label="Search by card name or set code"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            hide-details
            single-line
            v-on:keyup.enter="update"
          ></v-text-field>
        </v-card-actions>

        <div class="flex flex-column max-h-[300px] overflow-scroll px-5 py-5 border gap-5">
          <p v-if="!cards.data || cards.data.length === 0" class="text-gray-500 text-sm self-center">
            Search above to find cards.
          </p>
          <div class="flex flex-row gap-5" v-for="card in cards.data" :key="card.id">
            <img :src="cardImage(card.id)" alt="image" width="60px">
            <h1 class="align-self-center">{{ card.name }}</h1>
            <AddButtonForm :card="card" :mode="mode" @added="emit('added', $event)"></AddButtonForm>
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
      cards: [],
    };
  },
  methods: {
    async update() {
      const response = await searchCardByName(this.search);
      if (response.data.length === 0) {
        const alternative_response = await searchCardBySetCode(this.search);
        if (alternative_response) {
          const new_response = await searchById(alternative_response.data.id);
          this.cards = new_response.data;
        }
      } else {
        this.cards = response.data;
      }
    },
  },
};
</script>
