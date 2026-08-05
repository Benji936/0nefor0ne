<script setup>
// Wraps whatever names a person — an avatar, a name, both — in a link to their
// profile page. Slot-based on purpose: every call site already has its own
// markup and spacing for the identity block, and this should add the link
// without redesigning any of them.
//
// Degrades to a plain <span> when there is no id (an anonymous or deleted
// trader), so callers never have to guard the link themselves.
//
// Stops click propagation because these identity blocks usually sit inside a
// larger clickable surface (an announce card, a proposal row) that would
// otherwise swallow the navigation or fire its own handler alongside it.
import { computed } from "vue";
import { useRoute } from "vue-router";

const props = defineProps({
  traderId: { type: String, default: null },
  // Visual affordance. Off by default so existing dense rows keep their look;
  // on where the name is the obvious thing to click.
  underline: { type: Boolean, default: false },
});

const route = useRoute();
const locale = computed(() => route.params.locale || "en");
const linked = computed(() => !!props.traderId);
</script>

<template>
  <router-link
    v-if="linked"
    class="tl"
    :class="{ 'tl--underline': underline }"
    :to="{ name: 'trader', params: { locale, id: traderId } }"
    @click.stop
  >
    <slot />
  </router-link>
  <span v-else class="tl tl--plain"><slot /></span>
</template>

<style scoped>
/* Deliberately declares no `display`. Call sites pass their existing identity
   class (.ac-seller, .seller, …) and a parent's scoped styles do reach a child
   component's root element, so that class lands on this anchor and keeps
   owning the layout. Declaring display here would race it at equal specificity.
   (display: contents would be the obvious alternative, but it drops links out
   of the accessibility tree in several browsers.) */
.tl {
  color: inherit;
  text-decoration: none;
}
.tl:hover .tl-name,
.tl--underline:hover { text-decoration: underline; }
.tl:hover { color: var(--c-trade); }
.tl:focus-visible { outline: 2px solid var(--c-trade); outline-offset: 2px; border-radius: 6px; }
.tl--plain { cursor: default; }
.tl--plain:hover { color: inherit; }
</style>
