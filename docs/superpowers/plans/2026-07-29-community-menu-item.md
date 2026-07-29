# Community Menu Item (Profile Dropdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "My community" item to the top-right profile dropdown, shown only to community owners, that routes to their community (single) or the Account list (multiple).

**Architecture:** A pure helper resolves the route target from the owner's community slugs. `UserMenuChip.vue` reads the caller's owned communities on user load, computes the target, and renders one conditional dropdown item that `router.push`es to it. No backend/route/schema changes.

**Tech Stack:** Vue 3 `<script setup>` + Vuetify + vue-router + vue-i18n (en/fr/de/it) + Supabase client; Vitest for the pure helper.

## Global Constraints

- **Owners only:** the item renders only when the signed-in user owns ≥1 community.
- **Destination:** owns exactly 1 → `{ name: 'communityProfile', params: { locale, slug } }`; owns 2+ → `{ name: 'account', params: { locale } }`; owns 0 → no item.
- **Label:** "My community" via i18n key `userMenu.myCommunity`. Icon `mdi-storefront-outline`.
- **Locale** is threaded into every target (`route.params.locale || 'en'`).
- Navigation is a direct `router.push(target)`; `App.vue`'s active `page` is a computed from `$route.name`, so nav state stays correct.
- 4-locale parity, **no em dashes** (accents fine).
- The owned-communities read is owner-scoped (`.eq('owner', userId)`), returns only the caller's rows; on failure or sign-out, treat as no owned communities (item hidden) and never block the menu.

## File Structure

- **Create** `frontend/src/lib/communityMenu.js` (+ `.test.js`) — `communityMenuTarget(slugs, locale)`.
- **Modify** `frontend/src/locales/{en,fr,de,it}.json` — add `userMenu.myCommunity`.
- **Modify** `frontend/src/components/nav/UserMenuChip.vue` — owned read + conditional item + router.push.

---

### Task 1: `communityMenuTarget` helper (pure, TDD)

**Files:**
- Create: `frontend/src/lib/communityMenu.js`
- Test: `frontend/src/lib/communityMenu.test.js`

**Interfaces:**
- Produces: `communityMenuTarget(slugs, locale = 'en') -> routeLocation | null`. Consumed by `UserMenuChip.vue` (Task 3).

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/lib/communityMenu.test.js
import { describe, it, expect } from "vitest";
import { communityMenuTarget } from "./communityMenu";

describe("communityMenuTarget", () => {
  it("returns null when the user owns no communities", () => {
    expect(communityMenuTarget([], "en")).toBeNull();
  });
  it("returns null for a missing/invalid slug list", () => {
    expect(communityMenuTarget(null, "en")).toBeNull();
    expect(communityMenuTarget(undefined, "en")).toBeNull();
  });
  it("routes a single owner straight to their community profile", () => {
    expect(communityMenuTarget(["my-store"], "fr")).toEqual({
      name: "communityProfile",
      params: { locale: "fr", slug: "my-store" },
    });
  });
  it("routes a multi-owner to the account list", () => {
    expect(communityMenuTarget(["a", "b"], "de")).toEqual({
      name: "account",
      params: { locale: "de" },
    });
  });
  it("defaults the locale to 'en' when omitted", () => {
    expect(communityMenuTarget(["x"]).params.locale).toBe("en");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/communityMenu.test.js`
Expected: FAIL — `Failed to resolve import "./communityMenu"`.

- [ ] **Step 3: Write the implementation**

```js
// frontend/src/lib/communityMenu.js
// Resolves where the profile menu's "My community" item navigates, from the
// slugs of communities the signed-in user owns. Pure — unit-tested.
//   []            -> null                (hide the item)
//   [slug]        -> that community's profile
//   [slug, ...]   -> the Account "My communities" list
export function communityMenuTarget(slugs, locale = "en") {
  if (!Array.isArray(slugs) || slugs.length === 0) return null;
  if (slugs.length === 1) {
    return { name: "communityProfile", params: { locale, slug: slugs[0] } };
  }
  return { name: "account", params: { locale } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/communityMenu.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/communityMenu.js frontend/src/lib/communityMenu.test.js
git commit -m "feat(community): communityMenuTarget helper for profile menu"
```

---

### Task 2: i18n key (4 locales)

**Files:**
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/fr.json`
- Modify: `frontend/src/locales/de.json`
- Modify: `frontend/src/locales/it.json`

**Interfaces:**
- Produces key `userMenu.myCommunity` in all 4 locales. Consumed by Task 3.

- [ ] **Step 1: Add the key to each locale's `userMenu` object**

In each file, inside the existing `userMenu` object (it already has `accountProfile` and `signOut`), add `myCommunity` as a sibling (add a comma after the preceding key; keep JSON valid):

- `en.json` → `"myCommunity": "My community"`
- `fr.json` → `"myCommunity": "Ma communauté"`
- `de.json` → `"myCommunity": "Meine Community"`
- `it.json` → `"myCommunity": "La mia community"`

- [ ] **Step 2: Verify parity + no em dashes**

Run:

```bash
cd frontend && node -e "for (const l of ['en','fr','de','it']){const o=require('./src/locales/'+l+'.json'); const v=o.userMenu&&o.userMenu.myCommunity; console.log(l, v? (v.includes('—')?'EMDASH':'ok'):'MISSING', JSON.stringify(v));}"
```
Expected: `en ok "My community"`, `fr ok "Ma communauté"`, `de ok "Meine Community"`, `it ok "La mia community"` — no MISSING, no EMDASH.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/locales/en.json frontend/src/locales/fr.json frontend/src/locales/de.json frontend/src/locales/it.json
git commit -m "feat(community): i18n userMenu.myCommunity (4 locales)"
```

---

### Task 3: `UserMenuChip.vue` — owned read + conditional item

**Files:**
- Modify: `frontend/src/components/nav/UserMenuChip.vue`

**Interfaces:**
- Consumes: `communityMenuTarget` from `@/lib/communityMenu`; `userMenu.myCommunity` (Task 2); the existing `communityProfile` / `account` routes.
- Produces: a "My community" dropdown item shown only to owners, routing to the resolved target.

- [ ] **Step 1: Extend the `<script setup>`**

In `frontend/src/components/nav/UserMenuChip.vue`, update the imports (lines 1-4) to add router + the helper:

```js
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { getClient } from '@/lib/supabaseClient';
import { communityMenuTarget } from '@/lib/communityMenu';
```

After `const { t } = useI18n();` (line 12), add:

```js
const route  = useRoute();
const router = useRouter();
```

Add an `ownedSlugs` ref next to the other refs (after `const avatarUrl = ref(null);`, line 15):

```js
const ownedSlugs = ref([]);
```

Add a loader for owned communities, right after `loadProfile` (after line 28). It captures the id and only applies if still current (guards a rapid sign-in/out swap); a read error leaves the list empty:

```js
async function loadOwnedCommunities(userId) {
  if (!userId) { ownedSlugs.value = []; return; }
  const { data, error } = await getClient()
    .from('community')
    .select('slug')
    .eq('owner', userId)
    .limit(2);
  if (props.login?.user?.id !== userId) return; // superseded by a newer user
  if (error) { console.error('loadOwnedCommunities failed', error); ownedSlugs.value = []; return; }
  ownedSlugs.value = (data ?? []).map(r => r.slug);
}
```

Update the existing watch (line 30) to also load owned communities:

```js
watch(() => props.login?.user?.id, id => {
  loadProfile(id);
  loadOwnedCommunities(id);
}, { immediate: true });
```

Add the target computed after `menuItems` (after line 51):

```js
const communityTarget = computed(() => communityMenuTarget(ownedSlugs.value, route.params.locale || 'en'));

function goCommunity() {
  menuOpen.value = false;
  if (communityTarget.value) router.push(communityTarget.value);
}
```

- [ ] **Step 2: Add the item to the template**

In the "Action items" block, add the "My community" button immediately after the `v-for` menu-items button (after line 141, still inside the `<div class="flex flex-col py-1">`):

```html
        <button
          v-if="communityTarget"
          class="menu-item flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors text-left w-full"
          @click="goCommunity"
        >
          <v-icon icon="mdi-storefront-outline" size="16" style="color: var(--c-muted)" />
          <span class="text-sm" style="color: var(--c-text)">{{ t('userMenu.myCommunity') }}</span>
        </button>
```

- [ ] **Step 3: Verify compile + no regressions**

Run the unit suite (ensures nothing broke):

```bash
cd frontend && npx vitest run
```
Expected: all pass.

- [ ] **Step 4: Verify in the browser (controller step)**

Start the dev server (`preview_start` with `frontend-dev`). Signed in as a community owner: open the profile chip → the dropdown shows **"My community"** under Account; clicking it lands on the owner's community profile (single) or `/account` (if they own 2+), and the menu closes. Signed in as a non-owner (and signed out): the item is absent. Confirm `read_console_messages` shows no errors. (Owner state requires a signed-in session; at minimum confirm the chip compiles and renders with zero console errors.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/nav/UserMenuChip.vue
git commit -m "feat(community): My community item in the profile menu (owners only)"
```

---

## Self-Review

**Spec coverage:**
- Owners-only visibility → Task 3 (`v-if="communityTarget"` + owned read). ✓
- Single → profile, 2+ → account → Task 1 (`communityMenuTarget`) + Task 3. ✓
- Label "My community" + icon → Task 2 (key) + Task 3 (button). ✓
- Locale threaded → Task 1 (param) + Task 3 (`route.params.locale`). ✓
- router.push nav (page state via computed) → Task 3 `goCommunity`. ✓
- Owner-scoped read, failure/sign-out safe → Task 3 `loadOwnedCommunities` (empty on no-user/error, stale-id guard). ✓
- 4-locale parity, no em dashes → Task 2 + its Step 2 check. ✓
- Unit test for the resolver → Task 1. ✓

**Placeholder scan:** every code step carries literal code; no TBD/TODO. ✓

**Type consistency:** `communityMenuTarget(slugs, locale)` signature identical in Task 1 and its Task 3 call; `ownedSlugs` (array of slug strings) produced by `loadOwnedCommunities` and consumed by `communityTarget`; the route names `communityProfile`/`account` match `router/index.js`. ✓
