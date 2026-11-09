// localDbEngine.js - Motore database locale autonomo per Registro di Chiesa Android
// Replica integralmente tutte le API REST di server.js in memoria locale e localStorage,
// garantendo funzionamento 100% offline nativo su Android e sincronizzazione Google Drive.
'use strict';

(function () {
  const DB_STORAGE_KEY = 'registro_chiesa_db';

  let db = {
    members: [],
    families: [],
    settings: {
      chiesa: "Chiesa Evangelica Pentecostale e Missionaria Come Tralci - Novara",
      pastore: "Bruno Astemio",
      indirizzo: "Via Andrea Costa 21",
      cap: "28100",
      citta: "Novara",
      provincia: "NO",
      telefono: "+39 0321 000000",
      email: "segreteria.cometralcinovara@gmail.com",
      cf: "94065600030"
    },
    auditLog: [],
    docCategories: [
      'Certificato di Battesimo',
      'Attestato di Trasferimento',
      'Documento di Identità / CF',
      'Modulo Privacy Firmato',
      'Certificato di Matrimonio',
      'Altro Documento'
    ]
  };

  let initialized = false;
  let initPromise = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function today() { return ymd(new Date()); }

  async function init() {
    if (initialized) return db;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // 1. Prova da storage interno nativo Android
      if (window.Android && typeof window.Android.readLocalDb === 'function') {
        try {
          const rawAndroid = window.Android.readLocalDb();
          if (rawAndroid && rawAndroid.trim().length > 10) {
            db = JSON.parse(rawAndroid);
            ensureDbDefaults();
            initialized = true;
            return db;
          }
        } catch (e) {
          console.warn('[LocalDB] Errore lettura da Android storage:', e);
        }
      }

      // 2. Prova da localStorage
      try {
        const rawLocal = localStorage.getItem(DB_STORAGE_KEY);
        if (rawLocal) {
          db = JSON.parse(rawLocal);
          ensureDbDefaults();
          initialized = true;
          return db;
        }
      } catch (e) {
        console.warn('[LocalDB] Errore lettura da localStorage:', e);
      }

      // 3. Carica seed default-db.json da assets
      try {
        const res = await fetch('default-db.json');
        if (res.ok) {
          const seedData = await res.json();
          db = seedData;
          ensureDbDefaults();
          saveDb(true);
          initialized = true;
          return db;
        }
      } catch (e) {
        console.warn('[LocalDB] Impossibile caricare default-db.json:', e);
      }

      ensureDbDefaults();
      initialized = true;
      return db;
    })();

    return initPromise;
  }

  function ensureDbDefaults() {
    db.members = Array.isArray(db.members) ? db.members : [];
    db.families = Array.isArray(db.families) ? db.families : [];
    db.settings = db.settings || {};
    db.auditLog = Array.isArray(db.auditLog) ? db.auditLog : [];
    if (!Array.isArray(db.docCategories) || db.docCategories.length === 0) {
      db.docCategories = [
        'Certificato di Battesimo',
        'Attestato di Trasferimento',
        'Documento di Identità / CF',
        'Modulo Privacy Firmato',
        'Certificato di Matrimonio',
        'Altro Documento'
      ];
    }
  }

  function saveDb(skipCloud = false) {
    ensureDbDefaults();
    const jsonStr = JSON.stringify(db, null, 2);

    try {
      localStorage.setItem(DB_STORAGE_KEY, jsonStr);
    } catch (e) {
      console.warn('[LocalDB] Errore salvataggio localStorage:', e);
    }

    if (window.Android && typeof window.Android.saveLocalDb === 'function') {
      try {
        window.Android.saveLocalDb(jsonStr);
      } catch (e) {
        console.warn('[LocalDB] Errore salvataggio Android:', e);
      }
    }

    if (!skipCloud && window.driveClient && window.driveClient.config && window.driveClient.config.autoSync) {
      window.driveClient.uploadDb(db).catch(err => {
        console.warn('[LocalDB] Errore autosync Google Drive:', err);
      });
    }
  }

  function audit(azione, entita, idEntita, dettagli) {
    db.auditLog = db.auditLog || [];
    db.auditLog.unshift({
      timestamp: new Date().toISOString(),
      azione,
      entita,
      idEntita,
      dettagli
    });
    if (db.auditLog.length > 500) {
      db.auditLog.pop();
    }
  }

  function computeNextProtocollo() {
    let max = 0;
    for (const m of db.members) {
      const p = Number(m.protocollo) || Number(m.id) || 0;
      if (p > max) max = p;
    }
    return max + 1;
  }

  function calcAge(d) {
    if (!d || !/^\d{4}/.test(d)) return null;
    const birthYear = parseInt(d.slice(0, 4), 10);
    return new Date().getFullYear() - birthYear;
  }

  function computeStats() {
    const total = db.members.length;
    const attivi = db.members.filter(m => (m.stato || 'Attivo') === 'Attivo');
    const effettivi = attivi.filter(m => m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua));
    const aderenti = attivi.filter(m => m.ruolo === 'Aderente' || (!m.ruolo && !m.battesimoAcqua));
    const vedove = attivi.filter(m => !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov'));
    const sostenuti = attivi.filter(m => !!m.isSostenuto);
    const nonAttivi = db.members.filter(m => (m.stato || 'Attivo') !== 'Attivo');

    const battesimiAcqua = db.members.filter(m => m.battesimoAcqua).length;
    const battesimiSpiritoSanto = db.members.filter(m => m.battesimoSpiritoSanto).length;
    const consensiWhatsApp = db.members.filter(m => m.consensoWhatsApp === 'Acconsentito').length;
    const consensiFotoVideo = db.members.filter(m => m.consensoFotoVideo === 'Acconsentito').length;

    const currentMonth = new Date().getMonth() + 1;
    const birthdaysThisMonth = db.members
      .filter(m => {
        if (!m.dataNascita) return false;
        const parts = m.dataNascita.split('-');
        return Number(parts[1]) === currentMonth;
      })
      .map(m => ({
        id: m.id,
        nome: `${m.cognome} ${m.nome}`,
        dataNascita: m.dataNascita,
        eta: calcAge(m.dataNascita)
      }))
      .sort((a, b) => (a.dataNascita || '').localeCompare(b.dataNascita || ''));

    const ageDist = { '0-17': 0, '18-29': 0, '30-49': 0, '50-69': 0, '70+': 0 };
    db.members.forEach(m => {
      const age = calcAge(m.dataNascita);
      if (age === null) return;
      if (age < 18) ageDist['0-17']++;
      else if (age < 30) ageDist['18-29']++;
      else if (age < 50) ageDist['30-49']++;
      else if (age < 70) ageDist['50-69']++;
      else ageDist['70+']++;
    });

    const comuniMap = {};
    db.members.forEach(m => {
      const c = (m.comune || 'Non specificato').trim();
      comuniMap[c] = (comuniMap[c] || 0) + 1;
    });

    return {
      total,
      attivi: attivi.length,
      effettivi: effettivi.length,
      aderenti: aderenti.length,
      vedove: vedove.length,
      sostenuti: sostenuti.length,
      nonAttivi: nonAttivi.length,
      battesimiAcqua,
      percAcqua: total ? Math.round((battesimiAcqua / total) * 100) : 0,
      battesimiSpiritoSanto,
      percSpiritoSanto: total ? Math.round((battesimiSpiritoSanto / total) * 100) : 0,
      consensiWhatsApp,
      consensiFotoVideo,
      birthdaysThisMonth,
      ageDist,
      comuniMap,
      families: db.families.length
    };
  }

  function generateCsv() {
    const headers = [
      'Protocollo',
      'Cognome',
      'Nome',
      'Luogo di Nascita',
      'Provincia Nascita',
      'Data di Nascita',
      'Età',
      'Codice Fiscale',
      'Stato Civile',
      'Indirizzo',
      'Comune',
      'Provincia',
      'Telefono',
      'Email',
      'Titolo di Studio',
      'Professione',
      'Battesimo in Acqua',
      'Data BA',
      'Battesimo Spirito Santo',
      'Data SS',
      'Ruolo',
      'Vedovo/a',
      'Sostenuto/a',
      'Dettaglio Sostegno',
      'Stato',
      'Consenso WhatsApp',
      'Consenso Foto/Video',
      'Note'
    ];

    const escapeCsv = v => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };

    const rows = db.members.map(m => {
      return [
        m.protocollo ?? m.id ?? '',
        m.cognome || '',
        m.nome || '',
        m.luogoNascita || '',
        m.provinciaNascita || '',
        m.dataNascita || '',
        calcAge(m.dataNascita) ?? '',
        m.codiceFiscale || '',
        m.statoCivile || '',
        m.indirizzo || '',
        m.comune || '',
        m.provincia || '',
        m.telefono || '',
        m.email || '',
        m.titoloStudio || '',
        m.professione || '',
        m.battesimoAcqua ? 'Sì' : 'No',
        m.dataBA || '',
        m.battesimoSpiritoSanto ? 'Sì' : 'No',
        m.dataSS || '',
        m.ruolo || (m.battesimoAcqua ? 'Effettivo' : 'Aderente'),
        m.isVedovo ? 'Sì' : 'No',
        m.isSostenuto ? 'Sì' : 'No',
        m.dettaglioSostegno || '',
        m.stato || 'Attivo',
        m.consensoWhatsApp || '',
        m.consensoFotoVideo || '',
        m.note || ''
      ].map(escapeCsv).join(';');
    });

    return '\uFEFF' + [headers.map(escapeCsv).join(';'), ...rows].join('\r\n');
  }

  /**
   * Router centrale delle richieste per la versione autonoma Android
   */
  async function handle(path, options = {}) {
    await init();

    const method = (options.method || 'GET').toUpperCase();
    const parsedUrl = new URL(path, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.searchParams;
    let body = {};

    if (options.body) {
      try {
        body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      } catch (_) {
        body = {};
      }
    }

    // 1. MEMBRI
    if (pathname === '/api/members' && method === 'GET') {
      return db.members;
    }

    if (pathname === '/api/members/next-protocollo' && method === 'GET') {
      return { nextProtocollo: computeNextProtocollo() };
    }

    const memberIdMatch = pathname.match(/^\/api\/members\/(\d+)$/);
    if (memberIdMatch && method === 'GET') {
      const id = Number(memberIdMatch[1]);
      const m = db.members.find(x => x.id === id);
      if (!m) throw new Error('Membro non trovato');
      return m;
    }

    if (pathname === '/api/members' && method === 'POST') {
      const nextId = Math.max(0, ...db.members.map(x => Number(x.id) || 0)) + 1;
      const nextProt = computeNextProtocollo();
      const newMember = {
        id: nextId,
        uuid: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        }),
        protocollo: Number(body.protocollo) || nextProt,
        cognome: (body.cognome || '').trim(),
        nome: (body.nome || '').trim(),
        luogoNascita: (body.luogoNascita || '').trim(),
        provinciaNascita: (body.provinciaNascita || '').trim().toUpperCase(),
        dataNascita: (body.dataNascita || '').trim(),
        codiceFiscale: (body.codiceFiscale || '').trim().toUpperCase(),
        indirizzo: (body.indirizzo || '').trim(),
        comune: (body.comune || '').trim(),
        provincia: (body.provincia || '').trim().toUpperCase(),
        telefono: (body.telefono || '').trim(),
        email: (body.email || '').trim().toLowerCase(),
        titoloStudio: (body.titoloStudio || '').trim(),
        professione: (body.professione || '').trim(),
        battesimoAcqua: !!body.battesimoAcqua,
        dataBA: (body.dataBA || '').trim(),
        battesimoSpiritoSanto: !!body.battesimoSpiritoSanto,
        dataSS: (body.dataSS || '').trim(),
        consensoWhatsApp: body.consensoWhatsApp || 'Non specificato',
        consensoFotoVideo: body.consensoFotoVideo || 'Non specificato',
        stato: body.stato || 'Attivo',
        note: (body.note || '').trim(),
        ruolo: body.ruolo || (body.battesimoAcqua ? 'Effettivo' : 'Aderente'),
        isVedovo: !!body.isVedovo,
        isSostenuto: !!body.isSostenuto,
        statoCivile: body.statoCivile || '',
        dettaglioSostegno: (body.dettaglioSostegno || '').trim(),
        allegati: [],
        creatoIl: new Date().toISOString()
      };

      db.members.push(newMember);
      audit('creazione', 'membro', newMember.id, `Creato membro ${newMember.cognome} ${newMember.nome}`);
      saveDb();
      return newMember;
    }

    if (memberIdMatch && method === 'PUT') {
      const id = Number(memberIdMatch[1]);
      const idx = db.members.findIndex(x => x.id === id);
      if (idx === -1) throw new Error('Membro non trovato');

      const cur = db.members[idx];
      const updated = {
        ...cur,
        ...body,
        id: cur.id,
        uuid: cur.uuid,
        protocollo: body.protocollo !== undefined ? (Number(body.protocollo) || cur.protocollo) : cur.protocollo,
        allegati: body.allegati || cur.allegati || [],
        modificatoIl: new Date().toISOString()
      };

      db.members[idx] = updated;
      audit('modifica', 'membro', id, `Modificato membro ${updated.cognome} ${updated.nome}`);
      saveDb();
      return updated;
    }

    if (memberIdMatch && method === 'DELETE') {
      const id = Number(memberIdMatch[1]);
      const idx = db.members.findIndex(x => x.id === id);
      if (idx === -1) throw new Error('Membro non trovato');

      const deleted = db.members.splice(idx, 1)[0];
      // Rimuove da eventuali nuclei familiari
      db.families.forEach(f => {
        if (f.memberIds) f.memberIds = f.memberIds.filter(mid => mid !== id);
        if (f.members) f.members = f.members.filter(m => (m.memberId || m.id) !== id);
      });

      audit('eliminazione', 'membro', id, `Eliminato membro ${deleted.cognome} ${deleted.nome}`);
      saveDb();
      return { ok: true };
    }

    // 2. ALLEGATI
    const attListMatch = pathname.match(/^\/api\/members\/(\d+)\/attachments$/);
    if (attListMatch && method === 'POST') {
      const id = Number(attListMatch[1]);
      const member = db.members.find(x => x.id === id);
      if (!member) throw new Error('Membro non trovato');

      member.allegati = member.allegati || [];
      const newAtt = {
        id: 'att_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        fileName: body.fileName || 'allegato',
        titolo: body.titolo || body.fileName || 'Documento',
        categoria: body.categoria || 'Altro Documento',
        mimeType: body.mimeType || 'application/octet-stream',
        sizeBytes: body.sizeBytes || 0,
        sizeFormatted: body.sizeFormatted || '1 KB',
        dataCaricamento: new Date().toISOString(),
        dataBase64: body.dataBase64 || null,
        storage: 'local_android'
      };

      member.allegati.push(newAtt);
      audit('allegato_caricato', 'membro', id, `Caricato allegato "${newAtt.titolo}"`);
      saveDb();
      return { ok: true, attachment: newAtt };
    }

    const attDelMatch = pathname.match(/^\/api\/members\/(\d+)\/attachments\/([^/]+)$/);
    if (attDelMatch && method === 'DELETE') {
      const id = Number(attDelMatch[1]);
      const attId = attDelMatch[2];
      const member = db.members.find(x => x.id === id);
      if (!member) throw new Error('Membro non trovato');

      member.allegati = (member.allegati || []).filter(a => a.id !== attId);
      audit('allegato_eliminato', 'membro', id, `Eliminato allegato ${attId}`);
      saveDb();
      return { ok: true };
    }

    // 3. STATISTICHE
    if (pathname === '/api/stats' && method === 'GET') {
      return computeStats();
    }

    // 4. FAMIGLIE
    if (pathname === '/api/families' && method === 'GET') {
      const assignedIds = new Set();
      db.families.forEach(f => {
        (f.memberIds || []).forEach(mid => assignedIds.add(mid));
        (f.members || []).forEach(m => assignedIds.add(m.memberId || m.id));
      });
      const unassigned = db.members.filter(m => !assignedIds.has(m.id));
      return { families: db.families, unassignedMembers: unassigned };
    }

    if (pathname === '/api/families' && method === 'POST') {
      const newFam = {
        id: 'fam_' + Date.now().toString(36),
        nome: (body.nome || '').trim() || 'Nuovo Nucleo Familiare',
        note: (body.note || '').trim(),
        memberIds: [],
        members: []
      };
      db.families.push(newFam);
      audit('creazione', 'famiglia', newFam.id, `Creata famiglia ${newFam.nome}`);
      saveDb();
      return newFam;
    }

    const famIdMatch = pathname.match(/^\/api\/families\/([^/]+)$/);
    if (famIdMatch && method === 'PUT') {
      const famId = famIdMatch[1];
      const fam = db.families.find(f => f.id === famId);
      if (!fam) throw new Error('Famiglia non trovata');

      if (body.nome !== undefined) fam.nome = String(body.nome).trim();
      if (body.note !== undefined) fam.note = String(body.note).trim();

      audit('modifica', 'famiglia', famId, `Modificata famiglia ${fam.nome}`);
      saveDb();
      return fam;
    }

    if (famIdMatch && method === 'DELETE') {
      const famId = famIdMatch[1];
      const idx = db.families.findIndex(f => f.id === famId);
      if (idx === -1) throw new Error('Famiglia non trovata');

      const deleted = db.families.splice(idx, 1)[0];
      audit('eliminazione', 'famiglia', famId, `Eliminata famiglia ${deleted.nome}`);
      saveDb();
      return { ok: true };
    }

    const famAddMatch = pathname.match(/^\/api\/families\/([^/]+)\/add-member$/);
    if (famAddMatch && method === 'POST') {
      const famId = famAddMatch[1];
      const fam = db.families.find(f => f.id === famId);
      if (!fam) throw new Error('Famiglia non trovata');

      const memberId = Number(body.memberId);
      const ruolo = body.ruolo || 'Membro';

      fam.members = fam.members || [];
      fam.memberIds = fam.memberIds || [];

      // Rimuove da altre famiglie per evitare duplicazioni
      db.families.forEach(other => {
        if (other.id !== famId) {
          other.members = (other.members || []).filter(m => (m.memberId || m.id) !== memberId);
          other.memberIds = (other.memberIds || []).filter(mid => mid !== memberId);
        }
      });

      if (!fam.memberIds.includes(memberId)) {
        fam.memberIds.push(memberId);
      }
      fam.members = fam.members.filter(m => (m.memberId || m.id) !== memberId);
      fam.members.push({ memberId, ruolo });

      audit('aggiunta_membro_famiglia', 'famiglia', famId, `Aggiunto membro ${memberId} a ${fam.nome}`);
      saveDb();
      return { ok: true, family: fam };
    }

    const famRemMatch = pathname.match(/^\/api\/families\/([^/]+)\/remove-member$/);
    if (famRemMatch && method === 'POST') {
      const famId = famRemMatch[1];
      const fam = db.families.find(f => f.id === famId);
      if (!fam) throw new Error('Famiglia non trovata');

      const memberId = Number(body.memberId);
      fam.memberIds = (fam.memberIds || []).filter(mid => mid !== memberId);
      fam.members = (fam.members || []).filter(m => (m.memberId || m.id) !== memberId);

      audit('rimozione_membro_famiglia', 'famiglia', famId, `Rimosso membro ${memberId} da ${fam.nome}`);
      saveDb();
      return { ok: true, family: fam };
    }

    // 5. IMPOSTAZIONI & CATEGORIE
    if (pathname === '/api/settings' && method === 'GET') {
      return db.settings || {};
    }

    if (pathname === '/api/settings' && method === 'POST') {
      db.settings = { ...db.settings, ...body };
      audit('aggiornamento', 'impostazioni', 'global', 'Modificate impostazioni generali');
      saveDb();
      return db.settings;
    }

    if (pathname === '/api/settings/doc-categories' && method === 'GET') {
      return { categories: db.docCategories || [] };
    }

    if (pathname === '/api/settings/doc-categories' && method === 'POST') {
      const { action, category, oldName, newName } = body;
      db.docCategories = db.docCategories || [];

      if (action === 'add' && category) {
        const cat = category.trim();
        if (cat && !db.docCategories.includes(cat)) {
          db.docCategories.push(cat);
        }
      } else if (action === 'rename' && oldName && newName) {
        const idx = db.docCategories.indexOf(oldName.trim());
        if (idx !== -1) {
          db.docCategories[idx] = newName.trim();
          // Aggiorna anche gli allegati dei membri
          db.members.forEach(m => {
            (m.allegati || []).forEach(a => {
              if (a.categoria === oldName.trim()) a.categoria = newName.trim();
            });
          });
        }
      } else if (action === 'delete' && category) {
        db.docCategories = db.docCategories.filter(c => c !== category.trim());
      }

      saveDb();
      return { categories: db.docCategories };
    }

    // 6. ESPORTAZIONE E IMPORTAZIONE
    if (pathname === '/api/export/csv' && method === 'GET') {
      return { csv: generateCsv() };
    }

    if (pathname === '/api/export/json' && method === 'GET') {
      return db;
    }

    if (pathname === '/api/import/json' && method === 'POST') {
      if (!body || !Array.isArray(body.members)) {
        throw new Error('Formato backup JSON non valido. Array "members" assente.');
      }
      db.members = body.members;
      if (Array.isArray(body.families)) db.families = body.families;
      if (body.settings) db.settings = { ...db.settings, ...body.settings };
      if (Array.isArray(body.docCategories)) db.docCategories = body.docCategories;
      audit('ripristino_backup', 'sistema', 'json', `Importati ${db.members.length} membri da backup`);
      saveDb();
      return { ok: true, count: db.members.length };
    }

    // 7. CLOUD & GOOGLE DRIVE
    if (pathname === '/api/cloud/status' && method === 'GET') {
      if (window.driveClient) {
        const info = window.driveClient.getUserInfo();
        const token = window.driveClient.getToken();
        const hasAuth = !!(token || window.driveClient.config.refreshToken);
        const isConn = hasAuth && !!info && !window.driveClient.lastError;
        return {
          connected: isConn,
          configured: !!window.driveClient.config.clientId,
          hasCredentials: !!window.driveClient.config.clientId,
          accountEmail: isConn && info ? info.email : null,
          accountName: isConn && info ? info.name : null,
          folderName: window.driveClient.config.folderName || 'Registro Chiesa',
          lastSync: window.driveClient.getLastSyncTime(),
          lastSyncStatus: window.driveClient.status,
          autoSync: window.driveClient.config.autoSync
        };
      }
      return { connected: false, configured: false };
    }

    if (pathname === '/api/cloud/config' && method === 'POST') {
      if (window.driveClient) {
        window.driveClient.saveConfig(body);
        return { ok: true };
      }
      return { ok: false };
    }

    if (pathname === '/api/cloud/import-secret' && method === 'POST') {
      if (window.driveClient) {
        const creds = body.installed || body.web || body;
        window.driveClient.saveConfig({
          clientId: creds.client_id || creds.clientId,
          clientSecret: creds.client_secret || creds.clientSecret
        });
        return { ok: true };
      }
      return { ok: false };
    }

    if (pathname === '/api/cloud/auth-url' && method === 'GET') {
      const clientId = window.driveClient?.config?.clientId || DEFAULT_CONFIG.clientId;
      const redirectUri = 'org.cometralci.registrodichiesa://oauth2callback';
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid');
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      return { url };
    }

    if (pathname === '/api/cloud/sync-now' || pathname === '/api/cloud/sync-and-reconcile') {
      if (window.driveClient) {
        const res = await window.driveClient.uploadDb(db);
        if (!res.success && res.reason === 'no_token') {
          throw new Error('Google Drive non collegato');
        }
        return { ok: true, status: 'success' };
      }
      return { ok: false };
    }

    if (pathname === '/api/cloud/restore-latest' && method === 'POST') {
      if (window.driveClient) {
        const res = await window.driveClient.downloadDb();
        if (res.success && res.db) {
          db = res.db;
          ensureDbDefaults();
          saveDb(true);
          return { ok: true, membersCount: db.members.length };
        }
        throw new Error(res.error || 'Impossibile ripristinare il backup da Google Drive');
      }
      throw new Error('Modulo Drive non inizializzato');
    }

    if (pathname === '/api/cloud/disconnect' && method === 'POST') {
      if (window.driveClient) {
        window.driveClient.disconnect();
      }
      return { ok: true, connected: false };
    }

    if (pathname === '/api/app/quit' && method === 'POST') {
      return { ok: true };
    }

    throw new Error(`Endpoint non supportato: ${method} ${pathname}`);
  }

  window.LocalDbEngine = {
    init,
    handle,
    saveDb,
    getDb: () => db,
    computeStats,
    generateCsv
  };
})();
