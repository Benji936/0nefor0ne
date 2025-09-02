import { createClient } from '@supabase/supabase-js'

export const supabase = createClient('https://cgzszfciepbzjoyiwzzq.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJscnB3eWtoanhpcnFyaXBydG9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0NjA5MzYsImV4cCI6MjA3MjAzNjkzNn0.mPkMea4kLSJToshEGm9l-oXZEjxpfJUb1uBhMRBLFLY')

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