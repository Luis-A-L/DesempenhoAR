import { createClient } from '@supabase/supabase-js'

const getSupabaseCredentials = () => {
    const envUrl = import.meta.env.VITE_SUPABASE_URL
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (envUrl && envKey && !envUrl.includes('placeholder') && !envKey.includes('placeholder')) {
          return { url: envUrl, key: envKey, fromEnv: true }
    }

    const localUrl = localStorage.getItem('VITE_SUPABASE_URL')
    const localKey = localStorage.getItem('VITE_SUPABASE_ANON_KEY')

    if (localUrl && localKey) {
          return { url: localUrl, key: localKey, fromEnv: false }
    }

    return null
}

const credentials = getSupabaseCredentials()

export const isSupabaseConfigured = credentials !== null

export const supabase = isSupabaseConfigured
  ? createClient(credentials!.url, credentials!.key)
    : ({
            from: () => ({
                      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
                      insert: () => Promise.resolve({ data: null, error: null }),
                      upsert: () => Promise.resolve({ data: null, error: null }),
                      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
                      delete: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            }),
            auth: {
                      getSession: () => Promise.resolve({ data: { session: null } }),
                      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                      signInWithOAuth: () => Promise.resolve({ data: null, error: null }),
                      signOut: () => Promise.resolve({ error: null }),
            },
            channel: () => ({
                      on: function() { return this },
                      subscribe: () => {},
            }),
            removeChannel: () => {},
    } as any)

// ==========================================
// Google OAuth Login (com escopo Sheets)
// ==========================================
export const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
          throw new Error('Supabase nao configurado. Por favor, configure as credenciais.')
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
                  scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly',
                  redirectTo: window.location.origin + window.location.pathname,
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
    if (!isSupabaseConfigured) return
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Erro ao sair:', error)
}

// Retorna o access token do Google para usar na API do Sheets
export const getGoogleAccessToken = async (): Promise<string | null> => {
    if (!isSupabaseConfigured) return null
    const { data } = await supabase.auth.getSession()
    return (data.session?.provider_token) ?? null
}

// Retorna a sessao atual do Supabase
export const getSession = async () => {
    if (!isSupabaseConfigured) return null
    const { data } = await supabase.auth.getSession()
    return data.session
}
