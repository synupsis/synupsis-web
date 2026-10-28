/** Routes remote TVmaze and Trakt artwork through the image proxy (server/api/image-proxy.get.ts). */
export function proxiedImageUrl(url: string | null | undefined): string {
  return url ? `/api/image-proxy/?url=${encodeURIComponent(url)}` : '';
}
