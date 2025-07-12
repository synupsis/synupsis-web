import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url)
  const traktImageUrl = requestUrl.searchParams.get('url')

  if (!traktImageUrl) {
    return new Response('Missing "url" query parameter', { status: 400 })
  }

  // Use the pathname of the Trakt URL to create a unique storage path
  // e.g., https://trakt.tv/images/shows/000/060/184/posters/thumb/93df635730.jpg
  // becomes -> images/shows/000/060/184/posters/thumb/93df635730.jpg
  const imagePath = new URL(traktImageUrl).pathname.substring(1) // remove leading slash
  const storagePath = `trakt-cache/${imagePath}`

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: existingImage } = await supabaseClient
      .storage
      .from('images')
      .download(storagePath)

    if (existingImage) {
      // Cache HIT
      return new Response(existingImage, {
        headers: { 'Content-Type': existingImage.type, 'X-Cache-Status': 'HIT' },
      })
    }
  } catch (error) {
    // Ignore download errors (e.g., file not found) and proceed to fetch
    console.warn(`Cache download error for ${storagePath}:`, error.message)
  }


  // Cache MISS: Fetch from original URL
  const traktRes = await fetch(traktImageUrl)
  if (!traktRes.ok) {
    return new Response(`Failed to fetch image from Trakt: ${traktRes.statusText}`, { status: traktRes.status })
  }

  const imageBlob = await traktRes.blob()

  // Upload to cache
  const { error: uploadError } = await supabaseClient
    .storage
    .from('images')
    .upload(storagePath, imageBlob, {
      cacheControl: '31536000', // Cache for 1 year
      upsert: true,
    })

  if (uploadError) {
    console.error(`Failed to upload image to cache: ${storagePath}`, uploadError)
    // Still return the image to the user even if caching fails
  }

  return new Response(imageBlob, {
    headers: { 'Content-Type': imageBlob.type, 'X-Cache-Status': 'MISS' },
  })
})