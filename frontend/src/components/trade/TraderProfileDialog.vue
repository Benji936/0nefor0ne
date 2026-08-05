<script setup>
// Dialog wrapper around TraderProfileBody, for checking someone without losing
// your place mid-flow (a proposal, a match list). The same profile also lives
// at its own route — see TraderPage.vue — which is what links elsewhere in the
// app point at. Both render the identical body.
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import TraderProfileBody from '@/components/trade/TraderProfileBody.vue';

const { t } = useI18n();
const route = useRoute();

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  traderId:   { type: String,  default: null  },
  // Optional: pass the current user's id so we can hide "Propose" on own profile
  currentUserId: { type: String, default: null },
});
const emit = defineEmits(['update:modelValue', 'propose']);

const profile = ref(null);

const open = computed({
  get: () => props.modelValue,
  set: v  => emit('update:modelValue', v),
});

const isSelf = computed(() =>
  props.currentUserId && props.traderId && props.currentUserId === props.traderId,
);

const locale = computed(() => route.params.locale || 'en');

function close() { open.value = false; }

function propose() {
  emit('propose', { id: props.traderId, name: profile.value?.name ?? null });
  close();
}
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable :scrim="true">
    <v-card class="rounded-2xl overflow-hidden" style="background: var(--c-surface); color: var(--c-text)">

      <div class="h-2 w-full shrink-0" style="background: linear-gradient(90deg, var(--c-trade), var(--c-accent))" />

      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        density="compact"
        class="absolute top-3 right-3"
        style="color: var(--c-muted); z-index: 1"
        @click="close"
      />

      <v-card-text class="pa-0 overflow-y-auto" style="max-height: 82vh">
        <div class="px-8 py-6">
          <!-- `active` defers the fetch until the dialog is actually opened. -->
          <TraderProfileBody
            :trader-id="traderId"
            :active="open"
            @loaded="profile = $event"
          />
        </div>
      </v-card-text>

      <div class="flex items-center justify-end gap-3 px-8 py-5 shrink-0" style="border-top: 1px solid var(--c-border)">
        <!-- Escape hatch to the permanent URL, so a profile found mid-flow can
             be bookmarked or shared rather than only glanced at. -->
        <router-link
          v-if="traderId"
          class="mr-auto flex items-center gap-1.5 text-sm font-semibold no-underline"
          style="color: var(--c-muted)"
          :to="{ name: 'trader', params: { locale, id: traderId } }"
          @click="close"
        >
          <v-icon icon="mdi-open-in-new" size="15" />
          {{ t('traderProfile.openFullPage') }}
        </router-link>

        <v-btn variant="text" style="color: var(--c-muted)" @click="close">{{ t('traderProfile.close') }}</v-btn>
        <v-btn
          v-if="!isSelf"
          variant="flat"
          prepend-icon="mdi-swap-horizontal"
          style="background: var(--c-trade); color: white"
          @click="propose"
        >{{ t('traderProfile.proposeTrade') }}</v-btn>
      </div>

    </v-card>
  </v-dialog>
</template>
