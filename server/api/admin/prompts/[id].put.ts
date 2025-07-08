import { serverSupabaseClient } from '#supabase/server'
import { Database } from '~/types/database.types'

export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient<Database>(event)
  const body = await readBody(event)
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing prompt ID' })
  }

  const { data, error } = await client
    .from('prompts')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating prompt:', error)
    throw createError({ statusCode: 500, statusMessage: 'Error updating prompt' })
  }

  return data
})
