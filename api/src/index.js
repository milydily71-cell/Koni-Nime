import express from 'express';

const app = express();
const PORT = Number(process.env.PORT) || 8000;
const REANIME_BASE = (process.env.REANIME_API_BASE || 'https://koni-nime-reanime.onrender.com').replace(/\/+$/, '');
const ANILIST_URL = process.env.ANILIST_API_URL || 'https://graphql.anilist.co';
const TIMEOUT_MS = Math.max(3000, Number(process.env.UPSTREAM_TIMEOUT_MS) || 12000);
const RATE_WINDOW = Math.max(10000, Number(process.env.RATE_LIMIT_WINDOW_MS) || 60000);
const RATE_MAX = Math.max(10, Number(process.env.RATE_LIMIT_MAX) || 120);
const cache = new Map();
const pending = new Map();
const rates = new Map();
const CACHE_LIMIT = 500;

app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = process.env.CORS_ORIGIN || '*';
  if (allowed === '*' || !origin || origin === allowed) res.setHeader('Access-Control-Allow-Origin', allowed === '*' ? '*' : allowed);
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = rates.get(key);
  if (!record || now >= record.resetAt) {
    record = { count: 0, resetAt: now + RATE_WINDOW };
    rates.set(key, record);
  }
  record.count += 1;
  if (record.count > RATE_MAX) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((record.resetAt - now) / 1000))));
    return res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Retry shortly.' } });
  }
  if (rates.size > 5000) for (const [ip, entry] of rates) if (entry.resetAt <= now) rates.delete(ip);
  next();
});
app.use(express.json({ limit: '32kb' }));

export function normalizeAnime(item = {}) {
  const title = item.title && typeof item.title === 'object' ? item.title : {};
  const cover = item.coverImage && typeof item.coverImage === 'object' ? item.coverImage : {};
  const desc = item.description || item.synopsis || item.overview || item.summary || '';
  const clean = value => typeof value === 'string' ? value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").trim() : '';
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  return {
    id: String(first(item.slug, item.id, item.anilistId, item.anilist_id, item.mal_id, '')),
    title: first(typeof item.title === 'string' ? item.title : '', title.english, title.userPreferred, title.romaji, title.native, item.name, item.romajiTitle, 'Untitled anime'),
    image: first(cover.extraLarge, cover.large, item.poster, item.image, item.cover, item.thumbnail, item.posterUrl, cover.extraLarge, cover.large, item.cover_image?.extra_large, item.cover_image?.large, ''),
    banner: first(item.bannerImage, item.banner, item.backdrop, ''),
    description: clean(typeof desc === 'string' ? desc : desc?.english || desc?.romaji || ''),
    type: first(item.format, item.type, 'ANIME'),
    status: first(item.status, item.airingStatus, ''),
    score: first(item.averageScore, item.meanScore, item.rating, item.score, ''),
    genres: Array.isArray(item.genres) ? item.genres.map(value => typeof value === 'string' ? value : value?.name).filter(Boolean) : [],
    episodes: Number(first(item.episodes, item.episodeCount, 0)) || 0,
    year: first(item.seasonYear, item.year, item.releaseYear, null),
    source: item.source || 'unknown',
    raw: item
  };
}

export function episodeEntries(data) {
  const providers = data?.providers || data?.results?.providers || data?.data?.providers || {};
  const episodes = [];
  for (const [providerName, provider] of Object.entries(providers)) {
    for (const [audio, list] of Object.entries(provider?.episodes || {})) {
      if (!Array.isArray(list)) continue;
      for (const ep of list) {
        const number = Number(ep?.number || ep?.episode || 0);
        if (!number) continue;
        episodes.push({ id: String(ep.id || providerName + '-' + number), number, title: ep.title || 'Episode ' + number, provider: providerName, audio, watchPath: typeof ep.id === 'string' && ep.id.startsWith('watch/') ? ep.id : null });
      }
    }
  }
  const seen = new Set();
  return episodes.sort((a, b) => a.number - b.number || a.provider.localeCompare(b.provider)).filter(ep => {
    const key = ep.audio + ':' + ep.number;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeStreams(data) {
  const streams = data?.streams || data?.results?.streams || data?.data?.streams || data?.sources || data?.results?.sources || [];
  if (!Array.isArray(streams)) return [];
  return streams.filter(item => item && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)).map(item => ({
    url: item.url,
    type: String(item.type || (/\.m3u8(?:\?|$)/i.test(item.url) ? 'hls' : 'mp4')).toLowerCase(),
    quality: item.quality || item.label || null,
    provider: item.provider || item.name || null,
    referer: item.referer || item.headers?.Referer || item.headers?.referer || null
  }));
}

export async function cached(key, ttlMs, loader) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const value = await loader();
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error('Upstream returned HTTP ' + response.status);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Upstream request timed out');
    throw error;
  } finally { clearTimeout(timer); }
}
async function reanime(path) { return fetchJson(REANIME_BASE + path); }
async function anilist(query, variables) {
  const result = await fetchJson(ANILIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  if (result.errors?.length) throw new Error(result.errors[0].message || 'AniList GraphQL error');
  return result.data;
}
function unwrap(data) {
  return data?.results?.Media || data?.Media || data?.results?.data || data?.results || data?.data?.Media || data?.data || data?.anime || data;
}
function extractList(data) {
  if (Array.isArray(data)) return data;
  const queue = [data], seen = new Set();
  const keys = ['results', 'media', 'animes', 'anime', 'trending', 'popular', 'latest', 'items', 'list', 'data', 'Page'];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) return node;
    for (const key of keys) {
      const value = node[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return [];
}
function validId(value) { return typeof value === 'string' && value.length > 0 && value.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(value); }
function pageParams(req) {
  return { page: Math.max(1, Math.min(1000, parseInt(req.query.page, 10) || 1)), perPage: Math.max(1, Math.min(50, parseInt(req.query.per_page, 10) || 24)) };
}
function ok(res, results, extra = {}) { return res.json({ success: true, results, ...extra }); }
function bad(res, message) { return res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST', message } }); }
function upstreamError(res, error, message) {
  console.warn('[koni-nime-api]', error?.message || error);
  return res.status(502).json({ success: false, error: { code: 'UPSTREAM_UNAVAILABLE', message, ...(process.env.NODE_ENV === 'production' ? {} : { detail: error?.message }) } });
}
function mediaQuery(sort) {
  return 'query ($page: Int, $perPage: Int, $sort: [MediaSort]) { Page(page: $page, perPage: $perPage) { media(type: ANIME, sort: $sort, isAdult: false) { id idMal title { romaji english native userPreferred } coverImage { extraLarge large } bannerImage description format status episodes averageScore genres seasonYear } } }';
}
async function anilistCatalog(category, page, perPage) {
  const sort = category === 'popular' ? 'POPULARITY_DESC' : category === 'recent' ? 'UPDATED_AT_DESC' : 'TRENDING_DESC';
  const data = await anilist(mediaQuery(sort), { page, perPage, sort: [sort] });
  return (data?.Page?.media || []).map(item => normalizeAnime({ ...item, source: 'anilist' }));
}
async function catalog(category, page, perPage) {
  return cached('catalog:' + category + ':' + page + ':' + perPage, 180000, async () => {
    const limit = Math.min(100, perPage);
    try {
      if (category === 'popular') {
        const data = await reanime('/top?period=week&limit=' + limit);
        return { items: extractList(data).map(item => normalizeAnime({ ...item, source: 'rean' + 'ime' })).filter(item => item.id), provider: 'rean ime'.replace(' ', '') };
      }
      const data = await reanime('/home?limit=' + limit);
      const list = category === 'recent'
        ? (data?.latest_aired ?? data?.latest ?? data?.recent ?? [])
        : (data?.top_weekly ?? data?.top ?? data?.latest_aired ?? []);
      const items = extractList(list).map(item => normalizeAnime({ ...item, source: 'rean' + 'ime' })).filter(item => item.id);
      if (items.length) return { items, provider: 'rean' + 'ime' };
    } catch (error) {
      console.warn('[koni-nime-api] ReAnime catalog failed; using AniList fallback:', error?.message || error);
    }
    return { items: await anilistCatalog(category, page, perPage), provider: 'anilist' };
  });
}
async function searchCatalog(query, page, perPage) {
  return cached('search:' + query.toLowerCase() + ':' + page + ':' + perPage, 180000, async () => {
    try {
      const offset = (page - 1) * perPage;
      const data = await reanime('/search?q=' + encodeURIComponent(query) + '&limit=' + Math.min(100, perPage) + '&offset=' + offset);
      const items = extractList(data).map(item => normalizeAnime({ ...item, source: 'rean' + 'ime' })).filter(item => item.id);
      if (items.length) return { items, provider: 'rean' + 'ime' };
    } catch (error) {
      console.warn('[koni-nime-api] ReAnime search failed; using AniList fallback:', error?.message || error);
    }
    const data = await anilist(
      'query ($search: String, $page: Int, $perPage: Int) { Page(page: $page, perPage: $perPage) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { id idMal title { romaji english native userPreferred } coverImage { extraLarge large } bannerImage description format status episodes averageScore genres seasonYear } } }',
      { search: query, page, perPage }
    );
    return { items: (data?.Page?.media || []).map(item => normalizeAnime({ ...item, source: 'anilist' })), provider: 'anilist' };
  });
}
async function findAniListByTitle(title) {
  const query = String(title || '').trim().slice(0, 120);
  if (!query) return null;
  const data = await anilist(
    'query ($search: String) { Page(page: 1, perPage: 5) { media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { id episodes title { romaji english native userPreferred } } } }',
    { search: query }
  );
  const items = data?.Page?.media || [];
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const wanted = norm(query);
  return items.find(item => [item.title?.english, item.title?.romaji, item.title?.native, item.title?.userPreferred].some(t => norm(t) === wanted)) || items[0] || null;
}
async function animeInfo(id, titleHint = '') {
  return cached('info:' + id, 900000, async () => {
    try {
      const data = await reanime('/info/' + encodeURIComponent(id));
      const item = unwrap(data);
      if (item && typeof item === 'object') {
        const normalized = normalizeAnime({ ...item, id: item.slug || item.id || id, source: 'rean' + 'ime' });
        normalized.episodes = Array.isArray(item.episodes) ? item.episodes.length : Number(item.episodes || 0) || 0;
        if (normalized.title !== 'Untitled anime') return normalized;
      }
    } catch (error) {
      console.warn('[koni-nime-api] ReAnime details failed; using AniList fallback:', error?.message || error);
    }
    // AniList catalog entries have numeric IDs; provider entries may only have slugs.
    let mediaId = /^\d+$/.test(String(id)) ? Number(id) : null;
    if (!mediaId && titleHint) {
      const match = await findAniListByTitle(titleHint);
      if (match?.id) mediaId = Number(match.id);
    }
    if (!mediaId) throw new Error('Could not match this anime title to AniList.');
    const data = await anilist(
      'query ($id: Int) { Media(id: $id, type: ANIME, isAdult: false) { id idMal title { romaji english native userPreferred } coverImage { extraLarge large } bannerImage description format status episodes averageScore genres seasonYear } }',
      { id: mediaId }
    );
    const item = data?.Media;
    if (!item) return null;
    return normalizeAnime({ ...item, source: 'anilist' });
  });
}
async function episodeData(id, titleHint = '') {
  return cached('episodes:' + id + ':' + String(titleHint || '').toLowerCase(), 120000, async () => {
    // Resolve provider slugs to AniList IDs when a title is available.
    let mediaId = /^\d+$/.test(String(id)) ? String(id) : '';
    if (!mediaId && titleHint) {
      try {
        const match = await findAniListByTitle(titleHint);
        if (match?.id) mediaId = String(match.id);
      } catch (error) {
        console.warn('[koni-nime-api] AniList title match failed:', error?.message || error);
      }
    }
    // Prefer Aniweeb's episode list after resolving a numeric AniList ID.
      try {
        const data = await fetchJson('https://api.aniweeb.net/episodes/' + encodeURIComponent(mediaId));
        const episodes = Array.isArray(data?.episodes) ? data.episodes : [];
        if (episodes.length) {
          const normalized = (track) => episodes.filter(ep => ep?.[track] === true).map((ep, index) => ({
            number: Number(ep.number || index + 1),
            title: ep.title || 'Episode ' + Number(ep.number || index + 1),
            id: 'aniweeb-' + mediaId + '-' + Number(ep.number || index + 1)
          })).filter(ep => ep.number > 0);
          const sub = normalized('sub');
          const dub = normalized('dub');
          if (sub.length || dub.length) {
            return { providers: { aniweeb: { episodes: { ...(sub.length ? { sub } : {}), ...(dub.length ? { dub } : {}) } } } };
          }
        }
      } catch (error) {
        console.warn('[koni-nime-api] Aniweeb episode list failed; trying existing providers:', error?.message || error);
      }
    }
    try {
      const data = await reanime('/episodes/' + encodeURIComponent(id));
      const episodes = Array.isArray(data) ? data : data?.episodes || data?.data || [];
      if (Array.isArray(episodes) && episodes.length) {
        return { providers: { reanime: { episodes: { sub: episodes.map((ep, index) => ({
          number: Number(ep.number || ep.episode || ep.episode_number || index + 1),
          title: ep.title || ep.name || 'Episode ' + Number(ep.number || ep.episode || index + 1),
          id: String(ep.id || ep.slug || ep.number || index + 1)
        })) } } } };
      }
    } catch (error) {
      console.warn('[koni-nime-api] ReAnime episodes failed; using AniList episode count:', error?.message || error);
    }
    // AniList supplies episode counts, not playable episode streams. This fallback keeps
    // the episode list available while making no claim that playback sources are resolved.
    if (!mediaId) throw new Error('Could not match this anime title to AniList to retrieve its episode count.');
    const data = await anilist(
      'query ($id: Int) { Media(id: $id, type: ANIME, isAdult: false) { id episodes title { userPreferred romaji english } } }',
      { id: Number(mediaId) }
    );
    const item = data?.Media;
    const count = Math.max(0, Math.min(2000, Number(item?.episodes) || 0));
    if (!count) throw new Error('AniList does not have an episode count for this anime.');
    const title = item.title?.userPreferred || item.title?.romaji || item.title?.english || 'Anime';
    return { providers: { anilist: { episodes: { sub: Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      title: 'Episode ' + (index + 1),
      id: 'anilist-' + mediaId + '-episode-' + (index + 1),
      animeTitle: title,
      metadataOnly: true
    })) } } } };
  });
}
async function resolveSource(id, episode, provider, category) {
  const servers = await reanime('/servers/' + encodeURIComponent(id) + '/' + episode);
  const list = category === 'dub' ? (servers?.dub || []) : (servers?.sub || []);
  if (!list.length) throw new Error('No ' + category + ' servers returned by ReAnime.');
  const selected = list.find(item => String(item.serverName || '').toLowerCase() === String(provider).toLowerCase()) || list[0];
  if (!selected?.dataLink) throw new Error('ReAnime server did not include a dataLink.');
  const stream = await reanime('/stream/from-link?link=' + encodeURIComponent(selected.dataLink));
  if (!stream?.url || !/^https?:\/\//i.test(stream.url)) throw new Error('ReAnime did not return a valid HLS stream URL.');
  return { streams: [{ url: stream.url, type: 'hls', quality: selected.serverName || 'Auto', provider: 'rean' + 'ime' }], subtitles: stream.subtitles || [], intro: stream.intro_chapter || null, outro: stream.outro_chapter || null, videoTitle: stream.video_title || null };
}

app.get('/', (_req, res) => res.json({ name: 'Koni-Nime API', version: '1.0.0', status: 'ok', docs: '/v1/health' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'koni-nime-api', timestamp: new Date().toISOString() }));
app.get('/v1/health', (_req, res) => res.json({ status: 'ok', service: 'koni-nime-api', version: '1.0.0', providers: { metadata: ['rean ime'.replace(' ', ''), 'anilist'], episodeSources: ['aniweeb', 'rean ime'.replace(' ', '')], playback: ['aniweeb-embed'] }, cacheEntries: cache.size, inFlight: pending.size, uptimeSeconds: Math.floor(process.uptime()) }));

async function sendCatalog(category, req, res) {
  const { page, perPage } = pageParams(req);
  try { const result = await catalog(category, page, perPage); return ok(res, result.items, { provider: result.provider, page, perPage }); }
  catch (error) { return upstreamError(res, error, 'Anime catalog sources are unavailable.'); }
}
app.get('/anime/spotlight', (req, res) => sendCatalog('home', req, res));
app.get('/anime/popular', (req, res) => sendCatalog('popular', req, res));
app.get('/anime/recent', (req, res) => sendCatalog('recent', req, res));
app.get('/v1/anime/popular', (req, res) => sendCatalog('popular', req, res));
app.get('/v1/anime/recent', (req, res) => sendCatalog('recent', req, res));

async function sendSearch(req, res) {
  const query = String(req.query.q || req.query.query || '').trim();
  if (!query || query.length > 100) return bad(res, 'Provide a search query between 1 and 100 characters.');
  const { page, perPage } = pageParams(req);
  try { const result = await searchCatalog(query, page, perPage); return ok(res, result.items, { provider: result.provider, page, perPage }); }
  catch (error) { return upstreamError(res, error, 'Anime search providers are unavailable.'); }
}
app.get('/anime/search', sendSearch);
app.get('/v1/anime/search', sendSearch);

async function sendInfo(req, res) {
  if (!validId(req.params.id)) return bad(res, 'Invalid anime ID.');
  try {
    const item = await animeInfo(req.params.id, String(req.query.title || ''));
    if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Anime not found.' } });
    return ok(res, item, { provider: item.source || 'unknown' });
  } catch (error) { return upstreamError(res, error, 'Anime details and synopsis are unavailable.'); }
}
app.get('/anime/info/:id', sendInfo);
app.get('/v1/anime/:id', sendInfo);

async function sendEpisodes(req, res, versioned = false) {
  if (!validId(req.params.id)) return bad(res, 'Invalid anime ID.');
  try {
    const raw = await episodeData(req.params.id, String(req.query.title || ''));
    return versioned ? ok(res, episodeEntries(raw), { animeId: req.params.id, provider: 'rean' + 'ime', raw }) : ok(res, raw, { provider: 'miruro' });
  } catch (error) { return upstreamError(res, error, 'Episode listings are unavailable from the configured provider.'); }
}
app.get('/anime/episodes/:id', (req, res) => sendEpisodes(req, res, false));
app.get('/v1/anime/:id/episodes', (req, res) => sendEpisodes(req, res, true));

async function sendStreams(req, res, animeId) {
  if (!validId(animeId)) return bad(res, 'animeId is required and must be a valid anime ID.');
  const episode = parseInt(req.query.e || req.query.episode, 10);
  if (!Number.isInteger(episode) || episode < 1 || episode > 2000) return bad(res, 'episode must be between 1 and 2000.');
  const category = String(req.query.type || req.query.category || 'sub').toLowerCase();
  const provider = String(req.query.provider || 'kiwi').toLowerCase();
  if (!['sub', 'dub', 'raw'].includes(category) || !/^[a-z0-9_-]{1,40}$/.test(provider)) return bad(res, 'Invalid category or provider.');
  try {
    const data = await resolveSource(animeId, episode, provider, category);
    const streams = normalizeStreams(data);
    return ok(res, { animeId, episode, category, provider, streams, subtitles: data.subtitles || [], intro: data.intro || null, outro: data.outro || null, videoTitle: data.videoTitle || null }, { streams });
  } catch (error) { return upstreamError(res, error, 'Playback sources could not be resolved for this episode.'); }
}
app.get('/anime/extract/:id', (req, res) => sendStreams(req, res, req.params.id));
app.get('/v1/episodes/:id/servers', (req, res) => sendStreams(req, res, req.query.animeId || req.query.anime_id));
app.get('/v1/episodes/:id/stream', (req, res) => sendStreams(req, res, req.query.animeId || req.query.anime_id));

app.use((_req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
app.use((error, _req, res, _next) => {
  console.error('[koni-nime-api]', error?.message || error);
  if (!res.headersSent) res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected API error.' } });
});

export { app };
if (process.env.NODE_ENV !== 'test' && !process.env.NODE_TEST_CONTEXT) app.listen(PORT, '0.0.0.0', () => console.log('Koni-Nime API listening on 0.0.0.0:' + PORT));
