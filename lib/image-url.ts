import type { CharacterImageProvider } from '~/types/show-character.types';

/** Routes remote artwork through the Supabase image proxy (see `routeRules` in nuxt.config.ts). */
export function proxiedImageUrl(url: string | null | undefined): string {
  return url ? `/api/image-proxy/?url=${encodeURIComponent(url)}` : '';
}

/**
 * TVmaze portraits go through the Nitro proxy (server/api/images/proxy.get.ts),
 * which only trusts TVmaze and Trakt hosts. Other providers use the Supabase proxy.
 */
export function characterImageUrl(
  profile: { imageUrl: string | null; imageProvider: CharacterImageProvider | null } | null | undefined,
): string {
  const imageUrl = profile?.imageUrl;
  if (!imageUrl) return '';
  if (profile.imageProvider === 'tvmaze') {
    return `/api/images/proxy?url=${encodeURIComponent(imageUrl)}`;
  }
  return proxiedImageUrl(imageUrl);
}
