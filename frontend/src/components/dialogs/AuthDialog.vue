<script setup>
import { ref, watch, computed } from "vue";
import { useI18n } from "vue-i18n";
import { signInWithEmail, signUpNewUser, updateTraderProfile, signInWithDiscord } from "@/lib/supabaseClient";
import { COUNTRIES } from "@/lib/countries";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});
const emit = defineEmits(["update:modelValue", "authenticated"]);

const { t } = useI18n();

const mode        = ref("signin"); // 'signin' | 'signup'
const email       = ref("");
const password    = ref("");
const name        = ref("");
const countryCode = ref("");
const city        = ref("");
const tradeScope  = ref("worldwide");
const submitting        = ref(false);
const discordSubmitting = ref(false);
const errorMessage = ref("");
const infoMessage  = ref("");

const SCOPES = computed(() => [
  { value: "local",     label: t("auth.scopes.local"),     icon: "mdi-map-marker" },
  { value: "national",  label: t("auth.scopes.national"),  icon: "mdi-flag-outline" },
  { value: "worldwide", label: t("auth.scopes.worldwide"), icon: "mdi-earth" },
]);

const countryItems = COUNTRIES.map(c => ({
  title: `${c.flag} ${c.name}`,
  value: c.code,
}));

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      errorMessage.value = "";
      infoMessage.value  = "";
      submitting.value   = false;
    }
  }
);

const title       = computed(() => mode.value === "signup" ? t("auth.createAccount") : t("auth.signIn"));
const submitLabel = computed(() => mode.value === "signup" ? t("auth.createAccountShort") : t("auth.signIn"));

function close() { emit("update:modelValue", false); }

function toggleMode() {
  mode.value = mode.value === "signin" ? "signup" : "signin";
  errorMessage.value = "";
  infoMessage.value  = "";
}

function clearFields() {
  email.value = ""; password.value = ""; name.value = "";
  countryCode.value = ""; city.value = ""; tradeScope.value = "worldwide";
}

async function submit() {
  if (!email.value || !password.value) {
    errorMessage.value = t("auth.emailPasswordRequired");
    return;
  }
  if (mode.value === "signup" && !name.value.trim()) {
    errorMessage.value = t("auth.displayNameRequired");
    return;
  }

  submitting.value = true;
  errorMessage.value = "";
  infoMessage.value  = "";

  try {
    if (mode.value === "signup") {
      const country = COUNTRIES.find(c => c.code === countryCode.value)?.name ?? "";
      const metadata = {
        full_name:   name.value.trim(),
        country_code: countryCode.value || null,
        country:      country || null,
        city:         city.value.trim() || null,
        trade_scope:  tradeScope.value,
      };
      const { data, error } = await signUpNewUser(email.value.trim(), password.value, metadata);

      if (error) { errorMessage.value = error.message ?? t("auth.signUpFailed"); return; }

      if (!data?.session) {
        // Email confirmation required — trigger will apply metadata on confirmation
        infoMessage.value = t("auth.confirmEmail");
        mode.value = "signin";
        password.value = "";
        return;
      }

      // Immediate session (email confirmation disabled) — also upsert profile directly
      await updateTraderProfile(data.user.id, {
        name: name.value.trim(), countryCode: countryCode.value,
        country, city: city.value.trim(), tradeScope: tradeScope.value,
      });

      emit("authenticated", { user: data.user, session: data.session });
      clearFields();
      close();

    } else {
      const { data, error } = await signInWithEmail(email.value.trim(), password.value);
      if (error) { errorMessage.value = error.message ?? t("auth.signInFailed"); return; }
      if (data?.session) {
        emit("authenticated", { user: data.user, session: data.session });
        clearFields();
        close();
      } else {
        errorMessage.value = t("auth.noSession");
      }
    }
  } catch (err) {
    errorMessage.value = err?.message ?? t("auth.unexpectedError");
  } finally {
    submitting.value = false;
  }
}

async function loginWithDiscord() {
  discordSubmitting.value = true;
  errorMessage.value = "";
  try {
    const { error } = await signInWithDiscord();
    if (error) errorMessage.value = error.message ?? t("auth.unexpectedError");
    // On success, browser redirects to Discord — no further action needed here.
  } catch (err) {
    errorMessage.value = err?.message ?? t("auth.unexpectedError");
    discordSubmitting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :max-width="mode === 'signup' ? 480 : 420"
    persistent
    scrollable
  >
    <v-card style="background-color: var(--c-surface); color: var(--c-text)">
      <v-card-title class="flex items-center justify-between pa-4">
        <span class="text-lg font-bold">{{ title }}</span>
        <v-btn icon="mdi-close" variant="text" density="comfortable" :disabled="submitting" @click="close" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4 overflow-y-auto" style="max-height: 80dvh">

        <!-- ── Discord OAuth button ── -->
        <button
          id="discord-oauth-btn"
          type="button"
          :disabled="submitting || discordSubmitting"
          class="w-full flex items-center justify-center gap-3 py-2.5 rounded-lg font-semibold text-sm transition-opacity cursor-pointer mb-4"
          style="background: #5865F2; color: white; border: none; opacity: 1;"
          :style="discordSubmitting ? { opacity: 0.6, cursor: 'not-allowed' } : {}"
          @click="loginWithDiscord"
        >
          <!-- Discord logo SVG -->
          <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          <span v-if="!discordSubmitting">Continue with Discord</span>
          <span v-else>Redirecting…</span>
        </button>

        <!-- ── Divider ── -->
        <div class="flex items-center gap-3 mb-4">
          <div class="flex-1 h-px" style="background: var(--c-border)" />
          <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--c-muted)">or</span>
          <div class="flex-1 h-px" style="background: var(--c-border)" />
        </div>

        <v-form @submit.prevent="submit" class="flex flex-col gap-3">

          <!-- Signup-only: display name -->
          <v-text-field
            v-if="mode === 'signup'"
            v-model="name"
            :label="$t('auth.displayName')"
            autocomplete="name"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            prepend-inner-icon="mdi-account-outline"
            :disabled="submitting"
            required
          />

          <v-text-field
            v-model="email"
            :label="$t('auth.email')"
            type="email"
            autocomplete="email"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            prepend-inner-icon="mdi-email-outline"
            :disabled="submitting"
            required
          />

          <v-text-field
            v-model="password"
            :label="$t('auth.password')"
            type="password"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            prepend-inner-icon="mdi-lock-outline"
            :disabled="submitting"
            required
          />

          <!-- Signup-only: location & trading preferences -->
          <template v-if="mode === 'signup'">
            <div class="h-px w-full my-1" style="background: var(--c-border)" />
            <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('auth.whereDoYouTrade') }}</p>

            <v-autocomplete
              v-model="countryCode"
              :items="countryItems"
              :label="$t('auth.country')"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              clearable
              prepend-inner-icon="mdi-earth"
              :disabled="submitting"
            />

            <v-text-field
              v-model="city"
              :label="$t('auth.city')"
              autocomplete="address-level2"
              variant="outlined"
              density="comfortable"
              hide-details="auto"
              prepend-inner-icon="mdi-map-marker-outline"
              :disabled="submitting"
            />

            <div class="flex flex-col gap-2">
              <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--c-muted)">{{ $t('auth.tradingRange') }}</p>
              <div class="flex gap-2">
                <button
                  v-for="s in SCOPES"
                  :key="s.value"
                  type="button"
                  class="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer"
                  :style="tradeScope === s.value
                    ? { background: 'color-mix(in srgb, var(--c-accent) 12%, transparent)', borderColor: 'var(--c-accent)', color: 'var(--c-accent)' }
                    : { background: 'transparent', borderColor: 'var(--c-border)', color: 'var(--c-muted)' }"
                  :disabled="submitting"
                  @click="tradeScope = s.value"
                >
                  <v-icon :icon="s.icon" size="14" />
                  {{ s.label }}
                </button>
              </div>
            </div>
          </template>

          <v-alert v-if="errorMessage" type="error"  variant="tonal" density="compact">{{ errorMessage }}</v-alert>
          <v-alert v-if="infoMessage"  type="info"   variant="tonal" density="compact">{{ infoMessage }}</v-alert>

          <v-btn
            type="submit"
            variant="flat"
            style="background-color: var(--c-accent); color: white"
            :loading="submitting"
            block
          >{{ submitLabel }}</v-btn>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-center">
        <span class="text-sm" style="color: var(--c-muted)">
          {{ mode === "signup" ? $t("auth.alreadyHaveAccount") : $t("auth.noAccount") }}
        </span>
        <v-btn variant="text" color="var(--c-accent)" size="small" :disabled="submitting" @click="toggleMode">
          {{ mode === "signup" ? $t("auth.signIn") : $t("auth.createOne") }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
