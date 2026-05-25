import { createI18n } from "vue-i18n";
import en from "./locales/en.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import it from "./locales/it.json";

const SUPPORTED = ["en", "fr", "de", "it"];
const STORAGE_KEY = "lang";

/** Pick the best locale: saved preference → browser language → 'en'. */
function detectLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
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
  locale: detectLocale(),
  fallbackLocale: "en",
  messages: { en, fr, de, it },
});

/** Change locale and persist the choice. */
export function setLocale(lang) {
  if (!SUPPORTED.includes(lang)) return;
  i18n.global.locale.value = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  document.documentElement.setAttribute("lang", lang);
}

export { SUPPORTED };
export default i18n;
