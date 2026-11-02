/** A show page address the show routes accept: a readable name, then the Trakt ID they read. */
export function showPath(name: string, traktId: number): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'show';
  return `/shows/${slug}-${traktId}`;
}
