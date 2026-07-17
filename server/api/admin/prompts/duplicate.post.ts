import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { requireAdminUser } from '~/server/utils/require-admin'

export default defineEventHandler(async (event) => {
  await requireAdminUser(event)
  const client = await serverSupabaseClient<Database>(event)
  const { id } = await readBody(event)

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Missing prompt ID' })
  }

  // 1. Fetch the original prompt
  const { data: original, error: fetchError } = await client
    .from('prompts')
    .select('name, content')
    .eq('id', id)
    .single()

  if (fetchError) {
    console.error('Error fetching prompt to duplicate:', fetchError)
    throw createError({ statusCode: 500, statusMessage: 'Error fetching prompt to duplicate' })
  }

  // 2. Create the new prompt
  const { data: duplicated, error: insertError } = await client
    .from('prompts')
    .insert({
      name: `${original.name} (copy)`,
      content: original.content,
      is_active: false, // Duplicated prompts are never active by default
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating duplicated prompt:', insertError)
    throw createError({ statusCode: 500, statusMessage: 'Error creating duplicated prompt' })
  }

  return duplicated
})
