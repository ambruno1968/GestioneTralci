// localDbEngine.js - Motore database locale autonomo per GestioneTralci PWA
// Replica integralmente tutte le API REST di gestione anagrafica, registri e famiglie
// garantendo funzionamento 100% offline-first nel browser e sincronizzazione Google Drive.
'use strict';

(function () {
  const DB_STORAGE_KEY = 'gestione_tralci_db';
  const LEGACY_DB_STORAGE_KEYS = ['gestionale_tralci_db', 'registro_chiesa_db'];
  const DB_PENDING_SYNC_KEY = 'gestione_tralci_pending_sync';
  const DB_IS_SEED_KEY = 'gestione_tralci_is_seed';

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
      // 1. Prova da storage interno nativo Android (se presente)
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

      // 2. Prova da localStorage (chiave principale GestioneTralci o migrazione da gestionale_tralci / registro_chiesa)
      try {
        let rawLocal = localStorage.getItem(DB_STORAGE_KEY);
        if (!rawLocal) {
          for (const legacyKey of LEGACY_DB_STORAGE_KEYS) {
            rawLocal = localStorage.getItem(legacyKey);
            if (rawLocal) {
              localStorage.setItem(DB_STORAGE_KEY, rawLocal);
              break;
            }
          }
        }
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
          try { localStorage.setItem(DB_IS_SEED_KEY, 'true'); } catch (_) {}
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

  let uploadDebounceTimer = null;
  let syncPromise = null;

  function saveDb(skipCloud = false) {
    ensureDbDefaults();
    if (!skipCloud) {
      db.lastModified = new Date().toISOString();
      try {
        localStorage.removeItem(DB_IS_SEED_KEY);
        localStorage.setItem(DB_PENDING_SYNC_KEY, 'true');
      } catch (_) {}
    }
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
      if (uploadDebounceTimer) clearTimeout(uploadDebounceTimer);
      uploadDebounceTimer = setTimeout(() => {
        window.driveClient.uploadDb(db).then(res => {
          if (res && res.success) {
            try { localStorage.removeItem(DB_PENDING_SYNC_KEY); } catch (_) {}
          }
        }).catch(err => {
          console.warn('[LocalDB] Errore autosync Google Drive:', err);
        });
      }, 300);
    }
  }

  // Sincronizzazione Drive-First: garantisce che Google Drive prevalga sugli archivi locali obsoleti
  async function syncWithDrive(options = {}) {
    const forcePull = !!options.forcePull;
    if (syncPromise) return syncPromise;

    syncPromise = (async () => {
      await init();
      if (!window.driveClient) {
        return { ok: false, updated: false, reason: 'no_drive_client' };
      }
      if (window.driveClient.sessionReadyPromise) {
        try { await window.driveClient.sessionReadyPromise; } catch (_) {}
      }
      if (!window.driveClient.isConnected()) {
        return { ok: false, updated: false, reason: 'not_connected' };
      }
      if (!navigator.onLine) {
        return { ok: false, updated: false, reason: 'offline' };
      }

      const res = await window.driveClient.downloadDb();

      if (res && res.success && res.db) {
        const remoteDb = res.db;
        const remoteTime = Date.parse(remoteDb.lastModified || res.modifiedTime || '') || 0;
        const localTime = Date.parse(db.lastModified || '') || 0;
        const isSeed = localStorage.getItem(DB_IS_SEED_KEY) === 'true';
        const hasPending = localStorage.getItem(DB_PENDING_SYNC_KEY) === 'true';

        // Google Drive ha precedenza a meno che non ci siano modifiche locali pendenti più recenti
        const driveWins = forcePull || isSeed || !hasPending || (remoteTime >= localTime);

        if (driveWins) {
          db = remoteDb;
          ensureDbDefaults();
          if (!db.lastModified && res.modifiedTime) {
            db.lastModified = res.modifiedTime;
          }
          try {
            localStorage.removeItem(DB_IS_SEED_KEY);
            localStorage.removeItem(DB_PENDING_SYNC_KEY);
          } catch (_) {}
          saveDb(true);
          return {
            ok: true,
            updated: true,
            direction: 'pull',
            count: db.members.length
          };
        } else {
          // Modifiche locali offline più recenti: carica su Drive
          const upRes = await window.driveClient.uploadDb(db);
          if (upRes && upRes.success) {
            try { localStorage.removeItem(DB_PENDING_SYNC_KEY); } catch (_) {}
          }
          return {
            ok: !!(upRes && upRes.success),
            updated: false,
            direction: 'push',
            count: db.members.length
          };
        }
      }

      if (res && res.reason === 'not_found') {
        if (forcePull) {
          throw new Error('Nessun database trovato su Google Drive nella cartella "' + (window.driveClient.config?.folderName || 'Gestione Tralci') + '".');
        }
        // Primo avvio su Drive: inizializza db.json sul cloud
        const upRes = await window.driveClient.uploadDb(db);
        if (upRes && upRes.success) {
          try {
            localStorage.removeItem(DB_IS_SEED_KEY);
            localStorage.removeItem(DB_PENDING_SYNC_KEY);
          } catch (_) {}
        }
        return {
          ok: !!(upRes && upRes.success),
          updated: false,
          direction: 'push',
          count: db.members.length
        };
      }

      if (forcePull) {
        throw new Error((res && res.error) || 'Impossibile scaricare il database da Google Drive');
      }
      return { ok: false, updated: false, reason: (res && res.reason) || 'error' };
    })();

    try {
      return await syncPromise;
    } finally {
      syncPromise = null;
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
      const activeMembers = (db.members || []).filter(m => (m.stato || 'Attivo') === 'Attivo');
      const activeMembersMap = new Map(activeMembers.map(m => [m.id, m]));
      const assignedMemberIds = new Set();

      const families = [];
      (db.families || []).forEach(f => {
        const rawIds = Array.isArray(f.memberIds) ? f.memberIds : (Array.isArray(f.members) ? f.members.map(m => m.id || m.memberId) : []);
        const activeMemberIds = rawIds.filter(id => activeMembersMap.has(id));
        if (activeMemberIds.length === 0) return;

        activeMemberIds.forEach(id => assignedMemberIds.add(id));
        const resolvedMembers = activeMemberIds.map(id => activeMembersMap.get(id));

        let capofamiglia = null;
        let capofamigliaId = null;
        if (f.capofamigliaId && activeMembersMap.has(f.capofamigliaId)) {
          capofamiglia = activeMembersMap.get(f.capofamigliaId);
          capofamigliaId = f.capofamigliaId;
        } else if (resolvedMembers.length > 0) {
          capofamiglia = resolvedMembers[0];
          capofamigliaId = capofamiglia.id;
        }

        families.push({
          id: f.id,
          nome: f.nome || 'Famiglia senza nome',
          indirizzo: f.indirizzo || (capofamiglia?.indirizzo || ''),
          comune: f.comune || (capofamiglia?.comune || ''),
          provincia: f.provincia || (capofamiglia?.provincia || ''),
          note: f.note || '',
          capofamigliaId,
          capofamiglia: capofamiglia ? { id: capofamiglia.id, nome: `${capofamiglia.cognome} ${capofamiglia.nome}` } : null,
          memberIds: activeMemberIds,
          membri: resolvedMembers
        });
      });

      const unassignedMembers = activeMembers.filter(m => !assignedMemberIds.has(m.id));

      return {
        families,
        unassignedMembers,
        totalFamilies: families.length,
        totalAssignedMembers: assignedMemberIds.size,
        totalUnassignedMembers: unassignedMembers.length
      };
    }

    if (pathname === '/api/families' && method === 'POST') {
      const memberIds = Array.isArray(body.memberIds)
        ? body.memberIds.map(Number).filter(n => !isNaN(n) && db.members.some(m => m.id === n && (m.stato || 'Attivo') === 'Attivo'))
        : [];

      db.families = db.families || [];
      db.families.forEach(f => {
        f.memberIds = (f.memberIds || []).filter(mId => !memberIds.includes(mId));
        if (f.capofamigliaId && memberIds.includes(f.capofamigliaId)) f.capofamigliaId = null;
      });

      const newFamily = {
        id: 'fam_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
        nome: (body.nome || '').trim() || 'Nuovo Nucleo Familiare',
        indirizzo: (body.indirizzo || '').trim(),
        comune: (body.comune || '').trim(),
        provincia: (body.provincia || '').trim().toUpperCase(),
        capofamigliaId: body.capofamigliaId ? Number(body.capofamigliaId) : (memberIds[0] || null),
        note: (body.note || '').trim(),
        memberIds
      };
      db.families.push(newFamily);
      audit('creazione', 'famiglia', newFamily.id, `Creato nucleo familiare ${newFamily.nome}`);
      saveDb();
      return { success: true, family: newFamily };
    }

    const famIdMatch = pathname.match(/^\/api\/families\/([^/]+)$/);
    if (famIdMatch && method === 'PUT') {
      const famId = famIdMatch[1];
      const fam = (db.families || []).find(f => f.id === famId);
      if (!fam) throw new Error('Gruppo familiare non trovato');

      const memberIds = Array.isArray(body.memberIds)
        ? body.memberIds.map(Number).filter(n => !isNaN(n))
        : (fam.memberIds || []);

      db.families.forEach(other => {
        if (other.id !== famId) {
          other.memberIds = (other.memberIds || []).filter(mId => !memberIds.includes(mId));
          if (other.capofamigliaId && memberIds.includes(other.capofamigliaId)) other.capofamigliaId = null;
        }
      });

      if (body.nome !== undefined) fam.nome = String(body.nome).trim();
      if (body.indirizzo !== undefined) fam.indirizzo = String(body.indirizzo).trim();
      if (body.comune !== undefined) fam.comune = String(body.comune).trim();
      if (body.provincia !== undefined) fam.provincia = String(body.provincia).trim().toUpperCase();
      if (body.note !== undefined) fam.note = String(body.note).trim();
      fam.memberIds = memberIds;
      if (body.capofamigliaId !== undefined) {
        fam.capofamigliaId = body.capofamigliaId ? Number(body.capofamigliaId) : (memberIds[0] || null);
      }
      audit('modifica', 'famiglia', famId, `Modificato gruppo familiare ${fam.nome}`);
      saveDb();
      return { success: true, family: fam };
    }

    if (famIdMatch && method === 'DELETE') {
      const famId = famIdMatch[1];
      const idx = (db.families || []).findIndex(f => f.id === famId);
      if (idx === -1) throw new Error('Famiglia non trovata');

      const deleted = db.families.splice(idx, 1)[0];
      audit('eliminazione', 'famiglia', famId, `Eliminata famiglia ${deleted.nome}`);
      saveDb();
      return { ok: true, removed: deleted };
    }

    const famAddMatch = pathname.match(/^\/api\/families\/([^/]+)\/add-member$/);
    if (famAddMatch && method === 'POST') {
      const famId = famAddMatch[1];
      const fam = (db.families || []).find(f => f.id === famId);
      if (!fam) throw new Error('Famiglia non trovata');

      const memberId = Number(body.memberId);
      db.families.forEach(other => {
        other.memberIds = (other.memberIds || []).filter(mId => mId !== memberId);
        if (other.capofamigliaId === memberId && other.id !== famId) other.capofamigliaId = null;
      });

      fam.memberIds = fam.memberIds || [];
      if (!fam.memberIds.includes(memberId)) {
        fam.memberIds.push(memberId);
      }
      if (!fam.capofamigliaId) fam.capofamigliaId = memberId;

      audit('aggiunta_membro_famiglia', 'famiglia', famId, `Aggiunto membro ${memberId} a ${fam.nome}`);
      saveDb();
      return { success: true, family: fam };
    }

    const famRemMatch = pathname.match(/^\/api\/families\/([^/]+)\/remove-member$/);
    if (famRemMatch && method === 'POST') {
      const famId = famRemMatch[1];
      const fam = (db.families || []).find(f => f.id === famId);
      if (!fam) throw new Error('Famiglia non trovata');

      const memberId = Number(body.memberId);
      fam.memberIds = (fam.memberIds || []).filter(mid => mid !== memberId);
      if (fam.capofamigliaId === memberId) {
        fam.capofamigliaId = fam.memberIds[0] || null;
      }

      audit('rimozione_membro_famiglia', 'famiglia', famId, `Rimosso membro ${memberId} da ${fam.nome}`);
      saveDb();
      return { success: true, family: fam };
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
        const isConn = window.driveClient.isConnected();
        return {
          connected: isConn,
          configured: !!(window.driveClient.config && window.driveClient.config.clientId),
          hasCredentials: !!(window.driveClient.config && window.driveClient.config.clientId),
          clientId: window.driveClient.config?.clientId || '',
          accountEmail: isConn && info ? info.email : null,
          accountName: isConn && info ? info.name : null,
          folderName: window.driveClient.config.folderName || 'Gestione Tralci',
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
      const clientId = window.driveClient?.config?.clientId || '944725762658-ocihkj4r8b5usbitr35p32ai0agkubkb.apps.googleusercontent.com';
      const redirectUri = 'org.cometralci.registrodichiesa://oauth2callback';
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid');
      const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
      return { url };
    }

    if (pathname === '/api/cloud/sync-now' || pathname === '/api/cloud/sync-and-reconcile') {
      if (window.driveClient) {
        if (!window.driveClient.isConnected()) {
          throw new Error('Google Drive non collegato');
        }
        const syncRes = await syncWithDrive();
        if (!syncRes.ok) {
          throw new Error(syncRes.error || 'Errore sincronizzazione con Google Drive');
        }
        const totalAttachments = db.members.reduce((sum, m) => sum + (Array.isArray(m.attachments) ? m.attachments.length : 0), 0);
        return {
          ok: true,
          status: 'success',
          direction: syncRes.direction,
          updated: syncRes.updated,
          totalMembers: db.members.length,
          totalAttachments,
          reconciledCount: 0
        };
      }
      return { ok: false };
    }

    if (pathname === '/api/cloud/restore-latest' && method === 'POST') {
      if (window.driveClient) {
        const syncRes = await syncWithDrive({ forcePull: true });
        return { ok: true, count: syncRes.count, membersCount: syncRes.count };
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
    syncWithDrive,
    getDb: () => db,
    computeStats,
    generateCsv
  };
})();
