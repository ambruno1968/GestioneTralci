/* pwa.js - Layer PWA & Client Autonomo per "Registro di Chiesa"
 * Fornisce supporto per installazione PWA, Service Worker, funzionamento 100% offline,
 * stampa ufficiale A4 senza popup bloccati, salvataggio file/backup, e sincronizzazione
 * Google Drive tramite Google Identity Services (GIS) direttamente dal browser.
 */
(function () {
  'use strict';

  const CLIENT_ID = '944725762658-ocihkj4r8b5usbitr35p32ai0agkubkb.apps.googleusercontent.com';
  const DEFAULT_EMAIL = 'segreteria.cometralcinovara@gmail.com';
  const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
  ].join(' ');

  window.PWA_STANDALONE = true;

  // Cache WIKI.md per consultazione immediata e offline
  const assetCache = {};
  fetch('WIKI.md')
    .then(r => (r.ok ? r.text() : ''))
    .then(t => { assetCache['WIKI.md'] = t; })
    .catch(() => {});

  // Stile personalizzato PWA: nasconde pulsante quit/chiudi e definisce pulsante installazione
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .header-quit-btn, #btn-app-quit, .btn-close-app { display: none !important; }
    #pwa-install {
      position: fixed;
      right: 18px;
      bottom: 74px;
      z-index: 9999;
      background: #0284c7;
      color: #ffffff;
      border: 0;
      padding: 10px 18px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13.5px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.28);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: transform 0.15s ease, background 0.15s ease;
    }
    #pwa-install:hover {
      background: #0369a1;
      transform: translateY(-2px);
    }
    @media (max-width: 600px) {
      #pwa-install {
        bottom: 66px;
        right: 12px;
        padding: 8px 14px;
        font-size: 12.5px;
      }
    }
  `;
  document.head.appendChild(styleEl);

  function toastMsg(msg, type) {
    if (typeof window.toast === 'function') {
      window.toast(msg, type || 'ok');
      return;
    }
    const box = document.getElementById('toasts');
    if (!box) {
      console.log('[PWA]', msg);
      return;
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'ok');
    t.innerHTML = `${type === 'err' ? '⚠️' : '✓'} <span>${msg}</span>`;
    box.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 250);
    }, 3500);
  }

  // Stampa diretta tramite iframe invisibile (evita blocco popup del browser)
  function printHtml(html, title) {
    const old = document.getElementById('pwa-print-frame');
    if (old) old.remove();

    const fr = document.createElement('iframe');
    fr.id = 'pwa-print-frame';
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);

    const doc = fr.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    if (title) {
      try { doc.title = String(title).replace(/_/g, ' '); } catch (_) {}
    }

    const triggerPrint = () => {
      try {
        fr.contentWindow.focus();
        fr.contentWindow.print();
      } catch (err) {
        toastMsg('Stampa non riuscita: ' + err.message, 'err');
      }
    };
    setTimeout(triggerPrint, 350);
  }

  // Salvataggio file con download automatico
  function saveFile(fileName, b64OrText, mime) {
    let blob;
    if (typeof b64OrText === 'string' && !b64OrText.startsWith('{') && !b64OrText.startsWith('[')) {
      try {
        const bin = atob(b64OrText);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
      } catch (_) {
        blob = new Blob([b64OrText], { type: mime || 'text/plain;charset=utf-8' });
      }
    } else {
      blob = new Blob([b64OrText], { type: mime || 'application/json;charset=utf-8' });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toastMsg('File salvato nei Download: ' + fileName, 'ok');
  }

  // Google Identity Services (GIS) - Flusso identico a MemoTralci
  function loadGis() {
    if (window.driveClient && typeof window.driveClient.loadGis === 'function') {
      return window.driveClient.loadGis();
    }
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Errore caricamento GIS')));
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Impossibile caricare Google Identity Services. Verifica la connessione ad internet.'));
      document.head.appendChild(s);
    });
  }

  async function finalizeGoogleAuth(token, expiresIn, refreshToken) {
    if (window.driveClient) {
      window.driveClient.setToken(token, expiresIn || 3600, refreshToken);
    }

    let userInfo = { email: DEFAULT_EMAIL, name: 'Segreteria Come Tralci' };
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        userInfo = await res.json();
      }
    } catch (_) {}

    if (window.driveClient) {
      window.driveClient.setUserInfo(userInfo);
    }
    return { token, userInfo };
  }

  function signInWithTokenClient(clientId) {
    return new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES,
          callback: async resp => {
            if (resp && resp.access_token) {
              const expiresIn = resp.expires_in ? Number(resp.expires_in) : 3600;
              const refreshToken = window.driveClient?.config?.refreshToken || undefined;
              const result = await finalizeGoogleAuth(resp.access_token, expiresIn, refreshToken);
              resolve(result);
            } else {
              const err = (resp && (resp.error_description || resp.error)) || 'Accesso Google annullato o fallito';
              reject(new Error(err));
            }
          },
          error_callback: err => {
            reject(new Error((err && (err.message || err.type)) || 'Accesso Google non completato'));
          }
        });
        client.requestAccessToken({ prompt: 'select_account' });
      } catch (err) {
        reject(err);
      }
    });
  }

  function requestGoogleSignInPopup() {
    const clientId = window.driveClient?.config?.clientId || CLIENT_ID;
    const clientSecret = window.driveClient?.config?.clientSecret || '';

    return loadGis().then(() => new Promise((resolve, reject) => {
      try {
        const oauth2 = window.google.accounts.oauth2;
        if (oauth2.initCodeClient && clientSecret) {
          const codeClient = oauth2.initCodeClient({
            client_id: clientId,
            scope: SCOPES,
            ux_mode: 'popup',
            select_account: true,
            callback: async codeResp => {
              if (codeResp && codeResp.code) {
                try {
                  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                      client_id: clientId,
                      client_secret: clientSecret,
                      code: codeResp.code,
                      grant_type: 'authorization_code',
                      redirect_uri: 'postmessage'
                    })
                  });
                  if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : 3600;
                    const refreshToken = tokenData.refresh_token || window.driveClient?.config?.refreshToken || undefined;
                    const result = await finalizeGoogleAuth(tokenData.access_token, expiresIn, refreshToken);
                    resolve(result);
                    return;
                  }
                } catch (err) {
                  console.warn('[PWA] Scambio codice OAuth fallito, uso token client:', err);
                }
              }
              signInWithTokenClient(clientId).then(resolve).catch(reject);
            },
            error_callback: () => {
              signInWithTokenClient(clientId).then(resolve).catch(reject);
            }
          });
          codeClient.requestCode();
          return;
        }
        signInWithTokenClient(clientId).then(resolve).catch(reject);
      } catch (err) {
        reject(err);
      }
    }));
  }

  async function signIn() {
    try {
      localStorage.removeItem('gestione_tralci_drive_explicit_logout');
      toastMsg('Apertura accesso sicuro con Google...');
      await requestGoogleSignInPopup();
      toastMsg('Account Google collegato con successo! Sincronizzazione in corso...', 'ok');

      if (window.LocalDbEngine) {
        try {
          await window.LocalDbEngine.handle('/api/cloud/restore-latest', { method: 'POST' });
          toastMsg('Database sincronizzato da Google Drive!', 'ok');
        } catch (e) {
          console.warn('[PWA] Sincronizzazione iniziale dopo login:', e.message || e);
        }
      }

      if (typeof window.loadAllData === 'function') {
        await window.loadAllData();
      }
    } catch (err) {
      toastMsg('Accesso Google: ' + err.message, 'err');
    }
  }

  async function silentRefresh() {
    if (window.driveClient && typeof window.driveClient.silentRefreshToken === 'function') {
      const token = await window.driveClient.silentRefreshToken();
      if (token) return token;
    }
    throw new Error('Sessione Google Drive scaduta. Clicca su "Accedi con Google Drive" nelle Impostazioni per ricollegarti.');
  }

  window.PwaGoogle = { signIn, silentRefresh };

  // Bridge Android compatibile per l'applicazione
  window.Android = {
    printHtml,
    printCurrentPage: () => window.print(),
    saveFile,
    shareText: (title, text) => {
      if (navigator.share) {
        navigator.share({ title, text }).catch(() => {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(`${title}\n${text}`).then(() => toastMsg('Testo copiato negli appunti', 'ok'));
      }
    },
    sendEmail: (to, subject, body) => {
      location.href = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}&body=${encodeURIComponent(body || '')}`;
    },
    readAssetFile: name => assetCache[name] || '',
    startGoogleOAuth: () => { signIn(); },
    closeApp: () => { try { window.close(); } catch (_) {} }
  };

  // Intercettazione del pulsante login Google Drive nella UI
  document.addEventListener('click', e => {
    const btn = e.target.closest('#btn-cloud-login-now');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      signIn();
    }
  }, true);

  // Registrazione Service Worker per funzionamento Offline
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.update();
      }).catch(err => {
        console.warn('[PWA] Registrazione Service Worker fallita:', err);
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }

  // Gestione installazione PWA ("beforeinstallprompt")
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (document.getElementById('pwa-install')) return;

    const btn = document.createElement('button');
    btn.id = 'pwa-install';
    btn.innerHTML = '📲 Installa GestioneTralci';
    btn.title = 'Installa l\'applicazione GestioneTralci sul dispositivo';
    btn.onclick = async () => {
      btn.remove();
      if (deferredPrompt) {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
      }
    };
    document.body.appendChild(btn);
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install');
    if (btn) btn.remove();
    toastMsg('GestioneTralci installato con successo!', 'ok');
  });

})();

