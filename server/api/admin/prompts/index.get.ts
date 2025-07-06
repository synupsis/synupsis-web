import { serverSupabaseClient } from '#supabase/server'
import { Database } from '~/types/database.types'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event)

  const { data, error } = await client
    .from('prompts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching prompts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Error fetching prompts' })
  }

  return data
})
