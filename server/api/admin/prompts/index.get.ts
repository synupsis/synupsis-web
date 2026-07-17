import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { requireAdminUser } from '~/server/utils/require-admin'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const client = await serverSupabaseClient<Database>(event)

  const { data, error } = await client
    .from('prompts')
    .select('*, recaps_count:recap(count)') // Select all prompt fields and count related recaps
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching prompts:', error)
    throw createError({ statusCode: 500, statusMessage: 'Error fetching prompts' })
  }

  return data
})
