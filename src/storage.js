import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export function useStorage() {
  const save = async (key, value, shared = false) => {
    try {
      const storeKey = shared ? 'shared__' + key : 'private__' + key
      const { error } = await supabase
        .from('histo_store')
        .upsert({
          storage_key: storeKey,
          value: JSON.stringify(value),
          shared,
          updated_at: new Date().toISOString()
        })
      if (error) console.error('Storage save error:', error)
    } catch (e) {
      console.error('Storage save exception:', e)
    }
  }

  const load = async (key, def, shared = false) => {
    try {
      const storeKey = shared ? 'shared__' + key : 'private__' + key
      const { data, error } = await supabase
        .from('histo_store')
        .select('value')
        .eq('storage_key', storeKey)
        .maybeSingle()
      if (error || !data) return def
      return JSON.parse(data.value)
    } catch (e) {
      return def
    }
  }

  const list = async (prefix, shared = false) => {
    try {
      const storePrefix = shared ? 'shared__' + prefix : 'private__' + prefix
      const { data, error } = await supabase
        .from('histo_store')
        .select('storage_key,value')
        .like('storage_key', storePrefix + '%')
      if (error || !data) return []
      return data.map(row => ({
        key: row.storage_key.slice((shared ? 'shared__' : 'private__').length),
        value: JSON.parse(row.value)
      }))
    } catch (e) {
      return []
    }
  }

  return { save, load, list }
}
