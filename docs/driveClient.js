// driveClient.js - Modulo client-side Google Drive v3 per Registro di Chiesa Android
// Supporta sincronizzazione cloud bidirezionale, upload/download db.json,
// rinnovo automatico token OAuth e archiviazione cache locale offline.
'use strict';

const DRIVE_CONFIG_KEY = 'registro_chiesa_drive_config';
const DRIVE_TOKEN_KEY = 'registro_chiesa_drive_token';
const DB_CACHE_KEY = 'registro_chiesa_db_cache';
const DB_SYNC_TIME_KEY = 'registro_chiesa_db_synced_at';
const DRIVE_USER_INFO_KEY = 'registro_chiesa_drive_userinfo';

const DEFAULT_CONFIG = {
  clientId: '258159664417-nc6r2krvqu8fvutoa1p9j3b81agrugqs.apps.googleusercontent.com',
  clientSecret: '',
  refreshToken: '',
  folderName: 'Registro Chiesa',
  fileName: 'db.json',
  autoSync: false
};

class DriveClient {
  constructor() {
    this.config = this.loadConfig();
    this.status = 'idle'; // 'idle' | 'syncing' | 'synced' | 'error' | 'offline'
    this.lastError = null;
    this.onStatusChange = null;
    this.userInfo = null;
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem(DRIVE_CONFIG_KEY);
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch (_) {}
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    localStorage.setItem(DRIVE_CONFIG_KEY, JSON.stringify(this.config));
    this.notifyStatus();
  }

  getToken() {
    try {
      const saved = localStorage.getItem(DRIVE_TOKEN_KEY);
      if (saved && saved.trim()) return saved.trim();
    } catch (_) {}
    return null;
  }

  setToken(token) {
    if (token) {
      localStorage.setItem(DRIVE_TOKEN_KEY, token.trim());
    } else {
      localStorage.removeItem(DRIVE_TOKEN_KEY);
    }
    this.notifyStatus();
  }

  getUserInfo() {
    if (!this.getToken() && !this.config.refreshToken) {
      return null;
    }
    if (this.userInfo) return this.userInfo;
    try {
      const saved = localStorage.getItem(DRIVE_USER_INFO_KEY);
      if (saved) {
        this.userInfo = JSON.parse(saved);
        return this.userInfo;
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
        this.userInfo = info;
        localStorage.setItem(DRIVE_USER_INFO_KEY, JSON.stringify(info));
        return info;
      }
    } catch (_) {}
    return null;
  }

  notifyStatus() {
    const hasAuth = !!(this.getToken() || this.config.refreshToken);
    if (typeof this.onStatusChange === 'function') {
      this.onStatusChange({
        status: this.status,
        lastError: this.lastError,
        lastSync: this.getLastSyncTime(),
        hasToken: !!this.getToken(),
        userInfo: this.getUserInfo(),
        connected: hasAuth && !this.lastError
      });
    }
  }

  async refreshAccessToken() {
    if (window.PwaGoogle && typeof window.PwaGoogle.silentRefresh === 'function') {
      try {
        const token = await window.PwaGoogle.silentRefresh();
        if (token) {
          this.setToken(token);
          this.fetchUserInfo();
          return true;
        }
      } catch (e) {
        console.warn('[DriveClient] PWA silentRefresh:', e);
      }
    }
    if (!this.config.refreshToken || !this.config.clientSecret) {
      return false;
    }
    try {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: 'refresh_token'
      });
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.access_token) {
          this.setToken(data.access_token);
          this.fetchUserInfo();
          return true;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'invalid_grant' || (errData.error_description || '').includes('expired or revoked')) {
          console.warn('[DriveClient] Refresh token scaduto o revocato da Google. Esecuzione disconnessione.');
          this.disconnect();
          this.status = 'error';
          this.lastError = 'Sessione Google Drive scaduta o revocata. Ricollegati nelle Impostazioni.';
          this.notifyStatus();
          return false;
        }
      }
    } catch (err) {
      console.warn('Errore rinnovo automatico token Google Drive:', err);
    }
    return false;
  }

  getCachedDb() {
    try {
      const raw = localStorage.getItem(DB_CACHE_KEY);
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
    return localStorage.getItem(DB_SYNC_TIME_KEY);
  }

  /**
   * Sincronizza scaricando db.json da Google Drive
   */
  async downloadDb(retried = false) {
    let token = this.getToken();
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

      // 1. Trova la cartella 'Registro Chiesa'
      const folderQuery = `name = '${this.config.folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
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
        throw new Error(`Cartella "${this.config.folderName}" non trovata su Google Drive.`);
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
        throw new Error(`File "${this.config.fileName}" non trovato nella cartella "${this.config.folderName}".`);
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
      return { success: true, db: remoteDb, fileId: file.id };
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

    let token = this.getToken();
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
      // 1. Trova o crea la cartella 'Registro Chiesa'
      const folderQuery = `name = '${this.config.folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      let folderRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)&pageSize=5`,
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
    this.setToken(null);
    this.config.refreshToken = '';
    this.saveConfig(this.config);
    localStorage.removeItem(DRIVE_USER_INFO_KEY);
    this.userInfo = null;
    this.status = 'idle';
    this.notifyStatus();
  }
}

if (typeof window !== 'undefined') {
  window.driveClient = new DriveClient();
}
