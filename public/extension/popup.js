(function(){
  const qs = s=>document.querySelector(s);
  const statusEl = qs('#status');
  const enabledEl = qs('#toggle-enabled');
  const backendEl = qs('#toggle-backend');
  const urlEl = qs('#backend-url');

  // Load settings
  chrome.storage.sync.get(['watchdog_enabled','watchdog_cloud','watchdog_backend'], (res)=>{
    enabledEl.checked = res.watchdog_enabled !== false;
    backendEl.checked = !!res.watchdog_cloud;
    if(res.watchdog_backend) urlEl.value = res.watchdog_backend;
  });

  function setStatus(t){ statusEl.textContent = t; }

  // Save
  qs('#save').addEventListener('click', ()=>{
    const backend = urlEl.value.trim();
    chrome.storage.sync.set({ watchdog_backend: backend }, ()=>{
      setStatus('Saved');
      setTimeout(()=>setStatus('Idle'), 1200);
    });
  });

  enabledEl.addEventListener('change', ()=>{
    chrome.storage.sync.set({ watchdog_enabled: enabledEl.checked });
  });

  backendEl.addEventListener('change', ()=>{
    chrome.storage.sync.set({ watchdog_cloud: backendEl.checked });
  });

  // Send message to content script to scan
  qs('#scan-now').addEventListener('click', ()=>{
    setStatus('Scanning…');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs)=>{
      const tabId = tabs && tabs[0] && tabs[0].id;
      if(!tabId){ setStatus('No active tab'); return; }
      chrome.tabs.sendMessage(tabId, { type:'WATCHDOG_SCAN_REQUEST' }, (resp)=>{
        if(chrome.runtime.lastError){ setStatus('Tab not supported'); return; }
        setStatus(resp && resp.flagged ? 'Flagged (18+)' : 'Clear');
      });
    });
  });
})();
