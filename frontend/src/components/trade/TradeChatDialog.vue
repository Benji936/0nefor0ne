<script setup>
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import TradeChatPanel from "@/components/trade/TradeChatPanel.vue";

const props = defineProps({
  modelValue:    { type: Boolean, default: false },
  proposal:      { type: Object,  default: null  },
  currentUserId: { type: String,  default: null  },
});

const emit = defineEmits(["update:modelValue"]);

const { t } = useI18n();

const statusLabel = computed(() => {
  const map = {
    pending:   t('proposal.pending'),
    accepted:  t('proposal.accepted'),
    declined:  t('proposal.declined'),
    cancelled: t('proposal.cancelled'),
    completed: t('proposal.completed'),
  };
  return map[props.proposal?.status] ?? (props.proposal?.status ?? '');
});
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="520"
    :scrim="false"
    transition="dialog-bottom-transition"
    class="trade-chat-dialog"
  >
    <v-card
      v-if="proposal"
      class="!rounded-2xl overflow-hidden flex flex-col"
      style="
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        height: min(720px, 85dvh);
        box-shadow: 0 24px 64px -12px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04);
      "
    >
      <!-- Header -->
      <div
        class="flex items-center gap-3 px-4 py-3 shrink-0"
        style="border-bottom: 1px solid var(--c-border)"
      >
        <!-- Avatar -->
        <div
          class="size-8 rounded-full shrink-0 flex items-center justify-center text-sm font-bold select-none"
          style="background: color-mix(in srgb, var(--c-trade) 18%, transparent); color: var(--c-trade)"
        >{{ (proposal.counterparty_name ?? "?")[0].toUpperCase() }}</div>

        <!-- Names -->
        <div class="flex flex-col grow min-w-0">
          <span class="text-sm font-bold leading-tight truncate" style="color: var(--c-text)">
            {{ proposal.counterparty_name ?? "Anonymous" }}
          </span>
          <span class="text-[11px]" style="color: var(--c-muted)">Trade #{{ proposal.id }}</span>
        </div>

        <!-- Status dot -->
        <span
          class="text-[11px] font-semibold px-2 py-1 rounded-md shrink-0"
          :style="{
            color: proposal.status === 'pending'  ? 'var(--c-trade)'
                 : proposal.status === 'accepted' ? 'var(--c-mutual)'
                 : 'var(--c-muted)',
            background: proposal.status === 'pending'  ? 'color-mix(in srgb, var(--c-trade) 14%, transparent)'
                      : proposal.status === 'accepted' ? 'color-mix(in srgb, var(--c-mutual) 14%, transparent)'
                      : 'color-mix(in srgb, var(--c-muted) 12%, transparent)',
          }"
        >{{ statusLabel }}</span>

        <v-btn
          icon="mdi-close"
          variant="text"
          density="compact"
          style="color: var(--c-muted)"
          @click="emit('update:modelValue', false)"
        />
      </div>

      <!-- Chat fills remaining height -->
      <div class="flex flex-col grow overflow-hidden">
        <TradeChatPanel
          :open="modelValue"
          :proposal="proposal"
          :current-user-id="currentUserId"
          :standalone="true"
        />
      </div>
    </v-card>
  </v-dialog>
</template>

<style>
/* Position the chat dialog at bottom-right instead of center */
.trade-chat-dialog .v-overlay__content {
  align-self: flex-end;
  justify-self: flex-end;
  margin: 0 24px 24px 0;
}
</style>
