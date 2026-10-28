import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSeasonCasts, toSeasonCast } from '../../server/services/trakt-season-cast.ts';
import { visibleCastCharacters } from '../../lib/show-characters.ts';

const member = (character, actor, episodes, id) => ({
  characters: [character], episode_count: episodes,
  person: { name: actor, ids: { trakt: id }, images: { headshot: [`walter-r2.trakt.tv/images/people/${id}.jpg`] } },
});

test('a season cast keeps named characters and leaves extras out', () => {
  const cast = toSeasonCast({ cast: [
    member('Jerry Seinfeld', 'Jerry Seinfeld', 5, 1),
    member('Ruthie Cohen (uncredited)', 'Ruth Cohen', 3, 2),
    member('Man on Sidewalk', 'Someone', 4, 3),
    member('Waitress #2', 'Someone Else', 2, 4),
    member('Himself', 'A Celebrity', 1, 5),
  ] });
  assert.deepEqual(cast.map(item => item.name), ['Jerry Seinfeld', 'Ruthie Cohen']);
  assert.equal(cast[0].actorImageUrl, 'https://walter-r2.trakt.tv/images/people/1.jpg');
  assert.deepEqual(toSeasonCast(null), []);
});

test('characters are merged across seasons and shown up to the viewer’s season', () => {
  const characters = mergeSeasonCasts([
    { season: 1, cast: toSeasonCast({ cast: [member('Jerry', 'J', 5, 1), member('George', 'G', 5, 2), member('Elaine', 'E', 5, 3), member('Kramer', 'K', 5, 4)] }) },
    { season: 2, cast: toSeasonCast({ cast: [member('Jerry', 'J', 12, 1), member('Newman', 'N', 3, 6), member('Guest', 'X', 1, 7)] }) },
    { season: 4, cast: toSeasonCast({ cast: [member('Susan Ross', 'S', 12, 8)] }) },
  ]);
  assert.deepEqual(characters.find(item => item.name === 'Jerry')?.episodesBySeason, { 1: 5, 2: 12 });

  const throughSeason1 = visibleCastCharacters(characters, 1);
  assert.deepEqual(throughSeason1.map(item => item.name), ['Elaine', 'George', 'Jerry', 'Kramer']);

  const throughSeason2 = visibleCastCharacters(characters, 2);
  assert.equal(throughSeason2[0].name, 'Jerry');
  assert.equal(throughSeason2[0].episodeCount, 17);
  assert.ok(throughSeason2.some(item => item.name === 'Newman'));
  assert.ok(!throughSeason2.some(item => item.name === 'Guest'), 'one-episode guests stay out');
  assert.ok(!throughSeason2.some(item => item.name === 'Susan Ross'), 'later seasons stay out');

  assert.ok(visibleCastCharacters(characters, null).some(item => item.name === 'Susan Ross'));
  assert.deepEqual(visibleCastCharacters(characters, 0), []);
});
