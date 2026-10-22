import Hls from 'hls.js';
import './styles.css';

const DEFAULT_API = (import.meta.env.VITE_API_BASE_URL || 'https://koni-nime-api.onrender.com').trim().replace(/\/+$/, '');
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { items: [], category: 'home', query: '', selected: null, episodes: [], activeEpisode: null, hls: null };
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { console.warn('[Koni-Nime] Could not save local preference:', error); toast('Could not save on this device. Check browser storage settings.'); return false; } };
const library = () => read('koni-library', []);
const history = () => read('koni-history', []);
const apiBase = () => ($('#api-base')?.value || read('koni-api-base', DEFAULT_API) || DEFAULT_API).trim().replace(/\/+$/, '');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pick = (obj, keys, fallback = '') => { for (const k of keys) if (obj?.[k] != null && obj[k] !== '') return obj[k]; return fallback; };
const titleOf = item => typeof item?.title === 'string' ? item.title : pick(item?.title, ['english','userPreferred','romaji','native'], pick(item, ['name','title_english','title_romaji'], 'Untitled anime'));
const imageOf = item => pick(item?.coverImage, ['extraLarge','large'], pick(item, ['poster','image','cover','thumbnail','posterUrl'], pick(item?.cover_image, ['extra_large','large','medium'], '')));
function normalize(item = {}) {
  return {
    id: String(pick(item, ['slug','id','anilistId','animeId','mal_id'], 'unknown')),
    title: titleOf(item),
    image: imageOf(item),
    banner: pick(item, ['bannerImage'], ''),
    description: pick(item, ['description','synopsis','overview'], 'No synopsis is available for this title yet.'),
    type: pick(item, ['format','type'], 'ANIME'),
    status: pick(item, ['status','airingStatus'], ''),
    score: pick(item, ['averageScore','meanScore','rating','score'], ''),
    genres: Array.isArray(item?.genres) ? item.genres.map(g => typeof g === 'string' ? g : g?.name).filter(Boolean) : [],
    raw: item
  };
}
function extractList(data) {
  if (Array.isArray(data)) return data;
  const keys = ['results','suggestions','media','animes','anime','trending','popular','latest','episodes','items','list','data','Page'];
  const queue = [data];
  const seen = new Set();
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) return node;
    if (node.success === false) continue;
    for (const key of keys) {
      const value = node[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') queue.push(value);
    }
  }
  return [];
}
async function api(path, options = {}) {
  const base = apiBase();
  if (!base) throw new Error('Koni-Nime API is not configured. Deploy the API service, or enter its public HTTPS URL in Settings.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(base + path, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
    if (!response.ok) {
      let detail = '';
      try { const body = await response.json(); detail = body.error?.message || body.detail || body.message || body.error?.detail || ''; } catch {}
      throw new Error(response.status === 429 ? 'The catalog is busy. Please wait a moment and try again.' : `Koni-Nime API request failed (${response.status})${detail ? ': '+detail : '.'}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The catalog took too long to respond. Please try again.');
    if (error instanceof TypeError) throw new Error('Could not reach your Koni-Nime API server. Check the URL, server status, and CORS settings.');
    throw error;
  } finally { clearTimeout(timer); }
}
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 3000); }
function setStatus(message) { $('#status-line').textContent = message; }
function showView(view) {
  $('#trending-section').hidden = !['home','search'].includes(view);
  $('#detail-section').hidden = view !== 'detail';
  $('#library-section').hidden = view !== 'library';
  $('#downloads-section').hidden = view !== 'downloads';
  $('#account-section').hidden = view !== 'account';
  $('#player-section').hidden = view !== 'player';
  $('#search-panel').hidden = view !== 'search';
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.nav === view || (view === 'detail' && el.dataset.nav === 'home')));
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches || read('koni-reduce-motion', false) ? 'auto' : 'smooth' });
}
function renderGrid(items) {
  const grid = $('#anime-grid');
  if (!grid) return;
  if (!Array.isArray(items) || items.length === 0) {
    grid.innerHTML = '<div class="empty-state"><span>✦</span><h3>No anime to show yet</h3><p>Try another category or search for a title you love.</p><button class="outline-btn" id="grid-retry">Reload catalog</button></div>';
    $('#grid-retry')?.addEventListener('click', () => loadHome(state.category || 'home'));
    return;
  }
  grid.innerHTML = items.map((item, index) => card(item, index)).join('');
  $$('.anime-card', grid).forEach((el, index) => {
    el.addEventListener('click', () => openDetails(items[index]));
  });
  $$('.quick-save', grid).forEach((el, index) => {
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      toggleSave(items[index]?.raw || items[index]);
      const saved = library().some(x => normalize(x).id === normalize(items[index]).id);
      el.classList.toggle('saved', saved);
      el.textContent = saved ? '♥' : '♡';
      toast(saved ? 'Added to My list' : 'Removed from My list');
    });
  });
}
function card(item, index = 0) {
  const a = normalize(item);
  const safeImage = a.image && /^https?:\/\//i.test(a.image) ? a.image : '';
  const saved = library().some(x => normalize(x).id === a.id);
  return `<button class="anime-card" data-anime-index="${index}" aria-label="View ${esc(a.title)}">
    <span class="poster-wrap">${safeImage ? `<img loading="lazy" src="${esc(safeImage)}" alt="" onerror="this.style.display='none'">` : ''}<span class="poster-placeholder">✦</span><span class="poster-overlay"></span><span class="card-score">${a.score ? '★ ' + esc(Number(a.score) > 10 ? (Number(a.score)/10).toFixed(1) : a.score) : 'KONI PICK'}</span><span class="quick-save ${saved?'saved':''}" data-save-id="${esc(a.id)}" aria-label="Save to library">${saved?'♥':'♡'}</span></span>
    <span class="card-title">${esc(a.title)}</span><span class="card-meta">${esc(a.type)}${a.status ? ' · '+esc(a.status) : ''}</span>
  </button>`;
}
async function loadHome(category = 'home') {
  searchRequestId++;
  state.category = category;
  $('#catalog-title').innerHTML = ({home:'Trending now <span class="title-spark">✦</span>',popular:'Popular anime',recent:'Latest anime'})[category] || 'Discover anime';
  $( '.chip' ).forEach(c => c.classList.toggle('active', c.dataset.category === category));
  if (category === 'library') { renderLibrary(); return; }
  setStatus('Finding your next favorite…');
  $('#anime-grid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  const routes = { home:'/anime/spotlight', popular:'/anime/popular?page=1&per_page=24', recent:'/anime/recent?page=1&per_page=24' };
    try {
    const data = await api(routes[category] || routes.home);
    state.items = extractList(data).map(normalize);
    renderGrid(state.items);
    setStatus(state.items.length ? `${state.items.length} titles ready to explore` : 'The API returned no titles. Try search or reload later.');
  } catch (error) {
    $('#anime-grid').innerHTML = '<div class="empty-state"><span>⌁</span><h3>Catalog taking a breather</h3><p></p><button class="outline-btn" id="retry-load">Try again</button></div>';
    $('.empty-state p').textContent = error.message;
    $('#retry-load')?.addEventListener('click', () => loadHome(category));
    setStatus('Unable to connect to Koni-Nime API.');
  }
}
let searchTimer;
let searchRequestId = 0;
async function searchAnime(query) {
  const requestId = ++searchRequestId;
  state.query = query.trim();
  if (!state.query) { loadHome('home'); return; }
  showView('search'); $('#catalog-title').textContent = 'Search results'; setStatus('Searching the catalog…');
  $('#anime-grid').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    const data = await api('/anime/search?query=' + encodeURIComponent(state.query) + '&page=1&per_page=24');
    if (requestId !== searchRequestId) return;
    state.items = extractList(data).map(normalize); renderGrid(state.items);
    setStatus(state.items.length ? `Found ${state.items.length} matching titles` : 'No matches yet. Try a different title.');
  } catch (e) { if (requestId !== searchRequestId) return; $('#anime-grid').innerHTML = `<div class="empty-state"><h3>Search unavailable</h3><p>${esc(e.message)}</p><button class="outline-btn" id="retry-search">Try again</button></div>`; $('#retry-search')?.addEventListener('click', () => searchAnime(state.query)); setStatus('Search temporarily unavailable. You can retry.'); }
}
function makeEpisodes(info, providerData = null) {
  const found = [];
  const providers = providerData?.providers || providerData?.results?.providers || providerData?.data?.providers || {};
  for (const [providerName, provider] of Object.entries(providers)) {
    const categories = provider?.episodes || {};
    for (const [categoryName, categoryValue] of Object.entries(categories)) {
      const category = Array.isArray(categoryValue) ? categoryValue : [];
      for (const ep of category) {
        const number = Number(ep?.number || ep?.episode || 0);
        if (number > 0 && !found.some(x=>x.number===number)) found.push({number,title:ep.title || 'Episode '+number, providerId:ep.id || '', providerName, audio:categoryName});
      }
    }
  }
  if (found.length) return found.sort((a,b)=>a.number-b.number);
  const total = Number(info?.episodes || info?.episodeCount || 0);
  if (total > 0 && total <= 1000) return Array.from({length:total},(_,i)=>({number:i+1,title:'Episode '+(i+1)}));
  return [];
}
async function openDetails(item) {
  if (!item) return;
  state.selected = normalize(item); showView('detail');
  $('#detail-content').innerHTML = `<div class="detail-hero"><div class="detail-backdrop" style="background-image:url('${esc(state.selected.banner || state.selected.image)}')"></div><div class="detail-poster">${state.selected.image ? `<img src="${esc(state.selected.image)}" alt="">` : '✦'}</div><div class="detail-copy"><span class="kicker">YOUR NEXT WATCH</span><h1>${esc(state.selected.title)}</h1><p class="detail-meta">${esc(state.selected.type)} ${state.selected.status ? ' · '+esc(state.selected.status) : ''}${state.selected.score ? ' · ★ '+esc(Number(state.selected.score)>10?(Number(state.selected.score)/10).toFixed(1):state.selected.score) : ''}</p><div class="detail-actions"><button class="primary-btn" id="detail-play">▶ Episodes</button><button class="glass-btn" id="detail-save">${library().some(x=>normalize(x).id===state.selected.id)?'♥ Saved':'♡ Add to list'}</button></div></div></div><div class="synopsis"><span class="kicker">THE STORY</span><p>${esc(state.selected.description)}</p><div class="genre-tags">${state.selected.genres.map(g=>'<span>'+esc(g)+'</span>').join('')}</div></div><div class="section-head"><div><span class="kicker">THE JOURNEY</span><h2>Episodes</h2></div></div><div class="episode-list" id="episode-list"><div class="loading-line">Loading anime details…</div></div>`;
  $('#detail-play').addEventListener('click', () => $('#episode-list').scrollIntoView({behavior:'smooth'}));
  $('#detail-save').addEventListener('click', () => { toggleSave(state.selected.raw || state.selected); $('#detail-save').textContent = library().some(x=>normalize(x).id===state.selected.id)?'♥ Saved':'♡ Add to list'; });
  try {
    const infoData = await api('/anime/info/' + encodeURIComponent(state.selected.id) + '?title=' + encodeURIComponent(state.selected.title));
    const info = infoData?.Media || infoData?.results?.Media || infoData?.results || infoData?.data?.Media || infoData?.data || infoData?.anime || infoData;
    const mergedInfo = { ...(state.selected.raw || {}), ...(info || {}), id: info?.id || info?.slug || state.selected.id };
    state.selected = normalize(mergedInfo);
    if (!state.selected.description || state.selected.description === 'No synopsis is available for this title yet.') {
      const synopsis = info?.description || info?.synopsis || info?.overview || info?.description?.english;
      if (typeof synopsis === 'string' && synopsis.trim()) state.selected.description = synopsis;
    }
    const providerData = await api('/anime/episodes/' + encodeURIComponent(state.selected.id) + '?title=' + encodeURIComponent(state.selected.title));
    state.episodes = makeEpisodes(info, providerData);
    renderEpisodes();
    $('#detail-content .detail-copy h1').textContent = state.selected.title;
    $('#detail-content .synopsis p').textContent = state.selected.description || 'No synopsis is available for this title yet.';
    $('#detail-content .genre-tags').innerHTML = state.selected.genres.map(g=>'<span>'+esc(g)+'</span>').join('');
  } catch (e) {
    $('#episode-list').innerHTML = `<p class="muted">Anime details unavailable. ${esc(e.message)}</p><button class="outline-btn" id="retry-info">Retry</button>`;
    $('#retry-info')?.addEventListener('click',()=>openDetails(state.selected.raw||state.selected));
  }
}
function renderEpisodes() {
  const el = $('#episode-list');
  if (!state.episodes.length) { el.innerHTML = '<p class="muted">No episode count was returned by the API.</p>'; return; }
  el.innerHTML = state.episodes.map((ep,i)=>`<button class="episode-row" data-episode="${i}"><span class="episode-play">▶</span><span class="episode-text"><strong>${esc(ep.title || 'Episode '+ep.number)}</strong><small>Episode ${esc(ep.number)}</small></span><span class="episode-arrow">↗</span></button>`).join('');
  $$('[data-episode]',el).forEach(btn=>btn.addEventListener('click',()=>playEpisode(state.episodes[Number(btn.dataset.episode)])));
}
async function playEpisode(ep) {
  if (!ep) return;
  state.activeEpisode = ep; showView('player');
  const video = $('#video-player');
  const embed = $('#embed-player');
  if (state.hls) { state.hls.destroy(); state.hls = null; }
  video.pause(); video.removeAttribute('src'); video.load();
  video.hidden = true;
  embed.hidden = true; embed.removeAttribute('src');
  $('#video-empty').hidden = false; $('#video-empty').textContent = 'Loading available episode player…';
  $('#player-info').innerHTML = `<span class="kicker">NOW PLAYING</span><h2>${esc(state.selected?.title || 'Anime')}</h2><p class="muted">${esc(ep.title || 'Episode '+ep.number)}</p><div class="player-actions"><p class="muted">Playback by Aniweeb</p><button class="glass-btn" id="download-episode" type="button">⇩ Save offline</button></div>`;
  $('#download-episode')?.addEventListener('click', () => { toast('Offline download is not available for this embedded stream. Use a provider-authorized download option if offered.'); });
  try {
    const id = String(state.selected?.id || '');
    if (!/^\d+$/.test(id)) throw new Error('Aniweeb requires an AniList ID. This title is currently identified by a provider slug, so it cannot be matched safely yet.');
    const episode = Number(ep.number || 1);
    if (!Number.isInteger(episode) || episode < 1) throw new Error('Invalid episode number.');
    const track = ep.audio === 'dub' ? 'dub' : 'sub';
    embed.src = 'https://api.aniweeb.net/embed/ani/' + encodeURIComponent(id) + '/' + episode + '?track=' + track;
    embed.hidden = false;
    $('#video-empty').hidden = true;
    write('koni-history', [{ anime: state.selected, episode: ep, watchedAt: Date.now() }, ...history().filter(x=>normalize(x.anime).id!==state.selected.id)].slice(0,20));
  } catch (e) {
    embed.removeAttribute('src'); embed.hidden = true;
    $('#video-empty').hidden = false; $('#video-empty').textContent = e.message;
    toast('Playback could not start.');
  }
}
function toggleSave(item) {
  if (!item) return;
  const a = normalize(item); const list = library(); const exists = list.some(x=>normalize(x).id===a.id);
  write('koni-library', exists ? list.filter(x=>normalize(x).id!==a.id) : [item,...list]);
  toast(exists ? 'Removed from My list' : 'Added to My list');
}
function renderDownloads() {
  showView('downloads');
  const items = read('koni-downloads', []);
  $('#downloads-content').innerHTML = items.length
    ? '<div class="download-list">'+items.map(item=>'<div class="download-item"><span class="download-icon">⇩</span><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail || 'Saved for offline')+'</small></div><span class="download-state">Ready</span></div>').join('')+'</div>'
    : '<div class="empty-state download-empty"><span>⇩</span><h3>Your offline shelf</h3><p>Downloads appear here when a licensed provider supplies a direct downloadable file. This player currently uses an embedded stream, so it cannot safely save that video as a local file.</p><button class="outline-btn" id="downloads-explore">Explore anime</button></div>';
  $('#downloads-explore')?.addEventListener('click',()=>{showView('home');loadHome('home')});
}
function renderAccount() {
  showView('account');
  const profile = read('koni-profile', {name:'Anime fan',email:''});
  $('#account-name').textContent = profile.name || 'Anime fan';
  $('#account-email').textContent = profile.email || 'Your personal anime space';
  $('#account-avatar').textContent = (profile.name || 'U').trim().charAt(0).toUpperCase();
  $('#open-account').textContent = (profile.name || 'U').trim().charAt(0).toUpperCase();
  $('#account-stats').innerHTML = '<div><strong>'+library().length+'</strong><span>My list</span></div><div><strong>'+history().length+'</strong><span>In progress</span></div><div><strong>'+read('koni-downloads',[]).length+'</strong><span>Downloads</span></div>';
  const items = history();
  $('#account-history').innerHTML = items.length ? items.slice(0,8).map((x,i)=>card(x.anime,i)).join('') : '<p class="muted">Start watching an anime and your progress will show here.</p>';
  $$('.anime-card','#account-history').forEach((el,i)=>el.addEventListener('click',()=>openDetails(items[i].anime)));
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
  $('#open-account').onclick = renderAccount;
  $('#edit-account').onclick = () => { const p=read('koni-profile',{name:'Anime fan',email:''}); $('#profile-name-input').value=p.name||''; $('#profile-email-input').value=p.email||''; $('#account-dialog').showModal(); };
  $('#save-account').onclick = () => { const name=$('#profile-name-input').value.trim().slice(0,40)||'Anime fan'; const email=$('#profile-email-input').value.trim().slice(0,120); write('koni-profile',{name,email}); $('#account-dialog').close(); renderAccount(); toast('Profile saved on this device'); };
  $('#account-settings').onclick = () => $('#settings-dialog').showModal();
  $('#explore-btn').onclick = () => $('#trending-section').scrollIntoView({behavior:'smooth'});
  $('#surprise-btn').onclick = () => { if(state.items.length) openDetails(state.items[Math.floor(Math.random()*state.items.length)]); else loadHome('home'); };
  $('#see-all').onclick = () => $('#trending-section').scrollIntoView({behavior:'smooth'});
  $('#search-input').addEventListener('input', e => { clearTimeout(searchTimer); searchTimer=setTimeout(()=>searchAnime(e.target.value),350); });
  $('#clear-search').onclick = () => { $('#search-input').value=''; loadHome('home'); };
  $$( '.chip' ).forEach(el=>el.addEventListener('click',()=>{if(el.dataset.category==='library')renderLibrary();else {showView('home');loadHome(el.dataset.category)}}));
  $$( '.genre-chip' ).forEach(el=>el.addEventListener('click',()=>{ $$( '.genre-chip' ).forEach(ch=>ch.classList.toggle('active',ch===el)); $('#search-input').value=el.dataset.genre; searchAnime(el.dataset.genre); }));
  $$( '[data-nav]' ).forEach(el=>el.addEventListener('click',e=>{e.preventDefault();const nav=el.dataset.nav;if(nav==='account')renderAccount();else if(nav==='downloads')renderDownloads();else if(nav==='library')renderLibrary();else if(nav==='search'){showView('search');$('#search-input').focus()}else{showView('home');loadHome('home')}}));
  $('#back-catalog').onclick = () => { showView(state.query?'search':'home'); };
  $('#back-detail').onclick = () => openDetails(state.selected);
  $('#save-settings').onclick = () => {
    write('koni-reduce-motion',$('#reduce-motion').checked);
    write('koni-catalog-density',$('#catalog-density').value);
    write('koni-preferred-audio',$('#preferred-audio').value);
    document.documentElement.classList.toggle('compact-catalog',$('#catalog-density').value==='compact');
    document.documentElement.classList.toggle('reduce-motion',$('#reduce-motion').checked);
    $('#settings-dialog').close();
    toast('Preferences saved');
    loadHome('home');
  };
}
function init() {
  $('#reduce-motion').checked = read('koni-reduce-motion',false);
  $('#catalog-density').value = read('koni-catalog-density','comfortable');
  $('#preferred-audio').value = read('koni-preferred-audio','sub');
  document.documentElement.classList.toggle('compact-catalog',$('#catalog-density').value==='compact');
  document.documentElement.classList.toggle('reduce-motion',$('#reduce-motion').checked);
  bindEvents(); renderContinue(); loadHome('home').catch(error => { console.error('[Koni-Nime] Catalog initialization failed:', error); setStatus('Catalog could not load. Use Reload catalog to retry.'); });
}
init();
