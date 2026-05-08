<script setup>
import AccountProfileCard  from "@/components/account/AccountProfileCard.vue";
import AccountTradeHistory from "@/components/account/AccountTradeHistory.vue";
</script>

<template>
  <div class="flex flex-col gap-6 py-6 max-w-2xl mx-auto">

    <!-- Profile card + stats -->
    <AccountProfileCard :login="login" />

    <!-- Trade history -->
    <AccountTradeHistory :login="login" />

    <!-- Account settings -->
    <div class="rounded-2xl border overflow-hidden" style="background: var(--c-surface); border-color: var(--c-border)">
      <div class="flex flex-col gap-0">

        <div class="flex items-center justify-between px-5 py-4" style="border-bottom: 1px solid var(--c-border)">
          <div class="flex flex-col">
            <span class="text-sm font-semibold" style="color: var(--c-text)">Email address</span>
            <span class="text-xs mt-0.5" style="color: var(--c-muted)">{{ login?.user?.email ?? '—' }}</span>
          </div>
          <v-icon icon="mdi-email-outline" size="18" color="var(--c-muted)" />
        </div>

        <div class="flex items-center justify-between px-5 py-4">
          <div class="flex flex-col">
            <span class="text-sm font-semibold" style="color: var(--c-text)">Sign out</span>
            <span class="text-xs mt-0.5" style="color: var(--c-muted)">End your current session</span>
          </div>
          <v-btn
            size="small"
            variant="outlined"
            prepend-icon="mdi-logout"
            style="border-color: var(--c-accent); color: var(--c-accent)"
            @click="$emit('logout')"
          >Sign out</v-btn>
        </div>

      </div>
    </div>

  </div>
</template>

<script>
export default {
  props: ['login'],
  emits: ['logout'],
};
</script>
