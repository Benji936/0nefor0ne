<!-- AuthCallback.vue
     Landing page for Discord (and any future) OAuth redirects.
     Supabase JS automatically detects the access_token in the URL hash and
     establishes the session — we just wait for that, then redirect home. -->
<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase, syncDiscordIdToTrader } from '@/lib/supabaseClient'

const router = useRouter()
const route  = useRoute()

onMounted(async () => {
  // Supabase JS v2 handles the hash fragment automatically on client load.
  // We wait up to 3 s for the session to be available, then sync + redirect.
  let attempts = 0
  const check = async () => {
    const { data } = await supabase.auth.getSession()
    if (data?.session) {
      // Explicitly sync discord_id → Trader table.
      // Works for both new OAuth signups and linkIdentity flows.
      await syncDiscordIdToTrader()
      const locale = route.params.locale || 'en'
      router.replace(`/${locale}/`)
    } else if (attempts < 15) {
      attempts++
      setTimeout(check, 200)
    } else {
      // Timed out — redirect anyway
      router.replace(`/${route.params.locale || 'en'}/`)
    }
  }
  await check()
})
</script>

<template>
  <!-- Minimal loading screen shown for the fraction of a second before redirect -->
  <div
    class="fixed inset-0 flex flex-col items-center justify-center gap-4"
    style="background: var(--c-bg)"
  >
    <svg
      width="48" height="48" viewBox="0 0 127.14 96.36"
      fill="#5865F2" xmlns="http://www.w3.org/2000/svg"
      style="animation: pulse 1.2s ease-in-out infinite"
    >
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
    </svg>
    <p class="text-sm font-semibold" style="color: var(--c-muted)">Signing you in…</p>
  </div>
</template>

<style scoped>
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.6; transform: scale(0.92); }
}
</style>
