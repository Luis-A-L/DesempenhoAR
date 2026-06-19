import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ==========================================
// Google OAuth Login (com escopo Sheets)
// ==========================================
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
  if (error) {
    console.error('Erro no login com Google:', error)
    throw error
  }
  return data
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) console.error('Erro ao sair:', error)
}

// Retorna o access token do Google para usar na API do Sheets
export const getGoogleAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession()
  return (data.session?.provider_token) ?? null
}

// Retorna a sessão atual do Supabase
export const getSession = async () => {
  const { data } = await supabase.auth.getSession()
  return data.session
}
