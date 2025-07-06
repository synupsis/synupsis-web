import { serverSupabaseClient } from '#supabase/server'
import { Database } from '~/types/database.types'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event)
  const body = await readBody(event)

  const { data, error } = await client
    .from('prompts')
    .insert(body)
    .select()
    .single()

  if (error) {
    console.error('Error creating prompt:', error)
    throw createError({ statusCode: 500, statusMessage: 'Error creating prompt' })
  }

  return data
})
