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

export const searchCardByName = async (fname = "", locale = "en") => {
    return axios.get(`${API_URL}cardinfo.php?fname=${fname}${langParam(locale)}`).catch((error) => {
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

export const searchById = (id = "", locale = "en") => {
    return axios.get(`${API_URL}cardinfo.php?id=${id}${langParam(locale)}`).catch((error) => {
        console.error("Error fetching card with " + id, error);
        return { data: [] };
    });
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
