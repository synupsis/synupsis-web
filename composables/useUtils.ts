export const useImageUrl = (url: string | undefined | null): string => {
  if (!url) {
    return ''; // Or return a placeholder image URL
  }
  return `/api/image-proxy/${url}`;
};