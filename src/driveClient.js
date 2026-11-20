// driveClient.js - Modulo client-side Google Drive v3 per GestioneTralci PWA
// Supporta sincronizzazione cloud bidirezionale, upload/download db.json,
// rinnovo automatico token OAuth e archiviazione cache locale offline.
'use strict';

const DRIVE_CONFIG_KEY = 'gestione_tralci_drive_config';
const LEGACY_DRIVE_CONFIG_KEYS = ['gestionale_tralci_drive_config', 'registro_chiesa_drive_config'];
const DRIVE_TOKEN_KEY = 'gestione_tralci_drive_token';
const LEGACY_DRIVE_TOKEN_KEYS = ['gestionale_tralci_drive_token', 'registro_chiesa_drive_token'];
const DRIVE_TOKEN_EXPIRES_KEY = 'gestione_tralci_drive_token_exp';
const DRIVE_EXPLICIT_LOGOUT_KEY = 'gestione_tralci_drive_explicit_logout';
const DB_CACHE_KEY = 'gestione_tralci_db_cache';
const LEGACY_DB_CACHE_KEYS = ['gestionale_tralci_db_cache', 'registro_chiesa_db_cache'];
const DB_SYNC_TIME_KEY = 'gestione_tralci_db_synced_at';
const LEGACY_DB_SYNC_TIME_KEYS = ['gestionale_tralci_db_synced_at', 'registro_chiesa_db_synced_at'];
const DRIVE_USER_INFO_KEY = 'gestione_tralci_drive_userinfo';
const LEGACY_DRIVE_USER_INFO_KEYS = ['gestionale_tralci_drive_userinfo', 'registro_chiesa_drive_userinfo'];

const GOOGLE_DEFAULT_CLIENT_ID = '944725762658-ocihkj4r8b5usbitr35p32ai0agkubkb.apps.googleusercontent.com';
const LEGACY_BROKEN_CLIENT_ID = '258159664417-nc6r2krvqu8fvutoa1p9j3b81agrugqs.apps.googleusercontent.com';
const GOOGLE_DEFAULT_EMAIL = 'segreteria.cometralcinovara@gmail.com';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'openid'
].join(' ');

const DEFAULT_CONFIG = {
  clientId: GOOGLE_DEFAULT_CLIENT_ID,
  clientSecret: '',
  refreshToken: '',
  folderName: 'Gestione Tralci',
  fileName: 'db.json',
  autoSync: true
};

// Persistenza sessione Google in IndexedDB (identica a MemoTralci) per evitare disconnessioni PWA
const AUTH_IDB_NAME = 'gestione_tralci_auth_db';
const AUTH_IDB_STORE = 'authSession';

function openAuthDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile'));
      return;
    }
    const req = indexedDB.open(AUTH_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AUTH_IDB_STORE)) {
        db.createObjectStore(AUTH_IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGetAuthSession() {
  try {
    const db = await openAuthDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(AUTH_IDB_STORE, 'readonly');
      const req = tx.objectStore(AUTH_IDB_STORE).get('google');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSaveAuthSession(session) {
  try {
    const db = await openAuthDb();
    await new Promise((resolve) => {
      const tx = db.transaction(AUTH_IDB_STORE, 'readwrite');
      tx.objectStore(AUTH_IDB_STORE).put({ id: 'google', ...session, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

async function idbClearAuthSession() {
  try {
    const db = await openAuthDb();
    await new Promise((resolve) => {
      const tx = db.transaction(AUTH_IDB_STORE, 'readwrite');
      tx.objectStore(AUTH_IDB_STORE).delete('google');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}

class DriveClient {
  constructor() {
    this.config = this.loadConfig();
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
    this.lastError = null;
    this.onStatusChange = null;
    this.userInfo = null;
    this.gisPromise = null;
    this.refreshTimer = null;
    this.refreshPromise = null;

    this.sessionReadyPromise = this.restoreSessionFromIndexedDB();
    this.setupLifecycleListeners();
    this.scheduleAutoRefresh();
  }

  loadConfig() {
    try {
      let saved = localStorage.getItem(DRIVE_CONFIG_KEY);
      if (!saved) {
        for (const k of LEGACY_DRIVE_CONFIG_KEYS) {
          saved = localStorage.getItem(k);
          if (saved) {
            localStorage.setItem(DRIVE_CONFIG_KEY, saved);
            break;
          }
        }
      }
      if (saved) {
        const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        let changed = false;
        if (!parsed.clientId || parsed.clientId === LEGACY_BROKEN_CLIENT_ID) {
          parsed.clientId = GOOGLE_DEFAULT_CLIENT_ID;
          changed = true;
        }
        // Migra vecchia configurazione con autoSync=false predefinito a true (se non disabilitato esplicitamente)
        if (parsed.autoSync === false && parsed.autoSyncExplicitlyDisabled !== true) {
          parsed.autoSync = true;
          changed = true;
        }
        if (changed) {
          localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(parsed));
        }
        return parsed;
      }
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    if (cfg && typeof cfg.autoSync === 'boolean') {
      this.config.autoSyncExplicitlyDisabled = !cfg.autoSync;
    }
    if (!this.config.clientId || this.config.clientId === LEGACY_BROKEN_CLIENT_ID) {
      this.config.clientId = GOOGLE_DEFAULT_CLIENT_ID;
    }
    localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(this.config));
    this.notifyStatus();
  }

  async restoreSessionFromIndexedDB() {
    try {
      const explicitLogout = localStorage.getItem(DRIVE_EXPLICIT_LOGOUT_KEY) === 'true';
      const savedSession = await idbGetAuthSession();
      if ((savedSession && savedSession.explicitlyDisconnected) || explicitLogout) {
        return;
      }
      if (savedSession) {
        if (!localStorage.getItem(DRIVE_USER_INFO_KEY) && savedSession.user) {
          this.userInfo = savedSession.user;
          localStorage.setItem(DRIVE_USER_INFO_KEY, JSON.stringify(savedSession.user));
        }
        if (!this.config.refreshToken && savedSession.refreshToken) {
          this.config.refreshToken = savedSession.refreshToken;
          localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(this.config));
        }
        if (
          !localStorage.getItem(DRIVE_TOKEN_KEY) &&
          savedSession.token &&
          savedSession.tokenExpires &&
          savedSession.tokenExpires > Date.now()
        ) {
          localStorage.setItem(DRIVE_TOKEN_KEY, savedSession.token);
          localStorage.setItem(DRIVE_TOKEN_EXPIRES_KEY, String(savedSession.tokenExpires));
        }
      }
      if (!this.getToken() && this.isConnected()) {
        this.silentRefreshToken().catch(() => {});
      }
      this.notifyStatus();
    } catch (e) {
      console.warn('[Google Auth] Errore ripristino sessione da IndexedDB:', e);
    }
  }

  async persistSessionToIndexedDB() {
    try {
      const user = this.getUserInfo();
      const token = localStorage.getItem(DRIVE_TOKEN_KEY);
      const exp = localStorage.getItem(DRIVE_TOKEN_EXPIRES_KEY);
      const refreshToken = this.config.refreshToken || '';
      const explicitlyDisconnected = localStorage.getItem(DRIVE_EXPLICIT_LOGOUT_KEY) === 'true';

      await idbSaveAuthSession({
        token,
        tokenExpires: exp ? Number(exp) : null,
        refreshToken,
        user,
        explicitlyDisconnected
      });
    } catch {}
  }

  setupLifecycleListeners() {
    if (typeof window === 'undefined') return;
    const checkAndRefresh = () => {
      if (!this.isConnected()) return;
      const exp = localStorage.getItem(DRIVE_TOKEN_EXPIRES_KEY);
      const token = localStorage.getItem(DRIVE_TOKEN_KEY);
      if (!token || !exp || Number(exp) - Date.now() < 15 * 60 * 1000) {
        this.silentRefreshToken().catch(() => {});
      }
    };
    window.addEventListener('focus', checkAndRefresh);
    window.addEventListener('online', checkAndRefresh);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkAndRefresh();
      }
    });
  }

  loadGis() {
    if (typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }
    if (this.gisPromise) return this.gisPromise;

    this.gisPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error('Errore caricamento GIS')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.gisPromise = null;
        reject(new Error('Impossibile caricare Google Identity Services. Controlla la connessione internet.'));
      };
      document.head.appendChild(script);
    });
    return this.gisPromise;
  }

  isConnected() {
    try {
      if (localStorage.getItem(DRIVE_EXPLICIT_LOGOUT_KEY) === 'true') {
        return false;
      }
    } catch {}
    const token = this.getToken();
    if (token && token.trim().length > 10) return true;

    const refreshToken = this.config.refreshToken;
    const user = this.getUserInfo();
    if ((user && user.email) || refreshToken) {
      this.silentRefreshToken().catch(() => {});
      return true;
    }
    return false;
  }

  getToken() {
    try {
      if (localStorage.getItem(DRIVE_EXPLICIT_LOGOUT_KEY) === 'true') return null;
      let saved = localStorage.getItem(DRIVE_TOKEN_KEY);
      if (!saved) {
        for (const k of LEGACY_DRIVE_TOKEN_KEYS) {
          saved = localStorage.getItem(k);
          if (saved) {
            localStorage.setItem(DRIVE_TOKEN_KEY, saved);
            break;
          }
        }
      }
      const exp = localStorage.getItem(DRIVE_TOKEN_EXPIRES_KEY);
      if (exp) {
        const expNum = Number(exp);
        if (Date.now() > expNum - 10 * 60 * 1000) {
          this.silentRefreshToken().catch(() => {});
        }
        if (Date.now() > expNum) {
          return null;
        }
      }
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}
    return null;
  }

  async getValidToken() {
    const current = this.getToken();
    if (current) return current;
    if (this.isConnected()) {
      return await this.silentRefreshToken();
    }
    return null;
  }

  setToken(token, expiresInSeconds = 3600, refreshToken) {
    if (token) {
      localStorage.removeItem(DRIVE_EXPLICIT_LOGOUT_KEY);
      localStorage.setItem(DRIVE_TOKEN_KEY, token.trim());
      const expTime = Date.now() + Math.max(300, expiresInSeconds - 90) * 1000;
      localStorage.setItem(DRIVE_TOKEN_EXPIRES_KEY, String(expTime));
      if (refreshToken && refreshToken.trim().length > 10) {
        this.config.refreshToken = refreshToken.trim();
        localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(this.config));
      }
      this.persistSessionToIndexedDB();
      this.scheduleAutoRefresh(expiresInSeconds);
    } else {
      localStorage.removeItem(DRIVE_TOKEN_KEY);
      localStorage.removeItem(DRIVE_TOKEN_EXPIRES_KEY);
    }
    this.notifyStatus();
  }

  scheduleAutoRefresh(expiresInSeconds) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    let delayMs = 45 * 60 * 1000;
    if (expiresInSeconds && expiresInSeconds > 600) {
      delayMs = (expiresInSeconds - 300) * 1000;
    } else {
      const exp = localStorage.getItem(DRIVE_TOKEN_EXPIRES_KEY);
      if (exp) {
        delayMs = Math.max(15000, Number(exp) - Date.now() - 300000);
      }
    }
    this.refreshTimer = setTimeout(() => {
      this.silentRefreshToken().catch((err) => {
        console.warn('[Google Auth] Rinnovo schedulato fallito:', err);
      });
    }, delayMs);
  }

  invalidateExpiredAccessToken() {
    try {
      localStorage.removeItem(DRIVE_TOKEN_KEY);
      localStorage.removeItem(DRIVE_TOKEN_EXPIRES_KEY);
    } catch {}
  }

  setUserInfo(info) {
    this.userInfo = info;
    if (info) {
      localStorage.setItem(DRIVE_USER_INFO_KEY, JSON.stringify(info));
    } else {
      localStorage.removeItem(DRIVE_USER_INFO_KEY);
    }
    this.persistSessionToIndexedDB();
    this.notifyStatus();
  }

  getUserInfo() {
    try {
      if (localStorage.getItem(DRIVE_EXPLICIT_LOGOUT_KEY) === 'true') return null;
    } catch {}
    if (this.userInfo) return this.userInfo;
    try {
      let saved = localStorage.getItem(DRIVE_USER_INFO_KEY);
      if (!saved) {
        for (const k of LEGACY_DRIVE_USER_INFO_KEYS) {
          saved = localStorage.getItem(k);
          if (saved) break;
        }
      }
      if (saved) {
        this.userInfo = JSON.parse(saved);
        return this.userInfo;
      }
      if (this.config.refreshToken) {
        return { email: GOOGLE_DEFAULT_EMAIL, name: 'Segreteria Come Tralci' };
      }
    } catch (_) {}
    return null;
  }

  async fetchUserInfo() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const info = await res.json();
        this.setUserInfo(info);
        return info;
      }
    } catch (_) {}
    return null;
  }

  notifyStatus() {
    const connected = this.isConnected();
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        status: this.status,
        lastError: this.lastError,
        lastSync: this.getLastSyncTime(),
        hasToken: !!this.getToken(),
        userInfo: this.getUserInfo(),
        connected
      });
    }
  }

  async silentRefreshToken() {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = (async () => {
      try {
        const refreshToken = this.config.refreshToken;
        const clientId = this.config.clientId || GOOGLE_DEFAULT_CLIENT_ID;
        const clientSecret = this.config.clientSecret;

        // 1. Rinnovo diretto tramite refresh_token salvato localmente (se presente)
        if (refreshToken && clientId && clientSecret) {
          try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
              })
            });
            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              if (tokenData && tokenData.access_token) {
                const newAccessToken = tokenData.access_token;
                const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : 3600;
                this.setToken(newAccessToken, expiresIn, refreshToken);
                if (!localStorage.getItem(DRIVE_USER_INFO_KEY)) {
                  this.setUserInfo({ email: GOOGLE_DEFAULT_EMAIL, name: 'Segreteria Come Tralci' });
                }
                return newAccessToken;
              }
            }
          } catch (httpErr) {
            console.warn('[Google OAuth2] Errore temporaneo rete durante refresh HTTP:', httpErr);
          }
        }

        // 2. Fallback GIS client-side con hint account
        await this.loadGis();
        const user = this.getUserInfo();
        const oauth2 = window.google?.accounts?.oauth2;
        if (!oauth2) return null;

        return await new Promise((resolve) => {
          let resolved = false;
          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              resolve(null);
            }
          }, 8000);

          try {
            const client = oauth2.initTokenClient({
              client_id: clientId,
              scope: GOOGLE_SCOPES,
              callback: (resp) => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                if (resp && resp.access_token) {
                  const expiresIn = resp.expires_in ? Number(resp.expires_in) : 3600;
                  this.setToken(resp.access_token, expiresIn);
                  resolve(resp.access_token);
                } else {
                  resolve(null);
                }
              },
              error_callback: () => {
                if (resolved) return;
                resolved = true;
                clearTimeout(timeout);
                resolve(null);
              }
            });

            client.requestAccessToken({
              prompt: '',
              hint: user?.email || GOOGLE_DEFAULT_EMAIL
            });
          } catch {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve(null);
            }
          }
        });
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  async refreshAccessToken() {
    const token = await this.silentRefreshToken();
    return !!token;
  }

  getCachedDb() {
    try {
      let raw = localStorage.getItem(DB_CACHE_KEY);
      if (!raw) {
        for (const k of LEGACY_DB_CACHE_KEYS) {
          raw = localStorage.getItem(k);
          if (raw) break;
        }
      }
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn('Errore lettura cache locale:', e);
    }
    return null;
  }

  setCachedDb(dbObj) {
    try {
      localStorage.setItem(DB_CACHE_KEY, JSON.stringify(dbObj));
      localStorage.setItem(DB_SYNC_TIME_KEY, new Date().toISOString());
    } catch (e) {
      console.error('Errore salvataggio cache locale:', e);
    }
  }

  getLastSyncTime() {
    let t = localStorage.getItem(DB_SYNC_TIME_KEY);
    if (!t) {
      for (const k of LEGACY_DB_SYNC_TIME_KEYS) {
        t = localStorage.getItem(k);
        if (t) break;
      }
    }
    return t;
  }

  /**
   * Sincronizza scaricando db.json da Google Drive
   */
  async downloadDb(retried = false) {
    let token = await this.getValidToken();
    if (!token && !retried) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) return this.downloadDb(true);
      token = this.getToken();
    }

    if (!token) {
      this.status = 'idle';
      this.notifyStatus();
      return { success: false, reason: 'no_token', db: this.getCachedDb() };
    }

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notifyStatus();
      return { success: false, reason: 'offline', db: this.getCachedDb() };
    }

    this.status = 'syncing';
    this.lastError = null;
    this.notifyStatus();

    try {
      this.fetchUserInfo();

      // 1. Trova la cartella 'Gestione Tralci' (o fallback 'Gestionale Tralci' / 'Registro Chiesa')
      const safeFolderName = this.config.folderName.replace(/'/g, "\\'");
      const folderQuery = `(name = '${safeFolderName}' or name = 'Gestionale Tralci' or name = 'Registro Chiesa') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      let folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&pageSize=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (folderRes.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.downloadDb(true);
        throw new Error('Token scaduto. Effettua nuovamente l\'accesso.');
      }

      if (!folderRes.ok) {
        throw new Error(`Errore Drive (${folderRes.status}): ${folderRes.statusText}`);
      }

      const folderData = await folderRes.json();
      const folder = folderData.files && folderData.files[0];
      if (!folder) {
        this.status = 'idle';
        this.notifyStatus();
        return { success: false, reason: 'not_found', db: this.getCachedDb() };
      }

      // 2. Trova il file db.json nella cartella
      const fileQuery = `'${folder.id}' in parents and name = '${this.config.fileName}' and trashed = false`;
      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fileQuery)}&fields=files(id,name,modifiedTime)&pageSize=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (fileRes.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.downloadDb(true);
      }

      if (!fileRes.ok) {
        throw new Error(`Errore ricerca db.json (${fileRes.status})`);
      }

      const fileData = await fileRes.json();
      const file = fileData.files && fileData.files[0];
      if (!file) {
        this.status = 'idle';
        this.notifyStatus();
        return { success: false, reason: 'not_found', db: this.getCachedDb() };
      }

      // 3. Scarica il contenuto JSON
      const downloadRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (downloadRes.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.downloadDb(true);
      }

      if (!downloadRes.ok) {
        throw new Error(`Errore download db.json (${downloadRes.status})`);
      }

      const remoteDb = await downloadRes.json();
      this.setCachedDb(remoteDb);
      this.status = 'synced';
      this.notifyStatus();
      return { success: true, db: remoteDb, fileId: file.id, modifiedTime: file.modifiedTime || null };
    } catch (err) {
      console.error('Errore sincronizzazione Google Drive:', err);
      this.status = 'error';
      this.lastError = err.message || 'Errore di connessione';
      this.notifyStatus();
      return { success: false, reason: 'error', error: err.message, db: this.getCachedDb() };
    }
  }

  /**
   * Salva il database aggiornato su Google Drive (upload o update)
   */
  async uploadDb(dbObj, retried = false) {
    this.setCachedDb(dbObj);

    let token = await this.getValidToken();
    if (!token && !retried) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) return this.uploadDb(dbObj, true);
      token = this.getToken();
    }

    if (!token) {
      return { success: false, reason: 'no_token', localOnly: true };
    }

    if (!navigator.onLine) {
      this.status = 'offline';
      this.notifyStatus();
      return { success: false, reason: 'offline', localOnly: true };
    }

    this.status = 'syncing';
    this.notifyStatus();

    try {
      // 1. Trova o crea la cartella 'Gestione Tralci' (o fallback 'Gestionale Tralci' / 'Registro Chiesa')
      const safeUploadFolderName = this.config.folderName.replace(/'/g, "\\'");
      const uploadFolderQuery = `(name = '${safeUploadFolderName}' or name = 'Gestionale Tralci' or name = 'Registro Chiesa') and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      let folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(uploadFolderQuery)}&fields=files(id,name)&pageSize=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (folderRes.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.uploadDb(dbObj, true);
        throw new Error('Token scaduto.');
      }

      let folderData = await folderRes.json();
      let folderId = folderData.files && folderData.files[0]?.id;

      if (!folderId) {
        // Crea la cartella se non esiste
        const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: this.config.folderName,
            mimeType: 'application/vnd.google-apps.folder'
          })
        });
        const createdFolder = await createFolderRes.json();
        folderId = createdFolder.id;
      }

      // 2. Cerca se db.json esiste già nella cartella
      const fileQuery = `'${folderId}' in parents and name = '${this.config.fileName}' and trashed = false`;
      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(fileQuery)}&fields=files(id,name)&pageSize=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const fileData = await fileRes.json();
      const existingFile = fileData.files && fileData.files[0];

      const jsonStr = JSON.stringify(dbObj, null, 2);

      let uploadUrl, uploadMethod;
      if (existingFile) {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
        uploadMethod = 'PATCH';
      } else {
        uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
        uploadMethod = 'POST';
      }

      let res;
      if (existingFile) {
        res = await fetch(uploadUrl, {
          method: uploadMethod,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: jsonStr
        });
      } else {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelim = "\r\n--" + boundary + "--";
        const metadata = {
          name: this.config.fileName,
          parents: [folderId],
          mimeType: 'application/json'
        };
        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          jsonStr +
          closeDelim;

        res = await fetch(uploadUrl, {
          method: uploadMethod,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        });
      }

      if (res.status === 401 && !retried) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) return this.uploadDb(dbObj, true);
      }

      if (!res.ok) {
        throw new Error(`Errore upload (${res.status}): ${res.statusText}`);
      }

      localStorage.setItem(DB_SYNC_TIME_KEY, new Date().toISOString());
      this.status = 'synced';
      this.notifyStatus();
      return { success: true };
    } catch (err) {
      console.error('Errore salvataggio Google Drive:', err);
      this.status = 'error';
      this.lastError = err.message;
      this.notifyStatus();
      return { success: false, reason: 'error', error: err.message, localOnly: true };
    }
  }

  disconnect() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    localStorage.setItem(DRIVE_EXPLICIT_LOGOUT_KEY, 'true');
    localStorage.removeItem(DRIVE_TOKEN_KEY);
    localStorage.removeItem(DRIVE_TOKEN_EXPIRES_KEY);
    localStorage.removeItem(DRIVE_USER_INFO_KEY);
    for (const k of LEGACY_DRIVE_TOKEN_KEYS) localStorage.removeItem(k);
    for (const k of LEGACY_DRIVE_USER_INFO_KEYS) localStorage.removeItem(k);
    this.config.refreshToken = '';
    this.saveConfig(this.config);
    this.userInfo = null;
    this.lastError = null;
    this.status = 'idle';
    idbClearAuthSession().catch(() => {});
    this.notifyStatus();
  }
}

if (typeof window !== 'undefined') {
  window.driveClient = new DriveClient();
}
