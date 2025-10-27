import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxteuctysfiwripnaozi.supabase.co'
const supabasePublishableKey =  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dGV1Y3R5c2Zpd3JpcG5hb3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTA1OTAsImV4cCI6MjA3MjkyNjU5MH0.nrRXz20dGkNH3wDIkHTxlrVMC-uvEiukWsq9-Pu4Lcw'
console.log(supabaseUrl)
console.log(supabasePublishableKey)
export const supabase = createClient(supabaseUrl,supabasePublishableKey)

export async function signUpNewUser(user_email, user_password) {
    const { data, error } = await supabase.auth.signUp({
        email: user_email,
        password: user_password,
        options: {
            emailRedirectTo: 'localhost:5173',
        },
    })

    if(error){
        console.log(error)
        return false;
    }else{
        return true
    }
}

export async function signInWithEmail(user_email, user_password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email: user_email,
        password: user_password,
    })

    if(error){
        console.log(error)
        return false;
    }else{
        return true
    }
}


export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
        console.error("Erreur lors de la déconnexion:", error)
        return true;
    } else {
        console.log("Déconnexion réussie.")
        // Redirection vers la page de connexion (exemple)
        return false;
    }
}

export function query(tableName){
    return supabase.from(tableName)
}