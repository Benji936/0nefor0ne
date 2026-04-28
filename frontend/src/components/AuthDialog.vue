<script setup>
import { ref, watch, computed } from "vue";
import { signInWithEmail, signUpNewUser } from "@/lib/supabaseClient";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
});

const emit = defineEmits(["update:modelValue", "authenticated"]);

const mode = ref("signin"); // 'signin' | 'signup'
const email = ref("");
const password = ref("");
const submitting = ref(false);
const errorMessage = ref("");
const infoMessage = ref("");

// Reset transient state every time the dialog reopens.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      errorMessage.value = "";
      infoMessage.value = "";
      submitting.value = false;
    }
  }
);

const title = computed(() =>
  mode.value === "signup" ? "Create an account" : "Sign in"
);
const submitLabel = computed(() =>
  mode.value === "signup" ? "Create account" : "Sign in"
);

function close() {
  emit("update:modelValue", false);
}

function toggleMode() {
  mode.value = mode.value === "signin" ? "signup" : "signin";
  errorMessage.value = "";
  infoMessage.value = "";
}

async function submit() {
  if (!email.value || !password.value) {
    errorMessage.value = "Email and password are required.";
    return;
  }
  submitting.value = true;
  errorMessage.value = "";
  infoMessage.value = "";

  try {
    const fn = mode.value === "signup" ? signUpNewUser : signInWithEmail;
    const { data, error } = await fn(email.value.trim(), password.value);

    if (error) {
      errorMessage.value = error.message ?? "Authentication failed.";
      return;
    }

    // Sign-up may need email confirmation - in that case there is no session.
    if (mode.value === "signup" && !data?.session) {
      infoMessage.value =
        "Account created. Check your email to confirm, then sign in.";
      mode.value = "signin";
      password.value = "";
      return;
    }

    if (data?.session) {
      emit("authenticated", { user: data.user, session: data.session });
      close();
      // Clear sensitive fields after success
      email.value = "";
      password.value = "";
    } else {
      errorMessage.value = "No session returned. Please try again.";
    }
  } catch (err) {
    errorMessage.value = err?.message ?? "Unexpected error.";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    max-width="420"
    persistent
  >
    <v-card style="background-color: var(--c-surface); color: var(--c-text)">
      <v-card-title class="flex flex-row items-center justify-between pa-4">
        <span class="text-lg font-bold">{{ title }}</span>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          @click="close"
          :disabled="submitting"
        />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <v-form @submit.prevent="submit" class="flex flex-col gap-3">
          <v-text-field
            v-model="email"
            label="Email"
            type="email"
            autocomplete="email"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            :disabled="submitting"
            required
          />
          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            variant="outlined"
            density="comfortable"
            hide-details="auto"
            :disabled="submitting"
            required
          />

          <v-alert
            v-if="errorMessage"
            type="error"
            variant="tonal"
            density="compact"
          >
            {{ errorMessage }}
          </v-alert>
          <v-alert
            v-if="infoMessage"
            type="info"
            variant="tonal"
            density="compact"
          >
            {{ infoMessage }}
          </v-alert>

          <v-btn
            type="submit"
            variant="flat"
            style="background-color: var(--c-accent); color: white"
            :loading="submitting"
            block
          >
            {{ submitLabel }}
          </v-btn>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4 justify-center">
        <span class="text-sm text-gray-600">
          {{ mode === "signup" ? "Already have an account?" : "Don't have an account?" }}
        </span>
        <v-btn
          variant="text"
          color="var(--c-accent)"
          size="small"
          @click="toggleMode"
          :disabled="submitting"
        >
          {{ mode === "signup" ? "Sign in" : "Create one" }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
