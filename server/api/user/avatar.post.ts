import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server';
import type { Database } from '~/types/database.types';

export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event);
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const supabase = await serverSupabaseClient<Database>(event);
  const file = await readMultipartFormData(event);

  if (!file || file.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' });
  }

  const uploadedFile = file[0];
  if (!uploadedFile) {
    throw createError({ statusCode: 400, statusMessage: 'No file provided' });
  }

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(`${user.sub}/${Date.now()}`, uploadedFile.data, {
      contentType: uploadedFile.type,
      upsert: true,
    });

  if (error) {
    console.error('Error uploading avatar:', error);
    throw createError({ statusCode: 500, statusMessage: 'Could not upload avatar' });
  }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(data.path);

  await supabase.auth.updateUser({
    data: {
      avatar_url: publicUrl,
    },
  });

  return { avatarUrl: publicUrl };
});
