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
