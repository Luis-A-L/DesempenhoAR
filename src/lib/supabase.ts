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

    return {
        url: "https://nukddxkiffzghnppsjwi.supabase.co",
        key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8",
        fromEnv: false
    }
}

const credentials = getSupabaseCredentials()

export const isSupabaseConfigured = credentials !== null

const createMockQueryBuilder = (resolvedValue: any): any => {
  const chain: any = {
    then: (onfulfilled?: any, onrejected?: any) => {
      return Promise.resolve(resolvedValue).then(onfulfilled, onrejected);
    },
    catch: (onrejected?: any) => {
      return Promise.resolve(resolvedValue).catch(onrejected);
    },
    finally: (onfinally?: any) => {
      return Promise.resolve(resolvedValue).finally(onfinally);
    }
  };

  const chainMethods = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'like', 'ilike', 'is', 'in', 'contains', 'containedBy',
    'range', 'limit', 'order', 'insert', 'upsert', 'update', 'delete'
  ];

  chainMethods.forEach(method => {
    chain[method] = () => chain;
  });

  chain.single = () => createMockQueryBuilder(
    Array.isArray(resolvedValue?.data)
      ? { data: resolvedValue.data[0] || null, error: null }
      : resolvedValue
  );
  chain.maybeSingle = () => createMockQueryBuilder(
    Array.isArray(resolvedValue?.data)
      ? { data: resolvedValue.data[0] || null, error: null }
      : resolvedValue
  );

  return chain;
};

export const supabase = isSupabaseConfigured
  ? createClient(credentials!.url, credentials!.key)
  : ({
      from: () => {
        const chain = <T = any>(data: T[] = [], error: any = null) => {
          const result = { data, error }
          const thenable = Promise.resolve(result)
          return {
            eq: () => chain(data, error),
            neq: () => chain(data, error),
            gt: () => chain(data, error),
            gte: () => chain(data, error),
            lt: () => chain(data, error),
            lte: () => chain(data, error),
            like: () => chain(data, error),
            ilike: () => chain(data, error),
            is: () => chain(data, error),
            in: () => chain(data, error),
            contains: () => chain(data, error),
            range: () => chain(data, error),
            maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error }),
            single: () => Promise.resolve({ data: data[0] ?? null, error }),
            then: thenable.then.bind(thenable),
            catch: thenable.catch.bind(thenable),
            finally: thenable.finally.bind(thenable),
          }
        }
        return {
          select: () => chain<any[]>([]),
          insert: (vals: any) => Promise.resolve({ data: vals ?? null, error: null }),
          upsert: (vals: any) => Promise.resolve({ data: vals ?? null, error: null }),
          update: () => chain<any>(null),
          delete: () => chain<any>(null),
        }
      },
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
                  scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
                  redirectTo: window.location.origin + import.meta.env.BASE_URL,
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

export const signInWithGooglePopup = async () => {
    if (!isSupabaseConfigured) {
          throw new Error('Supabase nao configurado. Por favor, configure as credenciais.')
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
                  scopes: 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid',
                  redirectTo: window.location.origin + import.meta.env.BASE_URL,
                  skipBrowserRedirect: true,
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
    
    if (data?.url) {
        const width = 500
        const height = 600
        const left = window.screenX + (window.outerWidth - width) / 2
        const top = window.screenY + (window.outerHeight - height) / 2
        
        const popup = window.open(
            data.url,
            'google-login-popup',
            `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
        )
        return popup
    }
    return null
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
    return (data.session?.provider_token) ?? localStorage.getItem('google_provider_token') ?? null
}

// Retorna a sessao atual do Supabase
export const getSession = async () => {
    if (!isSupabaseConfigured) return null
    const { data } = await supabase.auth.getSession()
    return data.session
}

const fetchSheetsWithTimeout = async (url: string, options: any = {}, timeoutMs = 25000) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timer)
        return response
    } catch (error: any) {
        clearTimeout(timer)
        if (error.name === "AbortError") {
            throw new Error(`Tempo limite excedido (${timeoutMs}ms) ao acessar: ${url}`)
        }
        throw error
    }
}

const getSpreadsheetIdFromUrl = (url: string): string | null => {
    if (url.includes("/d/e/")) {
        const match = url.match(/\/d\/e\/([a-zA-Z0-9-_]+)/)
        if (match) return match[1]
    }
    if (url.includes("/file/d/")) {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9-_]+)/)
        if (match) return match[1]
    }
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    return match ? match[1] : null
}

const rowsToCsv = (rows: any[][]): string => {
    return rows.map(row =>
        row.map((cell: any) => {
            const val = String(cell ?? "")
            if (val.includes(",") || val.includes("\n") || val.includes('"') || val.includes(";")) {
                return `"${val.replace(/"/g, '""')}"`
            }
            return val
        }).join(",")
    ).join("\n")
}

export interface SheetFetchResult {
    sheets: Record<string, string>
    csvText: string
}

export const fetchSheetDataDirectly = async (url: string, token: string | null): Promise<SheetFetchResult> => {
    try {
        const response = await fetch(`${window.location.origin}/api/sync-sheet`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ url, token })
        })

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}))
            const errMsg = errBody?.error || `Erro HTTP ${response.status}`
            if (response.status === 401 || errBody.action === "LOGOUT") {
                throw Object.assign(new Error("Sua sessão expirou."), { status: 401, action: "LOGOUT" })
            }
            if (response.status === 403) {
                throw Object.assign(new Error(errMsg), { status: 403 })
            }
            if (response.status === 429) {
                throw Object.assign(new Error("Limite de requisições excedido pelo Google."), { status: 429 })
            }
            throw new Error(errMsg)
        }

        const data = await response.json()
        if (!data.success) {
            throw new Error(data.error || "Erro desconhecido na sincronização.")
        }

        return {
            sheets: data.sheets || {},
            csvText: data.csvText || ""
        }
    } catch (error: any) {
        console.error("Erro em fetchSheetDataDirectly:", error)
        throw error
    }
}
