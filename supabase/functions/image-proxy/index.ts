import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const imagePath = url.pathname.split('trakt.tv/images/')[1]
  const storagePath = `trakt-cache/${imagePath}`
  const traktImageUrl = url.pathname.replace('/image-proxy/', '')

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: existingImage, error: downloadError } = await supabaseClient
    .storage
    .from('images')
    .download(storagePath)

  if (existingImage) {
    // Cache HIT
    return new Response(existingImage, {
      headers: { 'Content-Type': existingImage.type, 'X-Cache-Status': 'HIT' },
    })
  }

  // 2. Cache MISS
  const traktRes = await fetch(traktImageUrl)
  if (!traktRes.ok) {
    return new Response('Image not found on Trakt', { status: 404 })
  }

  const imageBlob = await traktRes.blob()

  await supabaseClient
    .storage
    .from('images')
    .upload(storagePath, imageBlob, {
      cacheControl: '31536000',
      upsert: true,
    })

  return new Response(imageBlob, {
    headers: { 'Content-Type': imageBlob.type, 'X-Cache-Status': 'MISS' },
  })
})
