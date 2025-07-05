import { sendStream, setResponseStatus, setHeader, getQuery } from 'h3';

export default defineEventHandler(async (event) => {
  const { url } = getQuery(event);

  if (!url || typeof url !== 'string') {
    setResponseStatus(event, 400);
    return 'Image URL is required.';
  }

  try {
    const response = await fetch(url);

    if (!response.ok || !response.body) {
      setResponseStatus(event, response.status);
      return `Failed to fetch image: ${response.statusText}`;
    }

    const contentType = response.headers.get('content-type');
    if (contentType) {
      setHeader(event, 'Content-Type', contentType);
    }

    // Use sendStream to pipe the image data directly to the client.
    return sendStream(event, response.body);

  } catch (error) {
    console.error('Error proxying image:', error);
    setResponseStatus(event, 500);
    return 'Failed to fetch image.';
  }
});
