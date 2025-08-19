import axios from "axios";

const API_URL = "https://db.ygoprodeck.com/api/v7/";

export const searchCardByName= async (fname = "") => {
    const response = axios.get(API_URL+"cardinfo.php?fname="+fname).catch(function(error){
        console.error("Error fetching card with " + fname, error);
        return { data: [] };
    })
    return response;
}

export const searchCardBySetCode = (code="") => {

    const response = axios.get(API_URL+"cardsetsinfo.php?setcode="+code)
    .catch(function(error){
        console.error("Error fetching card with " + code, error);
        return null;
    })
    return response;
}

export const searchById = (id="") => {
    const response = axios.get(API_URL+"cardinfo.php?id="+id)
    .catch(function(error){
        console.error("Error fetching card with " + id, error);
        return { data: [] };
    })
    return response;
}