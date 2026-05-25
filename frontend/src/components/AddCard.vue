<template>
  <v-dialog v-model="dialogOpen" max-width="560" scrollable @after-leave="reset">
    <template v-if="!headless" #activator="{ props: activatorProps }">
      <v-btn
        density="comfortable"
        variant="flat"
        :style="{ backgroundColor: meta.color, color: 'white' }"
        :prepend-icon="meta.icon"
        v-bind="activatorProps"
      >
        {{ buttonLabel || $t('addCard.addCard') }}
      </v-btn>
    </template>

    <v-card style="min-height: 480px; background-color: var(--c-surface); color: var(--c-text)">
      <!-- Banner -->
      <div class="flex flex-row items-center gap-3 px-5 py-3" :style="{ backgroundColor: meta.color, color: 'white' }">
        <v-btn
          v-if="step === 'search'"
          icon="mdi-arrow-left"
          variant="text"
          color="white"
          density="compact"
          @click="step = 'search'"
        />
        <v-icon :icon="meta.icon" size="22" />
        <div class="flex flex-col grow min-w-0">
          <span class="font-bold leading-tight">{{ meta.title }}</span>
          <span class="text-xs opacity-80">{{ step === 'search' ? meta.subtitle : selectedCard?.name }}</span>
        </div>
        <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="dialogOpen = false" />
      </div>

      <!-- ── Step 1: Search ── -->
      <template v-if="step === 'search'">
        <div class="px-4 pt-4 pb-2">
          <v-text-field
            v-model="search"
            :label="$t('addCard.cardNameOrCode')"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            hide-details
            autofocus
            clearable
            @keyup.enter="update"
            @click:clear="cards = []"
          />
        </div>

        <v-divider />

        <div class="overflow-y-auto flex-1" style="max-height: 390px">
          <div v-if="searching" class="flex flex-col">
            <div v-for="i in 5" :key="i" class="flex items-center gap-4 px-5 py-3 border-b animate-pulse" style="border-color: var(--c-border)">
              <div class="h-16 w-12 rounded shrink-0" style="background-color: var(--c-skeleton)"></div>
              <div class="flex flex-col gap-2 grow">
                <div class="h-3 rounded w-2/3" style="background-color: var(--c-skeleton)"></div>
                <div class="h-3 rounded w-1/3" style="background-color: var(--c-border)"></div>
              </div>
            </div>
          </div>

          <div v-else-if="!cards.length" class="flex flex-col items-center justify-center py-16 gap-2" style="color: var(--c-muted)">
            <v-icon icon="mdi-card-search-outline" size="40" color="gray" />
            <p class="text-sm">{{ searched ? $t('addCard.noCardsFound') : $t('addCard.searchPrompt') }}</p>
          </div>

          <div v-else>
            <div
              v-for="card in cards"
              :key="card.id"
              class="flex items-center gap-4 px-5 py-3 cursor-pointer border-b last:border-0 transition-colors hover:bg-[var(--c-surface-2)]"
              style="border-color: var(--c-border)"
              @click="selectCard(card)"
            >
              <img :src="cardImage(card.id)" :alt="card.name" loading="lazy" class="h-16 w-12 object-contain rounded shrink-0">
              <div class="flex flex-col grow min-w-0">
                <p class="font-semibold text-sm truncate" style="color: var(--c-text)">{{ card.name }}</p>
                <p class="text-xs truncate" style="color: var(--c-muted)">{{ card.type }}<span v-if="card.race"> · {{ card.race }}</span></p>
                <p class="text-xs" style="color: var(--c-muted); opacity: 0.7" v-if="card.atk != null">ATK {{ card.atk }} / DEF {{ card.def }}</p>
              </div>
              <v-icon icon="mdi-chevron-right" color="var(--c-muted)" size="20" class="shrink-0" />
            </div>
          </div>
        </div>
      </template>

      <!-- ── Step 2: Form ── -->
      <template v-else-if="step === 'form'">
        <v-card-text class="pa-5 flex flex-col gap-4">
          <div class="flex gap-4 p-4 rounded-xl border" style="background-color: var(--c-surface-2); border-color: var(--c-border)">
            <img :src="cardImage(selectedCard.id)" :alt="selectedCard.name" class="h-24 w-[68px] object-contain rounded shrink-0">
            <div class="flex flex-col justify-center gap-1 min-w-0">
              <p class="font-bold text-base leading-tight truncate" style="color: var(--c-text)">{{ selectedCard.name }}</p>
              <p class="text-xs" style="color: var(--c-muted)">{{ selectedCard.type }}<span v-if="selectedCard.race"> · {{ selectedCard.race }}</span></p>
              <p v-if="selectedCard.atk != null" class="text-xs" style="color: var(--c-muted); opacity: 0.7">ATK {{ selectedCard.atk }} / DEF {{ selectedCard.def }}</p>
            </div>
          </div>

          <!-- Duplicate warning -->
          <div
            v-if="duplicates.length > 0"
            class="flex items-start gap-3 rounded-xl px-3 py-3 text-sm"
            style="background: color-mix(in srgb, var(--c-trade) 8%, transparent); border: 1px solid color-mix(in srgb, var(--c-trade) 25%, transparent)"
          >
            <v-icon icon="mdi-information-outline" size="16" color="var(--c-trade)" class="shrink-0 mt-1" />
            <div class="flex flex-col gap-1 min-w-0">
              <p class="text-xs font-semibold" style="color: var(--c-trade)">{{ $t('addCard.alreadyInCollection') }}</p>
              <p class="text-xs leading-snug" style="color: var(--c-muted)">
                {{ duplicates.length === 1 ? 'You have 1 entry' : `You have ${duplicates.length} entries` }} for this card
                ({{ duplicates.filter(d => !d.wish).length }} for trade,
                 {{ duplicates.filter(d => d.wish).length }} on wishlist).
                You can still add another.
              </p>
            </div>
          </div>

          <v-form validate-on="submit lazy" @submit.prevent="submit" class="flex flex-col gap-3">
            <v-select
              density="comfortable"
              variant="outlined"
              v-model="extensionDisplay"
              :items="extensions"
              :rules="[v => !!v || 'Pick an extension']"
              :label="$t('addCard.extensionRarity')"
              @update:model-value="extensionSelected"
              required
            />

            <v-select density="comfortable" variant="outlined" v-model="language" :items="languages" :label="$t('addCard.language')" />
            <div class="flex gap-4 items-center">
              <v-select density="comfortable" variant="outlined" v-model="condition" :items="conditions" :label="$t('addCard.condition')" class="grow" />
              <v-checkbox density="comfortable" label="1st Ed." color="blue-darken-3" v-model="first_edition" hide-details />
            </div>

            <v-number-input
              density="comfortable"
              v-model="quantity"
              variant="outlined"
              control-variant="split"
              :rules="[v => v > 0 || 'Quantity must be more than 0']"
              :label="$t('addCard.quantity')"
              required
              :min="1"
            />

            <v-alert v-if="errorMessage" type="error" variant="tonal" density="compact">{{ errorMessage }}</v-alert>

            <v-btn
              class="w-full mt-1"
              size="large"
              :prepend-icon="meta.icon"
              :style="{ backgroundColor: meta.color, color: 'white' }"
              variant="flat"
              type="submit"
              :loading="loading"
            >
              {{ meta.title }}
            </v-btn>
          </v-form>
        </v-card-text>
      </template>
    </v-card>
  </v-dialog>
</template>

<script>
import { cardImage } from "@/lib/cardImage";
import { searchCardByName, searchCardBySetCode, searchById } from "@/api";
import { getClient } from "@/lib/supabaseClient";

export default {
  props: {
    mode: { type: String, default: "trade", validator: (m) => ["wish", "trade"].includes(m) },
    buttonLabel: { type: String, default: "" },
    headless: { type: Boolean, default: false },
  },
  emits: ["added"],
  computed: {
    meta() {
      return this.mode === "wish"
        ? { title: this.$t('addCard.addToWishlist'), subtitle: this.$t('addCard.addToWishlistSub'), color: "var(--c-accent)", icon: "mdi-heart-plus" }
        : { title: this.$t('addCard.addToTrade'), subtitle: this.$t('addCard.addToTradeSub'), color: "var(--c-trade)", icon: "mdi-plus-box" };
    },
  },
  data() {
    return {
      dialogOpen: false,
      step: "search",
      search: "",
      cards: [],
      searching: false,
      searched: false,
      selectedCard: null,
      loading: false,
      errorMessage: "",
      duplicates: [],
      checkingDupes: false,
      extensionDisplay: null,
      extensionCode: null,
      rarity: null,
      quantity: 1,
      extensions: [],
      language: "English",
      languages: ["English", "French", "Spanish", "German", "Italian", "Portuguese"],
      condition: "Near Mint",
      conditions: ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"],
      first_edition: false,
    };
  },
  methods: {
    reset() {
      this.step = "search";
      this.search = "";
      this.cards = [];
      this.searched = false;
      this.selectedCard = null;
      this.errorMessage = "";
      this.extensionDisplay = null;
      this.extensionCode = null;
      this.rarity = null;
      this.quantity = 1;
      this.first_edition = false;
      this.duplicates = [];
    },

    openWith(card, setName = '') {
      this.selectedCard = card;
      this.extensions = (card.card_sets ?? []).map(s => `${s.set_code} | ${s.set_rarity}`);
      this.quantity = 1;
      this.errorMessage = "";
      this.extensionDisplay = null;
      this.extensionCode = null;
      this.rarity = null;

      if (setName) {
        const match = (card.card_sets ?? []).find(s => s.set_name === setName);
        if (match) {
          this.extensionDisplay = `${match.set_code} | ${match.set_rarity}`;
          this.extensionCode = match.set_code;
          this.rarity = match.set_rarity;
        }
      }

      this.step = 'form';
      this.dialogOpen = true;
    },

    async update() {
      if (!this.search.trim()) return;
      this.searching = true;
      this.searched = true;
      try {
        const locale = this.$route.params.locale || 'en';
        const response = await searchCardByName(this.search, locale);
        if (response.data?.data?.length > 0) {
          this.cards = response.data.data;
        } else if (response.data?.length > 0) {
          this.cards = response.data;
        } else {
          const alt = await searchCardBySetCode(this.search);
          if (alt) {
            const byId = await searchById(alt.data.id, locale);
            this.cards = byId.data?.data ?? byId.data ?? [];
          } else {
            this.cards = [];
          }
        }
      } finally {
        this.searching = false;
      }
    },

    selectCard(card) {
      this.selectedCard = card;
      this.extensions = (card.card_sets ?? []).map(s => `${s.set_code} | ${s.set_rarity}`);
      this.extensionDisplay = null;
      this.extensionCode = null;
      this.rarity = null;
      this.quantity = 1;
      this.errorMessage = "";
      this.duplicates = [];
      this.step = "form";
      // Duplicate check uses the English canonical name so it matches DB records
      this.checkDuplicates(card.name_en ?? card.name);
    },

    async checkDuplicates(name) {
      this.checkingDupes = true;
      const { data: userData } = await getClient().auth.getUser();
      if (!userData?.user?.id) { this.checkingDupes = false; return; }
      const { data } = await getClient()
        .from("Card")
        .select("id, wish, quantity, condition, language, extension")
        .eq("name", name)
        .eq("trader", userData.user.id)
        .not("status", "in", '("traded","locked")');
      this.duplicates = data ?? [];
      this.checkingDupes = false;
    },

    extensionSelected() {
      const [code, rar] = (this.extensionDisplay ?? "").split("|").map(s => s.trim());
      this.extensionCode = code ?? "";
      this.rarity = rar ?? "";
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
      // Always store the English canonical name so DB records are language-agnostic
      const canonicalName = this.selectedCard.name_en ?? this.selectedCard.name;
      const row = {
        wish: isWish,
        game: "YGO",
        url: "https://db.ygoprodeck.com/api/v7/cardinfo.php?name=" + canonicalName,
        name: canonicalName,
        extension: this.extensionCode,
        rarity: this.rarity,
        quantity: this.quantity,
        trader: userData.user.id,
        image_id: this.selectedCard.id,
        language: this.language,
        condition: this.condition,
        first_edition: this.first_edition,
      };

      const { data: inserted, error } = await supabase.from("Card").insert([row]).select().single();
      this.loading = false;

      if (error) {
        this.errorMessage = error.message ?? "Could not save the card.";
        return;
      }

      this.$emit("added", inserted);
      this.dialogOpen = false;
    },

    cardImage,
  },
};
</script>
