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
      <h1 class="text-2xl md:text-3xl font-black" style="color: var(--c-text)">Terms of Service</h1>
      <p class="text-sm" style="color: var(--c-muted)">Last updated: July 2026</p>
    </div>

    <p class="text-sm leading-relaxed" style="color: var(--c-muted)">
      One for One (the "Service") is a free, peer-to-peer Yu-Gi-Oh! card trading platform
      operated by <strong style="color: inherit">Benjamin Sitbon</strong>, an individual based in
      Switzerland ("we", "us", "our"). By creating an account or using the Service, you agree to
      these Terms. We keep them plain English, no legalese. If you do not agree, please do not use
      the Service.
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
      Questions about these Terms? Email
      <a href="mailto:benjsit@gmail.com" style="color: var(--c-trade)">benjsit@gmail.com</a>.
    </p>
  </div>
</template>

<script setup>
const SECTIONS = [
  {
    title: "Who runs One for One",
    body: [
      "One for One is owned and operated by Benjamin Sitbon as an individual (a sole operator, not a company) based in Switzerland. Where these Terms say \"we\" or \"us\", they mean Benjamin Sitbon.",
      "You can reach us for any legal or account matter at <a href=\"mailto:benjsit@gmail.com\" style=\"color: var(--c-trade)\">benjsit@gmail.com</a>.",
    ],
  },
  {
    title: "Who can use it",
    body: [
      "You must be able to form a binding agreement to use the Service. If you are a minor under the law of your country, you may only use One for One with the consent and supervision of a parent or legal guardian.",
      "One account per person. You are responsible for keeping your login details safe and for everything that happens under your account.",
    ],
  },
  {
    title: "What the Service is (and isn't)",
    body: [
      "One for One is a tool that helps collectors find each other and arrange trades of physical Yu-Gi-Oh! cards. It is completely free to use.",
      "<strong style=\"color: inherit\">We are not a party to your trades.</strong> We do not buy, sell, ship, hold, escrow, or handle payment for any card. We do not verify the condition, authenticity, ownership, or value of any card listed. We simply connect willing traders, the trade itself is arranged and completed directly between you and the other person.",
    ],
  },
  {
    title: "Trading with other users",
    body: [
      "Because trades happen directly between users, you are responsible for how you conduct them. Use common sense: agree on card condition up front, use tracked shipping where possible, and be cautious with anyone you do not know.",
      "We are not responsible for, and cannot resolve, disputes between traders, including no-shows, misrepresented or counterfeit cards, damage in transit, or lost mail. Any dispute over a trade is strictly between the traders involved.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "You agree not to use One for One to break the law, defraud or harass other users, list counterfeit or stolen cards, impersonate anyone, or post content that is illegal, hateful, or infringing.",
      "You also agree not to scrape, crawl, or bulk-download the Service with automated tools, attempt to break its security, overload its infrastructure, or circumvent any limits we put in place.",
      "We may suspend or remove any account that breaks these rules, with or without notice.",
    ],
  },
  {
    title: "Your content",
    body: [
      "You keep ownership of what you add, your display name, avatar, location, card lists, wishlist, and any messages. By posting it, you grant us a limited, non-exclusive licence to store and display it as needed to run the Service (for example, showing your display name and trade pile to other logged-in users).",
      "You are responsible for the content you post and confirm you have the right to share it.",
    ],
  },
  {
    title: "Ads, affiliate links, and donations",
    body: [
      "We show ads (via Google AdSense) to help cover hosting costs.",
      "Some outbound links on the site, for example to TCGplayer, eBay, and Railway, are affiliate links, meaning we may earn a small commission if you buy or sign up through them, at no extra cost to you. These are disclosed on the \"Built with & partners\" page.",
      "If you choose to support the project through the Ko-fi donation link, donations are voluntary, non-refundable, and do not entitle you to any product, service, or feature.",
      "Third-party sites we link to have their own terms and privacy policies, which we do not control.",
    ],
  },
  {
    title: "Intellectual property",
    body: [
      "The One for One name, logo, site design, and original content are owned by Benjamin Sitbon. You may not copy or reuse them without permission.",
      "Yu-Gi-Oh! and all related names, card images, and marks are trademarks of Konami and their respective owners. One for One is an independent fan-made project and is <strong style=\"color: inherit\">not affiliated with, endorsed by, or sponsored by Konami</strong>. Card information and images are sourced from the public YGOProdeck API.",
    ],
  },
  {
    title: "No warranty",
    body: [
      "The Service is provided \"as is\" and \"as available\", without warranties of any kind. We do not guarantee that it will be uninterrupted, error-free, secure, or that any trade will be successful. We may change, suspend, or discontinue any part of it at any time.",
    ],
  },
  {
    title: "Limitation of liability",
    body: [
      "To the fullest extent permitted by law, Benjamin Sitbon is not liable for any indirect, incidental, or consequential damages, or for any loss arising from trades between users, downtime, data loss, or your use of the Service. Because One for One is a free service, our total liability to you is limited to the maximum extent the law allows.",
      "Nothing in these Terms excludes liability that cannot legally be excluded.",
    ],
  },
  {
    title: "Suspension and closing your account",
    body: [
      "You can delete your account at any time from the Account page. We may suspend or terminate accounts that violate these Terms or that we reasonably believe put other users or the Service at risk.",
    ],
  },
  {
    title: "Changes to these Terms",
    body: [
      "We may update these Terms from time to time. If we make material changes, we will update the date at the top of this page. Continuing to use the Service after changes take effect means you accept the updated Terms.",
    ],
  },
  {
    title: "Governing law",
    body: [
      "These Terms are governed by the laws of Switzerland, without regard to conflict-of-law rules. To the extent permitted by law, any dispute relating to these Terms or the Service will be subject to the jurisdiction of the competent Swiss courts at the operator's place of residence. If you are a consumer, this does not deprive you of the protection of any mandatory laws of your country of residence.",
    ],
  },
];
</script>
