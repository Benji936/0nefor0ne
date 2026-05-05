import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://sxteuctysfiwripnaozi.supabase.co'
const supabasePublishableKey =  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4dGV1Y3R5c2Zpd3JpcG5hb3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTA1OTAsImV4cCI6MjA3MjkyNjU5MH0.nrRXz20dGkNH3wDIkHTxlrVMC-uvEiukWsq9-Pu4Lcw'

export const supabase = createClient(supabaseUrl, supabasePublishableKey)

/**
 * Sign up a new user. Returns the raw Supabase result so the caller can
 * surface error.message in the UI.
 *   { data: { user, session }, error }
 *
 * Note: depending on your Auth settings, signups may require email
 * confirmation, in which case `data.session` will be null.
 */
export async function signUpNewUser(email, password) {
    return await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: window.location.origin,
        },
    })
}

/**
 * Sign in with email + password. Returns:
 *   { data: { user, session }, error }
 */
export async function signInWithEmail(email, password) {
    return await supabase.auth.signInWithPassword({ email, password })
}

/**
 * Sign out the current user.
 */
export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) {
        console.error("Sign out failed:", error)
        return false
    }
    return true
}

/**
 * Read the persisted session (Supabase keeps it in localStorage by default).
 * Returns the same shape as a fresh sign-in's `data` ({ user, session }) or
 * null if there is no session.
 */
export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
        console.error("getSession failed:", error)
        return null
    }
    if (!data?.session) return null
    return { user: data.session.user, session: data.session }
}

/**
 * Subscribe to auth state changes (sign in, sign out, token refresh).
 * Returns the unsubscribe function.
 */
export function onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
            callback({ user: session.user, session })
        } else {
            callback(null)
        }
    })
    return () => data?.subscription?.unsubscribe?.()
}

export function getClient() {
    return supabase
}
