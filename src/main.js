import Hls from 'hls.js';
import './styles.css';

const DEFAULT_API = 'https://api.tatakai.me';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { items: [], category: 'home', query: '', selected: null, episodes: [], activeEpisode: null, hls: null, busy: false };
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const library = () => read('koni-library', []);
const history = () => read('koni-history', []);
const apiBase = () => ($('#api-base')?.value || read('koni-api-base', DEFAULT_API)).trim().replace(/\/+$/, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick = (obj, keys, fallback = '') => { for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k]; return fallback; };
const normalize = item => ({
  id: String(pick(item, ['id','animeId','slug','mal_id','url'], pick(item, ['title','name'], 'unknown'))),
  title: pick(item, ['title','name','englishTitle','japaneseTitle'], 'Untitled anime'),
  image: pick(item, ['poster','image','cover','coverImage','thumbnail','img','posterUrl'], ''),
  description: pick(item, ['description','synopsis','overview'], 'No synopsis is available for this title yet.'),
  type: pick(item, ['type','format'], 'ANIME'),
  status: pick(item, ['status','airingStatus'], ''),
  score: pick(item, ['rating','score','averageScore'], ''),
  genres: Array.isArray(item?.genres) ? item.genres.map(g => typeof g === 'string' ? g : g.name).filter(Boolean) : [],
  raw: item
});
async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 14000);
  try {
    const response = await fetch(apiBase() + path, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) throw new Error(response.status === 429 ? 'The catalog is busy. Please wait a moment and try again.' : `Catalog request failed (${response.status}).`);
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The catalog took too long to respond. Please try again.');
    throw error;
  } finally { clearTimeout(timer); }
}
function extractList(data) {
  if (Array.isArray(data)) return data;
  for (const key of ['results','animes','anime','data','trending','popular','latest','episodes']) {
    if (Array.isArray(data?.[key])) return data[key];
    if (Array.isArray(data?.data?.[key])) return data.data[key];
  }
  return [];
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3000); }
function setStatus(message) { $('#status-line').textContent = message; }
function showView(view) {
  $('#trending-section').hidden = !['home','search'].includes(view);
  $('#detail-section').hidden = view !== 'detail';
  $('#library-section').hidden = view !== 'library';
  $('#player-section').hidden = view !== 'player';
  $('#search-panel').hidden = view !== 'search';
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === view || (view === 'detail' && el.dataset.nav === 'home')));
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function card(item, index = 0) {
  const a = normalize(item);
  const safeImage = a.image && /^https?:\/\//i.test(a.image) ? a.image : '';
  const saved = library().some(x => normalize(x).id === a.id);
  return `<button class="anime-card" data-anime-index="${index}" aria-label="View ${esc(a.title)}">
    <span class="poster-wrap">${safeImage ? `<img loading="lazy" src="${esc(safeImage)}" alt="" onerror="this.style.display='none'">` : ''}<span class="poster-placeholder">✦</span><span class="poster-overlay"></span><span class="card-score">${a.score ? '★ ' + esc(a.score) : 'KONI PICK'}</span><span class="quick-save ${saved?'saved':''}" data-save-id="${esc(a.id)}" aria-label="Save to library">${saved?'♥':'♡'}</span></span>
    <span class="card-title">${esc(a.title)}</span><span class="card-meta">${esc(a.type)}${a.status ? ' · '+esc(a.status) : ''}</span>
  </button>`;
}
function renderGrid(items = state.items) {
  const grid = $('#anime-grid');
  grid.innerHTML = items.length ? items.map((item, i) => card(item, i)).join('') : '<div class="empty-state"><span>✦</span><h3>No titles found</h3><p>Try another search or check back later.</p></div>';
  $$('.anime-card', grid).forEach((el, i) => el.addEventListener('click', e => {
    if (e.target.closest('[data-save-id]')) return;
    openDetails(items[i]);
  }));
  $$('[data-save-id]', grid).forEach(el => el.addEventListener('click', e => { e.stopPropagation(); toggleSave(items.find(x => normalize(x).id === el.dataset.saveId)); renderGrid(items); }));
}
async function loadHome(category = 'home') {
  state.category = category;
  $('#catalog-title').innerHTML = ({home:'Trending now <span class="title-spark">✦</span>',popular:'Popular anime',recent:'Latest episodes',library:'Your saved anime'})[category] || 'Discover anime';
  $$('.chip').forEach(c => c.classList.toggle('active', c.dataset.category === category));
  if (category === 'library') { renderLibrary(); return; }
  setStatus('Finding your next favorite…');
  $('#anime-grid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const routes = { home:'/api/v1/hianime/home', popular:'/api/v1/hianime/home', recent:'/api/v1/hianime/home' };
  try {
    const data = await api(routes[category] || routes.home);
    let items = extractList(data);
    if (category === 'recent') items = items.filter(x => /episode|latest/i.test(JSON.stringify(x).slice(0,300)));
    state.items = items.map(normalize);
    renderGrid(state.items);
    setStatus(items.length ? `${items.length} titles ready to explore` : 'The API returned no titles. Try search or reload later.');
  } catch (error) {
    $('#anime-grid').innerHTML = '<div class="empty-state"><span>⌁</span><h3>Catalog taking a breather</h3><p></p><button class="outline-btn" id="retry-load">Try again</button></div>';
    $('.empty-state p').textContent = error.message;
    $('#retry-load')?.addEventListener('click', () => loadHome(category));
    setStatus('Unable to connect to the upstream catalog.');
  }
}
let searchTimer;
async function searchAnime(query) {
  state.query = query.trim();
  if (!state.query) { loadHome('home'); return; }
  showView('search'); $('#catalog-title').textContent = 'Search results'; setStatus('Searching the catalog…');
  $('#anime-grid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const data = await api('/api/v1/hianime/search?q=' + encodeURIComponent(state.query) + '&page=1');
    state.items = extractList(data).map(normalize); renderGrid(state.items);
    setStatus(state.items.length ? `Found ${state.items.length} matching titles` : 'No matches yet. Try a different title.');
  } catch (e) { $('#anime-grid').innerHTML = `<div class="empty-state"><h3>Search unavailable</h3><p>${esc(e.message)}</p></div>`; setStatus('Please check your connection and retry.'); }
}
async function openDetails(item) {
  if (!item) return;
  state.selected = normalize(item); showView('detail');
  $('#detail-content').innerHTML = `<div class="detail-hero"><div class="detail-backdrop" style="background-image:url('${esc(state.selected.image)}')"></div><div class="detail-poster">${state.selected.image ? `<img src="${esc(state.selected.image)}" alt="">` : '✦'}</div><div class="detail-copy"><span class="kicker">YOUR NEXT WATCH</span><h1>${esc(state.selected.title)}</h1><p class="detail-meta">${esc(state.selected.type)} ${state.selected.status ? ' · '+esc(state.selected.status) : ''}</p><div class="detail-actions"><button class="primary-btn" id="detail-play">▶ Episodes</button><button class="glass-btn" id="detail-save">${library().some(x=>normalize(x).id===state.selected.id)?'♥ Saved':'♡ Add to list'}</button></div></div></div><div class="synopsis"><span class="kicker">THE STORY</span><p>${esc(state.selected.description)}</p><div class="genre-tags">${state.selected.genres.map(g=>'<span>'+esc(g)+'</span>').join('')}</div></div><div class="section-head"><div><span class="kicker">THE JOURNEY</span><h2>Episodes</h2></div></div><div class="episode-list" id="episode-list"><div class="loading-line">Loading episode guide…</div></div>`;
  $('#detail-play').addEventListener('click', () => $('#episode-list').scrollIntoView({behavior:'smooth'}));
  $('#detail-save').addEventListener('click', () => { toggleSave(state.selected.raw || state.selected); $('#detail-save').textContent = library().some(x=>normalize(x).id===state.selected.id)?'♥ Saved':'♡ Add to list'; });
  try {
    const data = await api('/api/v1/hianime/info/' + encodeURIComponent(state.selected.id));
    const info = data?.data || data?.anime || data;
    state.selected = normalize({ ...state.selected.raw, ...info, id: pick(info,['id','animeId'],state.selected.id) });
    state.episodes = extractList(info?.episodes ? {episodes:info.episodes} : data?.episodes ? {episodes:data.episodes} : data).filter(x => x && (x.episodeId || x.id || x.number || x.title));
    renderEpisodes();
  } catch (e) { $('#episode-list').innerHTML = `<p class="muted">Episode list unavailable right now. ${esc(e.message)}</p><button class="outline-btn" id="retry-info">Retry</button>`; $('#retry-info')?.addEventListener('click',()=>openDetails(state.selected.raw||state.selected)); }
}
function renderEpisodes() {
  const el = $('#episode-list');
  if (!state.episodes.length) { el.innerHTML = '<p class="muted">No episodes were returned by this source.</p>'; return; }
  el.innerHTML = state.episodes.map((ep,i)=>`<button class="episode-row" data-episode="${i}"><span class="episode-play">▶</span><span class="episode-text"><strong>${esc(pick(ep,['title','name'], 'Episode '+pick(ep,['number','episodeNumber'],i+1)))}</strong><small>Episode ${esc(pick(ep,['number','episodeNumber'],i+1))}</small></span><span class="episode-arrow">↗</span></button>`).join('');
  $$('[data-episode]',el).forEach(btn=>btn.addEventListener('click',()=>playEpisode(state.episodes[Number(btn.dataset.episode)])));
}
async function playEpisode(ep) {
  if (!ep) return;
  state.activeEpisode = ep; showView('player');
  const video = $('#video-player'); $('#video-empty').hidden = false; $('#video-empty').textContent = 'Resolving available sources…';
  $('#player-info').innerHTML = `<span class="kicker">NOW PLAYING</span><h2>${esc(state.selected?.title || 'Anime')}</h2><p class="muted">${esc(pick(ep,['title','name'],'Episode '+pick(ep,['number','episodeNumber'],'')))}</p>`;
  try {
    const id = pick(ep,['episodeId','id','animeEpisodeId','url']);
    const data = await api('/api/v1/hianime/episode/sources?animeEpisodeId=' + encodeURIComponent(id));
    const sources = data?.sources || data?.data?.sources || data?.links || [];
    const source = sources.find(s => s.url && (s.isM3U8 || /\.m3u8(?:\?|$)/i.test(s.url))) || sources.find(s=>s.url);
    if (!source) throw new Error('No playable source was returned for this episode.');
    $('#video-empty').hidden = true;
    if (state.hls) { state.hls.destroy(); state.hls = null; }
    if (source.isM3U8 || /\.m3u8(?:\?|$)/i.test(source.url)) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = source.url;
      else if (Hls.isSupported()) { state.hls = new Hls(); state.hls.loadSource(source.url); state.hls.attachMedia(video); }
      else throw new Error('This device cannot play this HLS stream.');
    } else video.src = source.url;
    write('koni-history', [{ anime: state.selected, episode: ep, watchedAt: Date.now() }, ...history().filter(x=>normalize(x.anime).id!==state.selected.id)].slice(0,20));
    video.play().catch(()=>toast('Tap play when you are ready.'));
  } catch (e) { $('#video-empty').hidden = false; $('#video-empty').textContent = e.message; toast('Playback could not start.'); }
}
function toggleSave(item) {
  if (!item) return;
  const a = normalize(item); const list = library(); const exists = list.some(x=>normalize(x).id===a.id);
  write('koni-library', exists ? list.filter(x=>normalize(x).id!==a.id) : [item,...list]);
  toast(exists ? 'Removed from My list' : 'Added to My list');
}
function renderLibrary() {
  showView('library');
  const items = library();
  $('#library-content').innerHTML = items.length ? '<div class="poster-grid">'+items.map((x,i)=>card(x,i)).join('')+'</div>' : '<div class="empty-state"><span>♡</span><h3>Your list starts here</h3><p>Save anime you want to watch and they will show up here.</p><button class="primary-btn" id="library-explore">Find anime</button></div>';
  $$('.anime-card','#library-content').forEach((el,i)=>el.addEventListener('click',()=>openDetails(items[i])));
  $('#library-explore')?.addEventListener('click',()=>{showView('home');loadHome('home')});
}
function renderContinue() {
  const items = history();
  if (!items.length) return;
  $('#continue-section').hidden = false;
  $('#continue-row').innerHTML = items.slice(0,8).map((x,i)=>card(x.anime,i)).join('');
  $$('.anime-card','#continue-row').forEach((el,i)=>el.addEventListener('click',()=>openDetails(items[i].anime)));
}
function bindEvents() {
  $('#open-search').onclick = () => { showView('search'); $('#search-input').focus(); };
  $('#open-library').onclick = renderLibrary;
  $('#explore-btn').onclick = () => $('#trending-section').scrollIntoView({behavior:'smooth'});
  $('#surprise-btn').onclick = () => { if(state.items.length) openDetails(state.items[Math.floor(Math.random()*state.items.length)]); else loadHome('home'); };
  $('#see-all').onclick = () => { $('#trending-section').scrollIntoView({behavior:'smooth'}); };
  $('#search-input').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer=setTimeout(()=>searchAnime(e.target.value),350); });
  $('#clear-search').onclick = () => { $('#search-input').value=''; loadHome('home'); };
  $$('.chip').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.category==='library')renderLibrary();else {showView('home');loadHome(el.dataset.category)}}));
  $$('[data-nav]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();const nav=el.dataset.nav;if(nav==='settings')$('#settings-dialog').showModal();else if(nav==='library')renderLibrary();else if(nav==='search'){showView('search');$('#search-input').focus()}else{showView('home');loadHome('home')}}));
  $('#back-catalog').onclick = () => { showView(state.query?'search':'home'); };
  $('#back-detail').onclick = () => openDetails(state.selected);
  $('#save-settings').onclick = () => { write('koni-api-base',apiBase()); document.documentElement.classList.toggle('reduce-motion',$('#reduce-motion').checked); $('#settings-dialog').close(); toast('Preferences saved'); loadHome('home'); };
}
function init() {
  $('#api-base').value = read('koni-api-base',DEFAULT_API);
  $('#reduce-motion').checked = read('koni-reduce-motion',false);
  bindEvents(); renderContinue(); loadHome('home');
}
init();
