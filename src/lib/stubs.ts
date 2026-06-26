/**
 * stubs.ts → Supabase Implementation
 *
 * Antes era um conjunto de stubs vazios simulando Firebase.
 * Agora implementa todas as funções usando Supabase como backend real.
 */
import { supabase, signInWithGoogle as _signInWithGoogle, signOut as _signOut, getGoogleAccessToken } from './supabase'
import type { Estagiario, ProductivityEntry } from './types'

// =====================================================
// Mapeamento de nomes de coleções Firebase → tabelas Supabase
// =====================================================
const TABLE_MAP: Record<string, string> = {
  'estagiarios': 'estagiarios',
  'productivityEntries': 'productivity_entries',
  'productivity_entries': 'productivity_entries',
  'settings': 'settings',
}

const resolveTable = (name: string): string => TABLE_MAP[name] ?? name


type DocRef = { table: string; id: string }
type CollectionRef = { table: string }
type QueryRef = { table: string; filters: Array<{ column: string; value: any }> }

// =====================================================
// Referências (compatibilidade com API Firebase-like)
// =====================================================

export const db = {} // placeholder de compatibilidade

export const doc = (dbRef: any, table: string, id: string): DocRef => ({
  table: resolveTable(table),
  id,
})

export const collection = (dbRef: any, table: string): CollectionRef => ({
  table: resolveTable(table),
})

export const query = (collRef: CollectionRef, ...conditions: any[]): QueryRef => ({
  table: resolveTable(collRef.table),
  filters: conditions.filter(Boolean),
})

export const where = (column: string, op: string, value: any) => ({
  column,
  op,
  value,
})

// =====================================================
// Operações de leitura
// =====================================================

export const getDocs = async (ref: CollectionRef | QueryRef): Promise<{
  docs: any[]
  forEach: (fn: (doc: { id: string; data: () => any }) => void) => void
  empty: boolean
}> => {
  const table = (ref as any).table
  const filters = (ref as QueryRef).filters || []

  const rows: any[] = []
  let hasMore = true
  let offset = 0
  const limit = 1000

  while (hasMore) {
    let q = supabase.from(table).select('*')
    if (table === 'productivity_entries') {
      q = q.range(offset, offset + limit - 1) as any
    }
    for (const f of filters) {
      if (f?.column && f?.value !== undefined) {
        q = q.eq(f.column, f.value) as any
      }
    }

    const { data, error } = await q

    if (error) {
      console.error(`Erro ao buscar ${table}:`, error)
      return { docs: [], forEach: () => {}, empty: true }
    }

    if (data && data.length > 0) {
      rows.push(...data)
      if (table === 'productivity_entries' && data.length === limit) {
        offset += limit
      } else {
        hasMore = false
      }
    } else {
      hasMore = false
    }
  }
  const docs = rows.map((row: any) => ({
    id: row.id,
    data: () => {
      const { id, ...rest } = row
      // Normalizar campos snake_case → camelCase para compatibilidade
      if (table === 'estagiarios') {
        return {
          name: rest.name,
          role: rest.role,
          dailyGoal: rest.daily_goal,
          matricula: rest.matricula,
          ...rest,
        }
      }
      if (table === 'productivity_entries') {
        return {
          estagiarioId: rest.estagiario_id,
          date: rest.date,
          count: rest.count,
          typeBreakdown: rest.type_breakdown ?? {},
          ...rest,
        }
      }
      return rest
    },
  }))

  return {
    docs,
    forEach: (fn) => docs.forEach(fn),
    empty: docs.length === 0,
  }
}

export const getDoc = async (ref: DocRef): Promise<{
  exists: () => boolean
  data: () => any
}> => {
  // A tabela settings usa 'key' como PK, não 'id'
  const pkColumn = ref.table === 'settings' ? 'key' : 'id'

  const { data, error } = await supabase
    .from(ref.table)
    .select('*')
    .eq(pkColumn, ref.id)
    .maybeSingle()
  if (error || !data) {
    return { exists: () => false, data: () => ({}) }
  }

  return {
    exists: () => true,
    data: () => {
      if (ref.table === 'settings') {
        // Retorna o conteúdo do JSONB value diretamente
        return data.value ?? {}
      }
      const { id, ...rest } = data
      return rest
    },
  }
}


// =====================================================
// Operações de escrita
// =====================================================

const mapEstagiarioToRow = (data: Partial<Estagiario>) => ({
  name: data.name,
  role: data.role ?? 'graduacao',
  daily_goal: data.dailyGoal ?? 25,
  matricula: data.matricula ?? '',
  updated_at: new Date().toISOString(),
})

const mapEntryToRow = (data: Partial<ProductivityEntry>) => ({
  estagiario_id: data.estagiarioId,
  date: data.date,
  count: data.count ?? 0,
  type_breakdown: data.typeBreakdown ?? {},
})

export const setDoc = async (ref: DocRef, data: any, options?: any): Promise<void> => {
  const merge = options?.merge ?? false

  if (ref.table === 'settings') {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: ref.id, value: data, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) console.error('Erro ao salvar settings:', error)
    return
  }

  const row: any = { id: ref.id }
  if (ref.table === 'estagiarios') Object.assign(row, mapEstagiarioToRow(data))
  if (ref.table === 'productivity_entries') Object.assign(row, mapEntryToRow(data))

  const { error } = await supabase.from(ref.table).upsert(row, { onConflict: 'id' })
  if (error) console.error(`Erro ao salvar ${ref.table}:`, error)
}

export const addDoc = async (collRef: CollectionRef, data: any): Promise<{ id: string }> => {
  const row: any = {}

  if (collRef.table === 'estagiarios') {
    row.id = data.id
    Object.assign(row, mapEstagiarioToRow(data))
  }

  if (collRef.table === 'productivity_entries') {
    Object.assign(row, mapEntryToRow(data))
  }

  const { data: inserted, error } = await supabase
    .from(collRef.table)
    .insert(row)
    .select('id')
    .single()

  if (error) {
    console.error(`Erro ao inserir em ${collRef.table}:`, error)
    return { id: '' }
  }

  return { id: inserted?.id ?? '' }
}

export const updateDoc = async (ref: DocRef, data: any): Promise<void> => {
  if (ref.table === 'settings') {
    const { data: existing } = await supabase
      .from('settings')
      .select('value')
      .eq('key', ref.id)
      .maybeSingle()
    const merged = { ...(existing?.value ?? {}), ...data }
    const { error } = await supabase
      .from('settings')
      .upsert({ key: ref.id, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (error) console.error('Erro ao atualizar settings:', error)
    return
  }

  const updates: any = { updated_at: new Date().toISOString() }
  if (data.name !== undefined) updates.name = data.name
  if (data.role !== undefined) updates.role = data.role
  if (data.dailyGoal !== undefined) updates.daily_goal = data.dailyGoal
  if (data.matricula !== undefined) updates.matricula = data.matricula
  if (data.count !== undefined) updates.count = data.count

  const { error } = await supabase.from(ref.table).update(updates).eq('id', ref.id)
  if (error) console.error(`Erro ao atualizar ${ref.table}:`, error)
}

export const deleteDoc = async (ref: DocRef): Promise<void> => {
  const { error } = await supabase.from(ref.table).delete().eq('id', ref.id)
  if (error) console.error(`Erro ao deletar de ${ref.table}:`, error)
}

// =====================================================
// Batch Write (para sync em massa da planilha)
// =====================================================

export const writeBatch = (_db: any) => {
  const ops: Array<() => Promise<void>> = []

  return {
    set: (ref: DocRef, data: any, options?: any) => {
      ops.push(() => setDoc(ref, data, options))
    },
    update: (ref: DocRef, data: any) => {
      ops.push(() => updateDoc(ref, data))
    },
    delete: (ref: DocRef) => {
      ops.push(() => deleteDoc(ref))
    },
    commit: async () => {
      // Executa em paralelo em grupos de 20 para não sobrecarregar
      for (let i = 0; i < ops.length; i += 20) {
        await Promise.all(ops.slice(i, i + 20).map((fn) => fn()))
      }
    },
  }
}

// =====================================================
// Upsert em massa otimizado (usado pelo sync da planilha)
// =====================================================

export const batchUpsertEstagiarios = async (items: Estagiario[]): Promise<void> => {
  if (!items.length) return
  const rows = items.map((e) => ({
    id: e.id,
    name: e.name,
    role: e.role ?? 'graduacao',
    daily_goal: e.dailyGoal ?? 25,
    matricula: e.matricula ?? '',
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('estagiarios')
    .upsert(rows, { onConflict: 'id' })

  if (error) console.error('Erro no batch upsert de estagiarios:', error)
}

export const batchUpsertEntries = async (items: Omit<ProductivityEntry, 'id'>[]): Promise<void> => {
  if (!items.length) return
  const rows = items.map((e) => ({
    estagiario_id: e.estagiarioId,
    date: e.date,
    count: e.count,
    type_breakdown: e.typeBreakdown ?? {},
  }))

  // Upsert em grupos de 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase
      .from('productivity_entries')
      .upsert(chunk, { onConflict: 'estagiario_id,date' })

    if (error) console.error('Erro no batch upsert de entries:', error)
  }
}

// =====================================================
// Autenticação Google
// =====================================================

export const googleSignIn = async (): Promise<{ user: any; accessToken: string } | null> => {
  await _signInWithGoogle()
  return null // redirect flow — a sessão é recuperada no retorno
}

export const logout = async (): Promise<void> => {
  localStorage.removeItem('google_provider_token')
  await _signOut()
}

export const initAuth = (
  onLogin: (user: any, token: string | null) => void,
  onLogout: () => void
): (() => void) => {
  // Verificar sessão existente
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user) {
      if (session.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token)
      }
      const token = session.provider_token ?? localStorage.getItem('google_provider_token') ?? null
      onLogin(session.user, token)
    } else {
      onLogout()
    }
  })

  // Escutar mudanças de autenticação
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) {
      if (session.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token)
      }
      const token = session.provider_token ?? localStorage.getItem('google_provider_token') ?? null
      onLogin(session.user, token)
    } else {
      if (event === 'SIGNED_OUT') {
        localStorage.removeItem('google_provider_token')
      }
      onLogout()
    }
  })

  return () => subscription.unsubscribe()
}

export const getAccessToken = async (): Promise<string | null> => {
  return getGoogleAccessToken()
}

export const seedDatabaseIfEmpty = async (): Promise<void> => {
  // Não é mais necessário com Supabase
}

// =====================================================
// Realtime Subscriptions
// =====================================================

export const subscribeToEstagiarios = (
  onInsertOrUpdate: (record: Estagiario) => void,
  onDelete: (id: string) => void
) => {
  const channel = supabase
    .channel('estagiarios-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'estagiarios' },
      (payload) => {
        const r = payload.new as any
        onInsertOrUpdate({
          id: r.id,
          name: r.name,
          role: r.role,
          dailyGoal: r.daily_goal,
          matricula: r.matricula,
        })
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'estagiarios' },
      (payload) => {
        const r = payload.new as any
        onInsertOrUpdate({
          id: r.id,
          name: r.name,
          role: r.role,
          dailyGoal: r.daily_goal,
          matricula: r.matricula,
        })
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'estagiarios' },
      (payload) => {
        onDelete((payload.old as any).id)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

export const subscribeToEntries = (
  onInsertOrUpdate: (record: ProductivityEntry) => void,
  onDelete: (id: string) => void
) => {
  const channel = supabase
    .channel('entries-changes')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'productivity_entries' },
      (payload) => {
        const r = payload.new as any
        onInsertOrUpdate({
          id: r.id,
          estagiarioId: r.estagiario_id,
          date: r.date,
          count: r.count,
        })
      }
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'productivity_entries' },
      (payload) => {
        const r = payload.new as any
        onInsertOrUpdate({
          id: r.id,
          estagiarioId: r.estagiario_id,
          date: r.date,
          count: r.count,
        })
      }
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'productivity_entries' },
      (payload) => {
        onDelete((payload.old as any).id)
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}

export const subscribeToSettings = (
  onUpdate: (key: string, value: any) => void
) => {
  const channel = supabase
    .channel('settings-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'settings' },
      (payload) => {
        const r = payload.new as any
        if (r && r.key) {
          onUpdate(r.key, r.value)
        }
      }
    )
    .subscribe()

  return () => supabase.removeChannel(channel)
}
