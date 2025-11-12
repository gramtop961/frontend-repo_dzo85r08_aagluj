(()=>{
  const BACKEND = (typeof window !== 'undefined' && window.__WATCHDOG_BACKEND__) || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BACKEND_URL) || '';

  function getPlatform(){
    const h = location.hostname;
    if (h.includes('youtube')) return 'youtube';
    if (h.includes('instagram')) return 'instagram';
    if (h.includes('twitter') || h.includes('x.com')) return 'twitter';
    return 'other';
  }

  function guessLanguage(text){
    const t = (text||'').toLowerCase();
    // naive guess: look for common Hinglish profanity tokens
    if(/[\u0900-\u097F]/.test(t)) return 'hindi';
    if(/\b(bsdk|bkl|mc|bc|chutiya)\b/.test(t)) return 'hinglish';
    return 'other';
  }

  function createBadge(){
    const b = document.createElement('div');
    b.className = 'watchdog-badge';
    b.style.cssText = `position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#111827;color:#fff;padding:10px 12px;border-radius:12px;font:12px/1.2 system-ui, -apple-system, Segoe UI, Roboto;box-shadow:0 10px 30px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center;`;
    b.innerHTML = `<strong style="font-weight:700">WatchDog</strong><span class="status">Idle</span>`;
    document.documentElement.appendChild(b);
    return b;
  }

  function setBadgeStatus(badge, text, danger=false){
    const el = badge.querySelector('.status');
    if(el) { el.textContent = text; }
    badge.style.background = danger ? '#b91c1c' : '#111827';
  }

  async function analyze(text){
    if(!BACKEND){
      throw new Error('No backend configured');
    }
    const platform = getPlatform();
    const language = guessLanguage(text);
    const res = await fetch(`${BACKEND}/api/analyze/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, language, text })
    });
    if(!res.ok) throw new Error('Analyze failed');
    return await res.json();
  }

  function extractText(){
    // Site-specific heuristics
    if(location.hostname.includes('youtube')){
      const desc = document.querySelector('#description')?.innerText || '';
      const comments = Array.from(document.querySelectorAll('#content-text')).slice(0,30).map(n=>n.innerText).join('\n');
      const title = document.querySelector('h1.title, h1.ytd-watch-metadata')?.innerText || document.title;
      return [title, desc, comments].filter(Boolean).join('\n');
    }
    if(location.hostname.includes('instagram')){
      const captions = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="button"], [role="dialog"] span, figcaption, article span'))
        .slice(0,50).map(n=>n.innerText).join('\n');
      return captions || document.title;
    }
    if(location.hostname.includes('twitter') || location.hostname.includes('x.com')){
      const tweets = Array.from(document.querySelectorAll('article [data-testid="tweetText"], article div[lang]')).slice(0,40).map(n=>n.innerText).join('\n');
      return tweets || document.title;
    }
    return document.body?.innerText?.slice(0,5000) || document.title;
  }

  function injectWarning(flagged, label){
    let bar = document.getElementById('watchdog-warning');
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'watchdog-warning';
      bar.style.cssText = `position:fixed;top:0;left:0;right:0;padding:10px 14px;background:#b91c1c;color:#fff;font:14px/1.2 system-ui,-apple-system,Segoe UI,Roboto;z-index:2147483647;display:flex;justify-content:center;align-items:center;gap:8px;`;
      document.documentElement.appendChild(bar);
    }
    bar.textContent = flagged ? `18+ Warning: ${label} content detected` : 'WatchDog: No explicit abuse detected';
    bar.style.background = flagged ? '#b91c1c' : '#065f46';
  }

  // Main loop
  const badge = createBadge();

  async function run(){
    try {
      setBadgeStatus(badge, 'Scanning…');
      const text = extractText();
      if(!text || text.trim().length < 3){
        setBadgeStatus(badge, 'No content');
        return;
      }
      const result = await analyze(text.slice(0, 4000));
      injectWarning(result.flagged, result.label);
      setBadgeStatus(badge, result.flagged ? 'Flagged (18+)' : 'Clear', !!result.flagged);
    } catch(e){
      setBadgeStatus(badge, 'Error', true);
      console.warn('[WatchDog] analysis error', e);
    }
  }

  // Re-run on navigation/content updates
  const debounced = (fn, t=1000)=>{ let id; return (...a)=>{ clearTimeout(id); id=setTimeout(()=>fn(...a), t); } };
  const rerun = debounced(run, 1500);

  const mo = new MutationObserver(rerun);
  mo.observe(document.documentElement, { subtree:true, childList:true, characterData:true });

  window.addEventListener('popstate', rerun);
  window.addEventListener('locationchange', rerun);

  // initial
  run();
})();
