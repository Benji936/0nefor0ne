import axios from "axios";

const API_URL = "https://db.ygoprodeck.com/api/v7/";

export const getUrl = () => {
    return API_URL;
}

export const searchCardByName= async (fname = "") => {
    const response = axios.get(API_URL+"cardinfo.php?fname="+fname).catch(function(error){
        console.error("Error fetching card with " + fname, error);
        return { data: [] };
    })
    return response;
}

export const searchCardBySetCode = (code="") => {

    let split_code = code.split("-")
    let final_code = split_code[0]+"-EN"+split_code[1].replace(/[a-zA-Z]/g,'')

    const response = axios.get(API_URL+"cardsetsinfo.php?setcode="+final_code)
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

export const search = (type='') => {
    return
}

export const get = (url="") => {
    const response = axios.get(url).catch(function(error){
        console.error("Error fetching card with " + error);
        return { data: [] };
    })
    return response;
}