(()=>{
  // Resolve backend from page env or injected global
  const BACKEND = (typeof window !== 'undefined' && window.__WATCHDOG_BACKEND__) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) || '';

  // ------------------------ Utilities ------------------------
  function getPlatform(){
    const h = location.hostname;
    if (h.includes('youtube')) return 'youtube';
    if (h.includes('instagram')) return 'instagram';
    if (h.includes('twitter') || h.includes('x.com')) return 'twitter';
    return 'other';
  }

  function guessLanguage(text){
    const t = (text||'').toLowerCase();
    if(/[\u0900-\u097F]/.test(t)) return 'hindi';
    if(/\b(bsdk|bkl|mc|bc|chutiya|madarchod|behenchod|randi|chod)\b/.test(t)) return 'hinglish';
    if(/[\u0A00-\u0A7F]/.test(t)) return 'punjabi';
    return 'other';
  }

  function createBadge(){
    const b = document.createElement('div');
    b.className = 'watchdog-badge';
    b.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;box-shadow:0 10px 30px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;cursor:pointer;`;
    b.innerHTML = `<strong style="font-weight:700">WatchDog</strong><span class="status">Idle</span>`;
    b.title = 'WatchDog: click to rescan';
    document.documentElement.appendChild(b);
    return b;
  }

  function setBadgeStatus(badge, text, danger=false){
    const el = badge.querySelector('.status');
    if(el) { el.textContent = text; }
    badge.style.background = danger ? '#b91c1c' : '#111827';
  }

  function injectWarning(flagged, label, details){
    let bar = document.getElementById('watchdog-warning');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'watchdog-warning';
      bar.style.cssText = `position:fixed;top:0;left:0;right:0;padding:10px 14px;background:#b91c1c;color:#fff;font:14px/1.2 system-ui,-apple-system,Segoe UI,Roboto;z-index:2147483647;display:flex;justify-content:center;align-items:center;gap:12px;`;
      document.documentElement.appendChild(bar);
    }
    if(flagged){
      bar.textContent = `18+ Warning: ${label} detected`;
      if(details && details.topTerms && details.topTerms.length){
        const extras = document.createElement('span');
        extras.style.opacity = '0.9';
        extras.textContent = ` — key terms: ${details.topTerms.slice(0,5).join(', ')}`;
        bar.appendChild(extras);
      }
    } else {
      bar.textContent = 'WatchDog: No explicit abuse detected';
    }
    bar.style.background = flagged ? '#b91c1c' : '#065f46';
  }

  // ------------------------ Local Heuristic Fallback ------------------------
  const WORDLIST = {
    sexual: [
      'nsfw','porn','sex','nude','boobs','tits','ass','dick','cock','pussy','fuck','suck','deepthroat','blowjob','handjob','randi','randwa','bhosdi','lund','chut','chod','chudai'
    ],
    insults: [
      'idiot','moron','stupid','dumb','loser','trash','garbage','bastard','asshole','retard', 'fool'
    ],
    hinglishProfanity: [
      'bsdk','bkl','mc','bc','chutiya','madarchod','behenchod','gaandu','harami','kamina','kutte','gandu','saala'
    ],
    hate: [
      'kill','rape','lynch','genocide','exterminate','gas them','hate','nazis','jews','muslims','hindus','sikhs','christians','dalit','casteist','terrorist'
    ],
    selfharm: [
      'suicide','kill myself','kms','end it','cutting','self harm','self-harm','no reason to live'
    ]
  };

  function scoreTextLocal(text){
    const t = (text||'').toLowerCase();
    const counts = {};
    let total = 0;
    Object.entries(WORDLIST).forEach(([cat, words])=>{
      counts[cat] = 0;
      for(const w of words){
        const re = new RegExp(`(^|[^a-zA-Z])${w}([^a-zA-Z]|$)`, 'g');
        const matches = t.match(re);
        if(matches){ counts[cat] += matches.length; total += matches.length; }
      }
    });
    // simple weights
    const weights = { sexual: 0.7, insults: 0.5, hinglishProfanity: 0.9, hate: 1.0, selfharm: 1.0 };
    const categories = Object.keys(counts).map(k=>({ cat:k, score: counts[k]* (weights[k]||0.5) }));
    categories.sort((a,b)=>b.score-a.score);
    const top = categories[0];
    const flagged = (top?.score||0) >= 1 || (counts.sexual + counts.hinglishProfanity) >= 2;
    const label = flagged ? top.cat : 'safe';
    // top terms
    const topTerms = [];
    Object.values(WORDLIST).flat().forEach(w=>{ if(t.includes(w)) topTerms.push(w); });
    return {
      flagged,
      label,
      preview: text.slice(0, 300),
      scores: { counts, categories },
      topTerms: Array.from(new Set(topTerms)).slice(0, 10)
    };
  }

  // ------------------------ Backend Analyze with Fallback ------------------------
  async function analyze(text){
    const platform = getPlatform();
    const language = guessLanguage(text);
    if(BACKEND){
      try{
        const res = await fetch(`${BACKEND}/api/analyze/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, language, text })
        });
        if(res.ok){
          return await res.json();
        }
      }catch(e){
        // fall through to local
      }
    }
    const local = scoreTextLocal(text);
    return { flagged: local.flagged, label: local.label, preview: local.preview, scores: local.scores };
  }

  // ------------------------ Content Extraction ------------------------
  function extractGeneric(){
    return document.body?.innerText?.slice(0,8000) || document.title;
  }

  function getYouTubeVideoId(){
    try{
      const url = new URL(location.href);
      if(url.hostname.includes('youtube')){
        if(url.pathname === '/watch') return url.searchParams.get('v');
        const shorts = url.pathname.match(/\/shorts\/([\w-]+)/);
        if(shorts) return shorts[1];
      }
    }catch(_){ }
    return null;
  }

  async function fetchYouTubeTimedText(videoId, lang){
    try{
      const u = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}`;
      const res = await fetch(u, { credentials: 'include' });
      if(!res.ok) return '';
      const xml = await res.text();
      // parse simple <text> nodes
      const matches = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g));
      const decoded = matches.map(m=>decodeHTMLEntities(m[1].replace(/\n/g,' ').trim())).join('\n');
      return decoded;
    }catch(_){ return ''; }
  }

  function decodeHTMLEntities(str){
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  function extractYouTubeText(){
    const title = document.querySelector('h1.title, h1.ytd-watch-metadata')?.innerText || document.title;
    const desc = document.querySelector('#description')?.innerText || '';
    const comments = Array.from(document.querySelectorAll('#content-text')).slice(0,60).map(n=>n.innerText).join('\n');
    return [title, desc, comments].filter(Boolean).join('\n');
  }

  async function extractText(){
    if(location.hostname.includes('youtube')){
      const vid = getYouTubeVideoId();
      let transcript = '';
      if(vid){
        // try multiple languages commonly present
        const langs = ['en','en-US','hi','hi-IN','ur'];
        for(const l of langs){
          transcript = await fetchYouTubeTimedText(vid, l);
          if(transcript) break;
        }
      }
      const pageText = extractYouTubeText();
      return [transcript, pageText].filter(Boolean).join('\n');
    }
    if(location.hostname.includes('instagram')){
      const captions = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="button"], [role="dialog"] span, figcaption, article span'))
        .slice(0,80).map(n=>n.innerText).join('\n');
      return captions || document.title;
    }
    if(location.hostname.includes('twitter') || location.hostname.includes('x.com')){
      const tweets = Array.from(document.querySelectorAll('article [data-testid="tweetText"], article div[lang]')).slice(0,80).map(n=>n.innerText).join('\n');
      return tweets || document.title;
    }
    return extractGeneric();
  }

  // ------------------------ Main loop ------------------------
  const badge = createBadge();

  async function run(){
    try {
      setBadgeStatus(badge, 'Scanning…');
      const text = await extractText();
      if(!text || text.trim().length < 3){
        setBadgeStatus(badge, 'No content');
        injectWarning(false, 'safe');
        return;
      }
      const result = await analyze(text.slice(0, 12000));
      injectWarning(!!result.flagged, result.label || (result.flagged? 'abuse' : 'safe'), result);
      setBadgeStatus(badge, result.flagged ? 'Flagged (18+)' : 'Clear', !!result.flagged);
    } catch(e){
      setBadgeStatus(badge, 'Error', true);
      console.warn('[WatchDog] analysis error', e);
    }
  }

  // Re-run on navigation/content updates
  const debounced = (fn, t=1200)=>{ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), t); } };
  const rerun = debounced(run, 1500);

  const mo = new MutationObserver(rerun);
  mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true });

  window.addEventListener('popstate', rerun);
  window.addEventListener('hashchange', rerun);
  window.addEventListener('yt-navigate-finish', rerun);
  
  // Manual click to rescan
  badge.addEventListener('click', run);

  // initial
  run();
})();
