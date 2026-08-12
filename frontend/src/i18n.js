import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";

const SUPPORTED = ["en", "fr", "de", "it"];
const STORAGE_KEY = "lang";

/** Pick the best locale: saved preference → browser language → 'en'. */
function detectLocale() {
  if (typeof window === "undefined") return "en";

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* SSR/no-op */ }
  if (saved && SUPPORTED.includes(saved)) return saved;

  // navigator.languages is ordered by preference
  for (const lang of navigator.languages ?? [navigator.language]) {
    const code = lang.split("-")[0].toLowerCase();
    if (SUPPORTED.includes(code)) return code;
  }
  return "en";
}

/**
 * One i18n instance per app — never a module-level singleton.
 *
 * A shared instance is harmless in the browser, where exactly one app exists.
 * It is wrong under vite-ssg, which renders routes concurrently inside a single
 * Node process: the locale one page's route guard set leaked into another
 * page's renderToString before it finished. The symptom was /fr/, /de/ and /it/
 * shipping a correct French, German or Italian <title> — those resolve
 * per-route with an explicit `locale` option, so they never touched the shared
 * state — above an English body. Three locale homepages read as duplicates of
 * the English one while their hreflang cluster insisted they were translations,
 * and which pages came out wrong could change from build to build.
 */
export function createAppI18n(locale = "en") {
  return createI18n({
    legacy: false,          // use Composition API mode
    locale: SUPPORTED.includes(locale) ? locale : "en",
    fallbackLocale: "en",
    globalInjection: true,
    messages: { en, fr, de, it },
  });
}

/**
 * The side effects of a locale change that live outside vue-i18n. No-ops during
 * SSG, where there is no window to persist to and no document to label.
 * Setting the locale itself belongs to the router hook in main.js, which is the
 * only code holding a reference to the current app's instance.
 */
export function persistLocale(lang) {
  if (!SUPPORTED.includes(lang)) return;
  if (typeof window !== "undefined") {
    // Mirrors detectLocale's guard: Safari private mode throws on write too.
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* no-op */ }
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang);
  }
}

export { SUPPORTED, detectLocale };
