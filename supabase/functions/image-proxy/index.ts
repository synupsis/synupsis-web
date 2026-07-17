import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024

function parseTrustedImageUrl(rawUrl: string): URL {
  const parsedUrl = new URL(rawUrl)
  const hostname = parsedUrl.hostname.toLowerCase()
  const isTrustedHost = hostname === 'trakt.tv' || hostname.endsWith('.trakt.tv')

  if (parsedUrl.protocol !== 'https:' || !isTrustedHost) {
    throw new Error('Unsupported image host')
  }

  return parsedUrl
}

Deno.serve(async (req) => {
  const requestUrl = new URL(req.url)
  const rawImageUrl = requestUrl.searchParams.get('url')

  if (!rawImageUrl) {
    return new Response('Missing "url" query parameter', { status: 400 })
  }

  let imageUrl: URL

  try {
    imageUrl = parseTrustedImageUrl(rawImageUrl)
  } catch {
    return new Response('Unsupported image host', { status: 400 })
  }

  const imagePath = imageUrl.pathname.replace(/^\/+/, '')
  const storagePath = `trakt-cache/${imageUrl.hostname}/${imagePath}`

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { data: existingImage } = await supabaseClient
      .storage
      .from('images')
      .download(storagePath)

    if (existingImage && existingImage.type.startsWith('image/')) {
      // Cache HIT
      return new Response(existingImage, {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Type': existingImage.type,
          'X-Cache-Status': 'HIT',
        },
      })
    }
  } catch (error) {
    // Ignore download errors (e.g., file not found) and proceed to fetch
    console.warn(`Cache download error for ${storagePath}:`, error.message)
  }


  // Cache MISS: Fetch from original URL
  const traktRes = await fetch(imageUrl.toString())
  if (!traktRes.ok) {
    return new Response(`Failed to fetch image from Trakt: ${traktRes.statusText}`, { status: traktRes.status })
  }

  const contentType = traktRes.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('image/')) {
    return new Response('Unsupported content type', { status: 415 })
  }

  const contentLength = Number(traktRes.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    return new Response('Image too large', { status: 413 })
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
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': imageBlob.type,
      'X-Cache-Status': 'MISS',
    },
  })
})
