<script setup>
import { computed } from "vue";
import { cardImage } from "@/lib/cardImage";

const props = defineProps({
  card: { type: Object, required: true },
  // 'wish' = adding to wishlist, 'trade' = adding to trade pile
  mode: { type: String, default: "trade", validator: (m) => ["wish", "trade"].includes(m) },
});

// Emits `added` with the inserted Card row when the form successfully creates one.
defineEmits(["added"]);

const meta = computed(() =>
  props.mode === "wish"
    ? { color: "#85144B", label: "Add to wishlist", icon: "mdi-heart-plus" }
    : { color: "#116699", label: "Add to trade pile", icon: "mdi-plus-box" }
);
</script>

<template>
  <v-overlay class="flex items-center place-content-center" v-model="overlay">
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn
        class="align-self-center"
        icon="$plus"
        v-bind="activatorProps"
        v-on:click="cardSelected(card)"
      ></v-btn>
    </template>

    <template v-slot:default>
      <div class="flex flex-col gap-5 rounded py-6 px-8 bg-white w-fit-content place-self-center self-center">
        <!-- Mode banner -->
        <div
          class="flex flex-row items-center gap-3 px-3 py-2 rounded"
          :style="{ backgroundColor: meta.color, color: 'white' }"
        >
          <v-icon :icon="meta.icon" size="20" />
          <span class="font-bold">{{ meta.label }}</span>
        </div>

        <!-- Card preview -->
        <div class="flex flex-row gap-5">
          <img :src="cardImage(card.id)" alt="image" class="h-60 w-40" />
          <div class="flex flex-col">
            <h1 class="font-bold text-lg">{{ card.name }}</h1>
            <h2 class="w-[400px] text-sm text-gray-600">{{ card.desc }}</h2>
          </div>
        </div>

        <!-- Form -->
        <v-form validate-on="submit lazy" @submit.prevent="submit">
          <div class="flex flex-col gap-3">

            <!-- Extension & rarity is meaningful for both modes -->
            <v-select
              density="comfortable"
              variant="outlined"
              v-model="extension"
              :items="extensions"
              :rules="[v => !!v || 'Pick an extension']"
              label="Extension & Rarity"
              @update:model-value="extensionSelected"
              required
            ></v-select>

            <!-- Trade-only fields: condition matters for what you have, not for what you want -->
            <template v-if="mode === 'trade'">
              <v-select
                density="comfortable"
                variant="outlined"
                v-model="language"
                :items="languages"
                label="Language"
              ></v-select>

              <div class="flex flex-row gap-5">
                <v-select
                  density="comfortable"
                  variant="outlined"
                  v-model="condition"
                  :items="conditions"
                  label="Condition"
                  class="grow"
                ></v-select>

                <v-checkbox
                  density="comfortable"
                  label="First edition"
                  color="blue-darken-3"
                  v-model="first_edition"
                ></v-checkbox>
              </div>
            </template>

            <v-number-input
              density="comfortable"
              v-model="quantity"
              variant="outlined"
              control-variant="split"
              :rules="[v => v > 0 || 'Quantity must be more than 0']"
              label="Quantity"
              required
            ></v-number-input>

            <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact">
              {{ errorMessage }}
            </v-alert>

            <v-btn
              class="w-full"
              size="large"
              :prepend-icon="meta.icon"
              :style="{ backgroundColor: meta.color, color: 'white' }"
              variant="flat"
              type="submit"
              :loading="loading"
            >
              {{ meta.label }}
            </v-btn>
          </div>
        </v-form>
      </div>
    </template>
  </v-overlay>
</template>

<script>
import { getClient } from "@/lib/supabaseClient";

export default {
  // Note: props are declared via defineProps in <script setup> above. We
  // restate them here so the Options API methods can read this.mode/this.card.
  props: {
    card: { type: Object, required: true },
    mode: { type: String, default: "trade" },
  },
  data() {
    return {
      overlay: false,
      loading: false,
      errorMessage: "",
      language: "English",
      languages: ["English", "French", "Spanish", "German", "Italian", "Portuguese"],
      extension: null,
      extensions: [],
      quantity: 1,
      rarity: null,
      rarities: [],
      condition: "Near Mint",
      conditions: ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"],
      first_edition: false,
    };
  },
  methods: {
    cardSelected(card) {
      this.errorMessage = "";
      this.extensions = [];
      this.rarities = [];
      for (let i = 0; i < (card.card_sets ?? []).length; i++) {
        this.extensions.push(card.card_sets[i].set_code + " | " + card.card_sets[i].set_rarity);
        this.rarities.push(card.card_sets[i].set_rarity);
      }
    },

    extensionSelected() {
      const split = (this.extension ?? "").split("|");
      this.extension = split[0]?.trim() ?? "";
      this.rarity = split[1]?.trim() ?? "";
    },

    async submit() {
      this.loading = true;
      this.errorMessage = "";

      const supabase = getClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user?.id) {
        this.errorMessage = "You must be signed in to add a card.";
        this.loading = false;
        return;
      }

      const isWish = this.mode === "wish";

      const row = {
        wish: isWish,
        game: "YGO",
        url: "https://db.ygoprodeck.com/api/v7/cardinfo.php?name=" + this.card.name,
        name: this.card.name,
        extension: this.extension,
        rarity: this.rarity,
        quantity: this.quantity,
        trader: userData.user.id,
        image_id: this.card.id,
        // Wishlist entries don't care about printing/condition - leave defaults.
        language: isWish ? null : this.language,
        condition: isWish ? "Mint" : this.condition,  // DB default; ignored for wishes
        first_edition: isWish ? false : this.first_edition,
      };

      const { data: inserted, error } = await supabase
        .from("Card")
        .insert([row])
        .select()
        .single();
      this.loading = false;

      if (error) {
        this.errorMessage = error.message ?? "Could not save the card.";
        return;
      }

      this.$emit("added", inserted);
      this.overlay = false;
    },
  },
};
</script>
