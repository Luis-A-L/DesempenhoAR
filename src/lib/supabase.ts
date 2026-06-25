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
      from: () => createMockQueryBuilder({ data: [], error: null }),
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

export const fetchSheetDataDirectly = async (url: string, token: string): Promise<SheetFetchResult> => {
    const spreadsheetId = getSpreadsheetIdFromUrl(url)
    if (!spreadsheetId) {
        throw new Error("Formato do link do Google Planilhas inválido.")
    }

    const metaRes = await fetchSheetsWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        15000
    )

    if (!metaRes.ok) {
        const errBody = await metaRes.json().catch(() => ({}))
        const errMsg = errBody?.error?.message || `Erro HTTP ${metaRes.status}`
        if (metaRes.status === 401) throw Object.assign(new Error("Sua sessão expirou."), { status: 401, action: "LOGOUT" })
        if (metaRes.status === 403) throw Object.assign(new Error(errMsg), { status: 403 })
        if (metaRes.status === 429) throw Object.assign(new Error("Limite de requisições excedido."), { status: 429 })
        throw new Error(errMsg)
    }

    const metaData = await metaRes.json()
    const sheetsList = metaData.sheets || []

    if (sheetsList.length === 0) {
        throw new Error("A planilha não contém abas.")
    }

    const sheetsResultMap: Record<string, string> = {}

    const rangesQuery = sheetsList
        .map((sheet: any) => `ranges=${encodeURIComponent("'" + sheet.properties.title + "'!A1:ZZ2500")}`)
        .join("&")

    const batchRes = await fetchSheetsWithTimeout(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${rangesQuery}`,
        { headers: { Authorization: `Bearer ${token}` } },
        45000
    )

    if (!batchRes.ok) {
        const errBody = await batchRes.json().catch(() => ({}))
        const errMsg = errBody?.error?.message || `Erro HTTP ${batchRes.status}`
        throw new Error(errMsg)
    }

    const batchData = await batchRes.json()
    const valueRanges = batchData.valueRanges || []

    valueRanges.forEach((rangeData: any, idx: number) => {
        const title = sheetsList[idx]?.properties?.title || `Aba${idx}`
        const rows = rangeData.values || []
        sheetsResultMap[title] = rowsToCsv(rows)
    })

    const primaryTitle = sheetsList[0]?.properties?.title || "Geral"
    return {
        sheets: sheetsResultMap,
        csvText: sheetsResultMap[primaryTitle] || "",
    }
}
