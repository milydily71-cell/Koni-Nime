import test from 'node:test';
import assert from 'node:assert/strict';
import { app, normalizeAnime, episodeEntries, normalizeStreams, cached } from '../src/index.js';

test('normalizes title, synopsis, genres and episode count', () => {
  const anime = normalizeAnime({ id: 20, title: { english: 'Naruto', romaji: 'NARUTO' }, description: 'Ninja<br>story', coverImage: { large: 'https://example.test/poster.jpg' }, genres: ['Action', { name: 'Adventure' }], episodes: 220 });
  assert.equal(anime.id, '20');
  assert.equal(anime.title, 'Naruto');
  assert.equal(anime.description, 'Ninja\nstory');
  assert.deepEqual(anime.genres, ['Action', 'Adventure']);
  assert.equal(anime.episodes, 220);
});

test('deduplicates episode numbers within each audio category', () => {
  const list = episodeEntries({ providers: { alpha: { episodes: { sub: [{ number: 1, id: 'watch/alpha/1' }, { number: 2 }] } }, beta: { episodes: { sub: [{ number: 1 }, { number: 2 }], dub: [{ number: 1 }] } } } });
  assert.deepEqual(list.map(ep => ep.audio + ':' + ep.number), ['sub:1', 'dub:1', 'sub:2']);
});

test('normalizes ReAnime snake-case metadata and slugs', () => {
  const anime = normalizeAnime({ slug: 'one-piece-xamk74', title: 'One Piece', cover_image: { large: 'https://example.test/one-piece.jpg' }, description: 'Pirates', source: 'rean' + 'ime' });
  assert.equal(anime.id, 'one-piece-xamk74');
  assert.equal(anime.title, 'One Piece');
  assert.equal(anime.image, 'https://example.test/one-piece.jpg');
  assert.equal(anime.description, 'Pirates');
});

test('filters unsafe or invalid stream URLs', () => {
  const list = normalizeStreams({ streams: [{ url: 'https://cdn.example/video.m3u8' }, { url: 'javascript:alert(1)' }, { url: 'bad url' }] });
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'hls');
});

test('coalesces concurrent cache misses', async () => {
  const key = 'test-' + Date.now();
  let calls = 0;
  const load = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return { value: 7 }; };
  const results = await Promise.all([cached(key, 1000, load), cached(key, 1000, load)]);
  assert.equal(calls, 1);
  assert.deepEqual(results, [{ value: 7 }, { value: 7 }]);
});
