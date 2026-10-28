import assert from 'node:assert/strict';
import test from 'node:test';
import { editableSlideText, recapSlideContext } from '../../lib/recap-slide-text.ts';

const group = {
  kind: 'moment-group',
  episodeNumber: 3,
  heading: 'Meanwhile',
  items: [
    { text: 'Jerry asks George for help.', location: 'The diner', characters: [{ name: 'Jerry', initials: 'J', imageUrl: null }] },
  ],
};
const changes = {
  kind: 'changes', episodeNumber: 3, deaths: [], situations: [], questions: ['Will Kramer find out?'], nextEpisode: null,
};

test('generated texts of a slide can be corrected by their path', () => {
  assert.equal(editableSlideText(group, 'items.0.text'), 'Jerry asks George for help.');
  assert.equal(editableSlideText(group, 'items.0.location'), 'The diner');
  assert.equal(editableSlideText(changes, 'questions.0'), 'Will Kramer find out?');
});

test('catalog data and fixed labels cannot be corrected', () => {
  const chapter = { kind: 'chapter', episodeNumber: 3, episodeTitle: 'The Contest', headline: 'Jerry bets with George.', locations: [], decisiveCount: 1, otherCount: 0 };
  const cover = { kind: 'cover', title: 'Seinfeld', subtitle: 'Season 4', logline: 'Four friends and a pilot.', episodeCount: 24 };
  assert.equal(editableSlideText(chapter, 'episodeTitle'), null);
  assert.equal(editableSlideText(chapter, 'headline'), 'Jerry bets with George.');
  assert.equal(editableSlideText(group, 'heading'), null);
  assert.equal(editableSlideText(cover, 'title'), null);
  assert.equal(editableSlideText(cover, 'logline'), 'Four friends and a pilot.');
  assert.equal(editableSlideText({ kind: 'ending-deaths', deaths: [{ character: { name: 'Susan' }, episodeNumber: 3 }] }, 'deaths.0.character.name'), null);
});

test('names, numbers, missing entries and odd paths cannot be corrected', () => {
  assert.equal(editableSlideText(group, 'items.0.characters.0.name'), null);
  assert.equal(editableSlideText(group, 'episodeNumber'), null);
  assert.equal(editableSlideText(group, 'kind'), null);
  assert.equal(editableSlideText(group, 'items.4.text'), null);
  assert.equal(editableSlideText(group, '__proto__'), null);
  assert.equal(editableSlideText(group, 'items.0.constructor'), null);
  assert.equal(editableSlideText(changes, 'situations.0'), null);
  assert.equal(editableSlideText(null, 'heading'), null);
});

test('the slide context keeps its kind, episode and first text', () => {
  assert.deepEqual(recapSlideContext(group), { kind: 'moment-group', episodeNumber: 3, summary: 'Meanwhile' });
  assert.deepEqual(recapSlideContext(null), { kind: null, episodeNumber: null, summary: '' });
});
