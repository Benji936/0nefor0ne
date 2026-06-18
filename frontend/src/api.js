import axios from "axios";

const API_URL = "https://db.ygoprodeck.com/api/v7/";

/** Map app locale codes to ygoprodeck language param values.
 *  English is the API default — omitting the param avoids an unnecessary query string. */
const LANG_MAP = { fr: "fr", de: "de", it: "it" };

function langParam(locale = "en") {
    const lang = LANG_MAP[locale];
    return lang ? `&language=${lang}` : "";
}

export const getUrl = () => API_URL;

/** Name search is intentionally language-agnostic: users type English card names
 *  regardless of the active UI locale. Localized names/desc are fetched separately
 *  by ID (searchById) when the card detail view opens. */
export const searchCardByName = async (fname = "") => {
    return axios.get(`${API_URL}cardinfo.php?fname=${fname}`).catch((error) => {
        console.error("Error fetching card with " + fname, error);
        return { data: [] };
    });
};

export const searchCardBySetCode = (code = "") => {
    const split_code = code.split("-");
    const final_code = split_code[0] + "-EN" + split_code[1].replace(/[a-zA-Z]/g, "");
    return axios.get(`${API_URL}cardsetsinfo.php?setcode=${final_code}`).catch((error) => {
        console.error("Error fetching card with " + code, error);
        return null;
    });
};

export const searchById = async (id = "", locale = "en") => {
    try {
        const res = await axios.get(`${API_URL}cardinfo.php?id=${id}${langParam(locale)}`);
        // Some cards lack translations — if the API returned nothing, fall back to English
        const hasData = res.data?.data?.length > 0 || (Array.isArray(res.data) && res.data.length > 0);
        if (!hasData && locale !== "en") {
            return axios.get(`${API_URL}cardinfo.php?id=${id}`).catch(() => ({ data: [] }));
        }
        return res;
    } catch {
        if (locale !== "en") {
            // Retry without language param (card may lack a translation)
            return axios.get(`${API_URL}cardinfo.php?id=${id}`).catch(() => ({ data: [] }));
        }
        console.error("Error fetching card with " + id);
        return { data: [] };
    }
};

/** Fetch ALL printing artworks for a card by its exact (English) name.
 *  cardinfo.php?id=<passcode> only ever returns the single queried artwork, so the
 *  full card_images list (alternate arts) must be fetched by name. Each entry's id
 *  is its own passcode — already mirrored to R2 — so the frontend can build an image
 *  URL for every printing. Name search is language-agnostic (pass the English name).
 *  Returns the raw card_images array (possibly empty); never throws. */
export const getCardArtworks = async (name = "") => {
    if (!name) return [];
    try {
        const res = await axios.get(`${API_URL}cardinfo.php?name=${encodeURIComponent(name)}`);
        const data = res?.data?.data?.[0] ?? null;
        return data?.card_images ?? [];
    } catch {
        return [];
    }
};

export const getCardSets = () => {
    return axios.get(`${API_URL}cardsets.php`).catch((error) => {
        console.error("Error fetching card sets", error);
        return { data: [] };
    });
};

export const getCardsBySet = (setName = "", locale = "en") => {
    return axios.get(`${API_URL}cardinfo.php?cardset=${encodeURIComponent(setName)}${langParam(locale)}`).catch((error) => {
        console.error("Error fetching cards for set " + setName, error);
        return { data: { data: [] } };
    });
};

export const get = (url = "") => {
    return axios.get(url).catch((error) => {
        console.error("Error fetching card with " + error);
        return { data: [] };
    });
};

/** Fetch up to `num` cards belonging to a given archetype. */
export const searchByArchetype = (archetype, num = 20) => {
    return axios.get(`${API_URL}cardinfo.php?archetype=${encodeURIComponent(archetype)}&num=${num}`)
        .catch(() => ({ data: { data: [] } }));
};

/** Fetch up to `num` cards matching the given server-supported filters.
 *  All params are optional; omitted/null/empty params are excluded from the request URL.
 *  Numeric params (level/scale/link) accept either a plain value for equality or a
 *  YGOPRODeck comparator string ("gte8", "lte4") for range matching.
 *  @param {string}        [fname]      - card name fragment (fname)
 *  @param {string}        [type]       - card type, comma-separated list allowed (e.g. "Synchro Monster", "Spell Card")
 *  @param {string}        [attribute]  - card attribute (EARTH/WIND/FIRE/WATER/LIGHT/DARK/DIVINE); sent lowercase
 *  @param {number|string} [level]      - card level / rank (e.g. 8 or "gte8")
 *  @param {string}        [race]       - card race / Spell-Trap sub-type (e.g. "Dragon", "Quick-Play")
 *  @param {number|string} [link]       - link rating (e.g. 3 or "gte3")
 *  @param {number|string} [scale]      - pendulum scale (e.g. 8 or "lte4")
 *  @param {string}        [linkmarker] - comma-separated link arrow markers (e.g. "Top,Bottom-Left") — AND semantics
 *  @param {string}        [sort]       - server-side sort field: "name"|"atk"|"def"|"level"|"new"
 *  @param {number}        [num=40]     - max number of results
 *  @param {number}        [offset=0]   - pagination offset (YGOPRODeck requires num & offset together)
 */
export const searchByFilters = ({ fname, type, attribute, level, race, link, scale, linkmarker, sort, num = 40, offset = 0 } = {}) => {
    const p = new URLSearchParams();
    if (fname)                          p.set("fname", fname);
    if (type)                           p.set("type", type);
    if (attribute)                      p.set("attribute", String(attribute).toLowerCase());
    if (level != null && level !== "")  p.set("level", level);
    if (race)                           p.set("race", race);
    if (link != null && link !== "")    p.set("link", link);
    if (scale != null && scale !== "")  p.set("scale", scale);
    if (linkmarker)                     p.set("linkmarker", linkmarker);
    if (sort)                           p.set("sort", sort);
    // YGOPRODeck rejects `num` unless `offset` is also present ("use both or none").
    if (num != null) {
        p.set("num", num);
        p.set("offset", offset);
    }
    return axios.get(`${API_URL}cardinfo.php?${p.toString()}`)
        .catch(() => ({ data: { data: [] } }));
};

/**
 * Fetch multiple cards by their Konami passcode IDs.
 * Uses the YGOPRODeck batch endpoint (comma-separated IDs).
 * Chunks requests into batches of 100 to stay within API limits.
 *
 * @param {number[]} ids - Array of numeric card IDs (passcodes)
 * @returns {Promise<Object>} Plain lookup map keyed by numeric ID: { [id]: cardData }
 *   Unresolvable IDs (alt-art/fake passcodes) are silently omitted.
 */
export async function getCardsByIds(ids = []) {
    if (!ids.length) return {};

    const CHUNK_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        chunks.push(ids.slice(i, i + CHUNK_SIZE));
    }

    const result = {};

    for (const chunk of chunks) {
        const idList = chunk.join(",");
        const res = await axios
            .get(`${API_URL}cardinfo.php?id=${idList}`)
            .catch((error) => {
                console.error("Error fetching cards by ids", error);
                return { data: { data: [] } };
            });

        const cards = res?.data?.data ?? (Array.isArray(res?.data) ? res.data : []);
        for (const card of cards) {
            if (card?.id != null) {
                result[card.id] = card;
            }
        }
    }

    return result;
}
