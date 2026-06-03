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

const i18n = createI18n({
  legacy: false,          // use Composition API mode
  locale: "en",
  fallbackLocale: "en",
  globalInjection: true,
  messages: { en, fr, de, it },
});

/** Change locale and persist the choice. */
export function setLocale(lang) {
  if (!SUPPORTED.includes(lang)) return;
  i18n.global.locale.value = lang;
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, lang);
  }
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang);
  }
}

export { SUPPORTED, detectLocale };
export default i18n;
