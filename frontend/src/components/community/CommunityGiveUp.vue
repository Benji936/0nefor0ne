<script setup>
// The way out. One community per account means the exit has to be real: without
// it, a community made by mistake locks the account that made it.
//
// Two acts, one control, and which one you get is not a choice. A community you
// created is deleted. A seeded shop you claimed is handed back to the directory,
// because it was a real place before you claimed it. The server decides from
// created_by and refuses a mismatch; this only picks the wording.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { giveUpMode, releaseCommunity } from "@/lib/community";

const props = defineProps({
  community: { type: Object, required: true },
  viewerId:  { type: String, default: null },
});
const emit = defineEmits(["gone"]);
const { t } = useI18n();

const mode = computed(() => giveUpMode(props.community, props.viewerId));
const open   = ref(false);
const typed  = ref("");
const busy   = ref(false);
const failed = ref(false);

// Releasing is undone by claiming again, so one click is enough. Deleting takes
// the events and the followers with it and nothing brings them back, so it costs
// the name typed out in full.
const armed = computed(() =>
  mode.value === "release" || typed.value.trim() === (props.community.name ?? "").trim());

function close() { open.value = false; typed.value = ""; failed.value = false; }

async function confirm() {
  if (!armed.value || busy.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const res = await releaseCommunity(props.community.id, mode.value);
    if (res?.error) throw new Error(res.error);
    emit("gone", mode.value);
  } catch (err) {
    console.error("CommunityGiveUp: failed", err);
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="mode" class="cgu">
    <button v-if="!open" type="button" class="cgu__trigger" @click="open = true">
      {{ mode === 'delete' ? t('community.giveUpDelete') : t('community.giveUpRelease') }}
    </button>

    <div v-else class="cgu__panel">
      <p class="cgu__body">
        {{ mode === 'delete' ? t('community.giveUpDeleteBody') : t('community.giveUpReleaseBody') }}
      </p>

      <label v-if="mode === 'delete'" class="cgu__label">
        {{ t('community.giveUpTypeName', { name: community.name }) }}
        <input v-model="typed" type="text" class="cgu__input" autocomplete="off" spellcheck="false" />
      </label>

      <p v-if="failed" class="cgu__failed" role="alert">{{ t('community.giveUpFailed') }}</p>

      <div class="cgu__row">
        <button type="button" class="cgu__go" :disabled="!armed || busy" @click="confirm">
          {{ mode === 'delete' ? t('community.giveUpDeleteAction') : t('community.giveUpReleaseAction') }}
        </button>
        <button type="button" class="cgu__keep" :disabled="busy" @click="close">
          {{ t('community.giveUpKeep') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cgu { margin-top: 34px; padding-top: 18px; border-top: 1px solid var(--c-border); }

/* Deliberately not a button shape. Nobody should reach this by aiming at
   something that looks clickable from across the page. */
.cgu__trigger {
  background: none; border: none; padding: 0;
  font-size: 12.5px; color: var(--c-muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 3px;
}
.cgu__trigger:hover { color: var(--c-error, #ef4444); }

.cgu__body { font-size: 13.5px; line-height: 1.55; color: var(--c-text); max-width: 62ch; margin: 0 0 14px; }

.cgu__label { display: block; font-size: 12.5px; color: var(--c-muted); margin-bottom: 16px; }
.cgu__input {
  display: block; margin-top: 6px; width: 100%; max-width: 320px;
  padding: 8px 10px; font-size: 14px;
  background: var(--c-surface); color: var(--c-text);
  border: 1px solid var(--c-border); border-radius: 8px;
}
.cgu__input:focus { outline: 2px solid var(--c-error, #ef4444); outline-offset: 1px; border-color: transparent; }

.cgu__failed { font-size: 12.5px; color: var(--c-error, #ef4444); margin: 0 0 12px; }

.cgu__row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; }

.cgu__go {
  padding: 8px 14px; border-radius: 8px; border: none;
  background: var(--c-error, #ef4444); color: #fff;
  font-size: 13px; font-weight: 600; cursor: pointer;
}
.cgu__go:disabled { opacity: 0.45; cursor: default; }

.cgu__keep {
  background: none; border: none; padding: 0;
  font-size: 13px; color: var(--c-muted); cursor: pointer;
}
.cgu__keep:hover { color: var(--c-text); }
</style>
