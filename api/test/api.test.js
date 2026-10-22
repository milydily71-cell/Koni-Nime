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
  assert.deepEqual(list.map(ep => ep.audio + ':' + ep.number), ['sub:1', 'sub:2', 'dub:1']);
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

test('health endpoint works and invalid search requests are rejected', async () => {
  const server = app.listen(0, '127.0.0.1');
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const health = await fetch(base + '/v1/health');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'koni-nime-api');
    const invalid = await fetch(base + '/v1/anime/search');
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_REQUEST');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
