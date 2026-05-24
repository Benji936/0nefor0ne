<template>
  <div class="max-w-2xl mx-auto py-10 md:py-16 flex flex-col gap-8">

    <div class="flex flex-col gap-2">
      <router-link
        to="/"
        class="text-xs no-underline flex items-center gap-1 mb-2 transition-opacity hover:opacity-70 w-fit"
        style="color: var(--c-muted)"
      >
        <v-icon icon="mdi-arrow-left" size="14" />
        Back
      </router-link>
      <h1 class="text-2xl md:text-3xl font-black" style="color: var(--c-text)">Privacy Policy</h1>
      <p class="text-sm" style="color: var(--c-muted)">Last updated: May 2026</p>
    </div>

    <p class="text-sm leading-relaxed" style="color: var(--c-muted)">
      One for One ("we", "us", "our") is a free, peer-to-peer Yu-Gi-Oh! card trading platform.
      This policy explains what data we collect, why we collect it, and what we do with it.
      We keep it plain English — no legalese.
    </p>

    <section v-for="section in SECTIONS" :key="section.title" class="flex flex-col gap-3">
      <h2 class="text-base font-bold" style="color: var(--c-text)">{{ section.title }}</h2>
      <div class="flex flex-col gap-2">
        <p
          v-for="(para, i) in section.body"
          :key="i"
          class="text-sm leading-relaxed"
          style="color: var(--c-muted)"
          v-html="para"
        />
      </div>
    </section>

    <div class="h-px w-full" style="background: var(--c-border)" />
    <p class="text-xs" style="color: var(--c-muted)">
      Questions? Email us at
      <a href="mailto:hello@0nefor.one" style="color: var(--c-trade)">hello@0nefor.one</a>.
    </p>
  </div>
</template>

<script setup>
const SECTIONS = [
  {
    title: "What we collect",
    body: [
      "<strong style=\"color: inherit\">Account data</strong> — your email address and the password hash managed by Supabase Auth. We never see your raw password.",
      "<strong style=\"color: inherit\">Profile data</strong> — your display name, optional avatar URL, and optional location (country and city) that you provide to help nearby traders find each other.",
      "<strong style=\"color: inherit\">Card data</strong> — the cards you add to your trade pile and wishlist, and the trade proposals you send or receive.",
      "<strong style=\"color: inherit\">Usage data</strong> — standard server logs (IP address, browser type, pages visited) retained for up to 30 days for security and debugging.",
    ],
  },
  {
    title: "What we do with it",
    body: [
      "We use your card data exclusively to match you with other traders and to facilitate trade proposals between users.",
      "Your display name and location are visible to other logged-in users so they can find you as a potential trade partner. Your email address is never shared with other users.",
      "We do not sell, rent, or share your personal data with third parties for marketing purposes.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "<strong style=\"color: inherit\">Supabase</strong> — our database and authentication provider. Your data is stored on Supabase's infrastructure (EU region). See <a href=\"https://supabase.com/privacy\" target=\"_blank\" rel=\"noopener\" style=\"color: var(--c-trade)\">supabase.com/privacy</a>.",
      "<strong style=\"color: inherit\">YGOProdeck API</strong> — used to fetch public Yu-Gi-Oh! card information (names, images, set data). No personal data is sent to this service.",
      "<strong style=\"color: inherit\">Google AdSense</strong> — we display ads to cover hosting costs. Google may use cookies to personalise ads. See <a href=\"https://policies.google.com/privacy\" target=\"_blank\" rel=\"noopener\" style=\"color: var(--c-trade)\">Google's Privacy Policy</a>.",
    ],
  },
  {
    title: "Cookies",
    body: [
      "We use one session cookie set by Supabase to keep you logged in. We do not use tracking or analytics cookies beyond what Google AdSense requires.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "You can delete your account at any time from the Account page. Deleting your account removes your profile, card lists, and trade history from our database.",
      "You can request a copy of your data or ask us to delete it by emailing hello@0nefor.one.",
      "If you are in the EU/EEA, you have rights under the GDPR including access, rectification, erasure, and objection to processing.",
    ],
  },
  {
    title: "Changes to this policy",
    body: [
      "If we make material changes we will update the date at the top of this page and, if the changes are significant, notify you by email.",
    ],
  },
];
</script>
