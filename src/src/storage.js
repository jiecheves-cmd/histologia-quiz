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
          key: storeKey,
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
        .eq('key', storeKey)
        .maybeSingle()
      if (error || !data) return def
      return JSON.parse(data.value)
    } catch (e) {
      return def
    }
  }

  return { save, load }
}
