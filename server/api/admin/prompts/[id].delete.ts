import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { requireAdminUser } from '~/server/utils/require-admin'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const client = await serverSupabaseClient<Database>(event)
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing prompt ID' })
  }

  const { error } = await client
    .from('prompts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting prompt:', error)
    throw createError({ statusCode: 500, statusMessage: 'Error deleting prompt' })
  }

  return { success: true }
})
