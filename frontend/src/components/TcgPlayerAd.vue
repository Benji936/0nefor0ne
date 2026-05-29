<script setup>
/**
 * TCGPlayer affiliate ad unit.
 *
 * Props:
 *   adId      — the placement ID in the Impact partner URL  (e.g. 3913676)
 *   width     — ad pixel width  (e.g. 240)
 *   height    — ad pixel height (e.g. 1200)
 *
 * Constants baked in from your Impact account:
 *   PARTNER   = 7340656   (your publisher ID)
 *   CAMPAIGN  = 21018     (TCGPlayer advertiser ID)
 */

const PARTNER  = '7340656';
const CAMPAIGN = '21018';

const props = defineProps({
  adId:   { type: [String, Number], required: true },
  width:  { type: [String, Number], default: 240 },
  height: { type: [String, Number], default: 1200 },
});

const linkHref  = `https://partner.tcgplayer.com/c/${PARTNER}/${props.adId}/${CAMPAIGN}`;
const imgSrc    = `//a.impactradius-go.com/display-ad/${CAMPAIGN}-${props.adId}`;
const pixelSrc  = `https://imp.pxf.io/i/${PARTNER}/${props.adId}/${CAMPAIGN}`;
</script>

<template>
  <div class="tcgplayer-ad" :style="{ width: `${width}px`, maxWidth: '100%' }">
    <a
      rel="sponsored noopener"
      :href="linkHref"
      target="_top"
      :id="`tcg-ad-${adId}`"
    >
      <img
        :src="imgSrc"
        border="0"
        alt="Shop TCGPlayer"
        :width="width"
        :height="height"
        style="display: block; max-width: 100%; height: auto"
      />
    </a>
    <!-- Impression tracking pixel -->
    <img
      :src="pixelSrc"
      height="0"
      width="0"
      style="position: absolute; visibility: hidden"
      border="0"
      aria-hidden="true"
    />
  </div>
</template>
