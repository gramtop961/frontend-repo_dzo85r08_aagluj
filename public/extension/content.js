(()=>{
  // ------------------------ Settings ------------------------
  let SETTINGS = { enabled: true, cloud: false, backend: '' };

  function loadSettings(){
    try{
      chrome.storage.sync.get(['watchdog_enabled','watchdog_cloud','watchdog_backend'], (res)=>{
        SETTINGS.enabled = res.watchdog_enabled !== false; // default true
        SETTINGS.cloud = !!res.watchdog_cloud;
        SETTINGS.backend = (res.watchdog_backend||'').trim();
      });
    }catch(_){ /* non-extension env */ }
  }
  loadSettings();

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

  // ------------------------ Local Heuristic Fallback ------------------------
  const WORDLIST = {
    sexual: [
      'nsfw','porn','sex','nude','boobs','tits','ass','dick','cock','pussy','fuck','suck','deepthroat','blowjob','handjob','randi','randwa','bhosdi','lund','chut','chod','chudai'
    ],
    insults: [
      'idiot','moron','stupid','dumb','loser','trash','garbage','bastard','asshole','retard','fool'
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
    Object.entries(WORDLIST).forEach(([cat, words])=>{
      counts[cat] = 0;
      for(const w of words){
        const re = new RegExp(`(^|[^a-zA-Z])${w}([^a-zA-Z]|$)`, 'g');
        const matches = t.match(re);
        if(matches){ counts[cat] += matches.length; }
      }
    });
    const weights = { sexual: 0.7, insults: 0.5, hinglishProfanity: 0.9, hate: 1.0, selfharm: 1.0 };
    const categories = Object.keys(counts).map(k=>({ cat:k, score: counts[k]* (weights[k]||0.5) }));
    categories.sort((a,b)=>b.score-a.score);
    const top = categories[0];
    const flagged = (top?.score||0) >= 1 || ((counts.sexual||0) + (counts.hinglishProfanity||0)) >= 2;
    const label = flagged ? top.cat : 'safe';
    const topTerms = [];
    Object.values(WORDLIST).flat().forEach(w=>{ if(t.includes(w)) topTerms.push(w); });
    return {
      flagged,
      label,
      preview: (text||'').slice(0, 300),
      scores: { counts, categories },
      topTerms: Array.from(new Set(topTerms)).slice(0, 10)
    };
  }

  // ------------------------ Backend Analyze with Fallback ------------------------
  async function analyze(text){
    const platform = getPlatform();
    const language = guessLanguage(text);
    const useBackend = SETTINGS.cloud && SETTINGS.backend;
    if(useBackend){
      try{
        const res = await fetch(`${SETTINGS.backend.replace(/\/$/,'')}/api/analyze/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, language, text })
        });
        if(res.ok){
          return await res.json();
        }
      }catch(_){ /* fallthrough to local */ }
    }
    const local = scoreTextLocal(text);
    return { flagged: local.flagged, label: local.label, preview: local.preview, scores: local.scores, topTerms: local.topTerms };
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

  // ------------------------ Message-driven behavior (no UI injection) ------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse)=>{
    if(!msg || msg.type !== 'WATCHDOG_SCAN_REQUEST') return;
    (async ()=>{
      try{
        // Refresh settings right before a scan
        await new Promise((resolve)=>{
          chrome.storage.sync.get(['watchdog_enabled','watchdog_cloud','watchdog_backend'], (res)=>{
            SETTINGS.enabled = res.watchdog_enabled !== false;
            SETTINGS.cloud = !!res.watchdog_cloud;
            SETTINGS.backend = (res.watchdog_backend||'').trim();
            resolve(null);
          });
        });
        if(!SETTINGS.enabled){
          sendResponse({ ok:true, skipped:true, reason:'disabled' });
          return;
        }
        const text = await extractText();
        if(!text || text.trim().length < 3){
          sendResponse({ ok:true, flagged:false, label:'no-content' });
          return;
        }
        const result = await analyze(text.slice(0, 12000));
        sendResponse({ ok:true, ...result });
      }catch(e){
        sendResponse({ ok:false, error: String(e&&e.message||e) });
      }
    })();
    return true; // keep channel open for async
  });
})();
