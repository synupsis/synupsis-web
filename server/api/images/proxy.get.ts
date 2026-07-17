import { sendStream, setResponseStatus, setHeader, getQuery } from 'h3';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function parseTrustedImageUrl(rawUrl: string): string {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid image URL.' });
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const isTrustedHost = hostname === 'trakt.tv' || hostname.endsWith('.trakt.tv');

  if (parsedUrl.protocol !== 'https:' || !isTrustedHost) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported image host.' });
  }

  return parsedUrl.toString();
}

type H3LikeError = {
  statusCode?: number;
  statusMessage?: string;
};

export default defineEventHandler(async (event) => {
  const { url } = getQuery(event);

  if (!url || typeof url !== 'string') {
    setResponseStatus(event, 400);
    return 'Image URL is required.';
  }

  try {
    const trustedImageUrl = parseTrustedImageUrl(url);
    const response = await fetch(trustedImageUrl);

    if (!response.ok || !response.body) {
      setResponseStatus(event, response.status);
      return `Failed to fetch image: ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('image/')) {
      setResponseStatus(event, 415);
      return 'Unsupported content type.';
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      setResponseStatus(event, 413);
      return 'Image too large.';
    }

    setHeader(event, 'Content-Type', contentType);
    setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=86400');

    return sendStream(event, response.body);
  } catch (error) {
    const h3Error = error as H3LikeError | undefined;
    if (h3Error && typeof h3Error === 'object' && 'statusCode' in h3Error) {
      const statusCode = typeof h3Error.statusCode === 'number' ? h3Error.statusCode : 400;
      setResponseStatus(event, statusCode);
      return typeof h3Error.statusMessage === 'string' ? h3Error.statusMessage : 'Invalid image URL.';
    }

    console.error('Error proxying image:', error);
    setResponseStatus(event, 500);
    return 'Failed to fetch image.';
  }
});
