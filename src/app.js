'use strict';
/**
 * Frontend SPA per "Registro di Chiesa".
 * Gestisce l'anagrafica, i sacramenti battesimali, i nuclei familiari,
 * la rubrica e consensi privacy, esportazioni e stampe ufficiali A4.
 */

const state = {
  members: [],
  settings: {},
  stats: null,
  families: [],
  cloudStatus: null,
  currentTab: 'tutti',
  search: '',
  filterStatoCivile: '',
  filterBA: '',
  filterSS: '',
  filterComune: '',
  sortField: 'cognome',
  sortDir: 'asc'
};

const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- Toast & Notifiche
function toast(msg, type = 'ok') {
  const c = $('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `${type === 'ok' ? '✓' : '⚠️'} <span>${escapeHtml(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 250);
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(d) {
  if (!d) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  return d;
}

function calcAge(d) {
  if (!d || !/^\d{4}/.test(d)) return null;
  const birthYear = parseInt(d.slice(0, 4), 10);
  return new Date().getFullYear() - birthYear;
}

// ---------------------------------------------------------------- Formattazione Telefoni & WhatsApp
function formatTelUri(phone) {
  if (!phone) return '';
  const trimmed = String(phone).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  // Elimina qualsiasi spazio o carattere non valido dal link tel:
  return hasPlus ? `+${digits}` : digits;
}

function formatWaUrl(phone) {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  // Gestione prefisso internazionale per evitare il bug %20 o numeri errati
  if (digits.startsWith('0039')) {
    digits = digits.substring(2);
  } else if (!digits.startsWith('39') && digits.length >= 9 && digits.length <= 10 && digits.startsWith('3')) {
    // Cellulare italiano senza prefisso inserito: aggiunge 39
    digits = '39' + digits;
  }
  return `https://wa.me/${digits}`;
}

// ---------------------------------------------------------------- TIPOLOGIE DOCUMENTI ALLEGABILI
const DEFAULT_DOC_CATEGORIES = [
  'Certificato di Battesimo',
  'Attestato di Trasferimento',
  'Documento di Identità / CF',
  'Modulo Privacy Firmato',
  'Certificato di Matrimonio',
  'Altro Documento'
];

function getDocCategories() {
  const list = state.settings?.categorieDocumenti;
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }
  return DEFAULT_DOC_CATEGORIES;
}

function renderDocCategoryOptions(selectedCategory = '') {
  const cats = getDocCategories();
  const options = [...cats];
  if (selectedCategory && !options.includes(selectedCategory)) {
    options.push(selectedCategory);
  }
  return options.map(cat => `
    <option value="${escapeHtml(cat)}" ${selectedCategory === cat ? 'selected' : ''}>${escapeHtml(cat)}</option>
  `).join('');
}

// ---------------------------------------------------------------- Rilevamento Modalità Client/PWA & API
const isClientMode = typeof window !== 'undefined' && (
  !!window.LocalDbEngine ||
  window.location.protocol === 'file:' ||
  !!window.Android ||
  (!window.location.port && !window.location.hostname.includes('localhost'))
);

async function api(path, options = {}) {
  if (isClientMode && window.LocalDbEngine) {
    return window.LocalDbEngine.handle(path, options);
  }
  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `Errore HTTP ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (window.LocalDbEngine) {
      return window.LocalDbEngine.handle(path, options);
    }
    throw err;
  }
}

function updateTabBadges() {
  if (!state.members) return;
  const attivi = state.members.filter(m => (m.stato || 'Attivo') === 'Attivo');
  const effettivi = attivi.filter(m => m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua));
  const aderenti = attivi.filter(m => m.ruolo === 'Aderente' || (!m.ruolo && !m.battesimoAcqua));
  const vedove = attivi.filter(m => !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov'));
  const sostenuti = attivi.filter(m => !!m.isSostenuto);
  const nonAttivi = state.members.filter(m => (m.stato || 'Attivo') !== 'Attivo');
  const famiglieCount = (state.families || []).length;

  if ($('tb-tutti')) $('tb-tutti').textContent = attivi.length;
  if ($('tb-effettivi')) $('tb-effettivi').textContent = effettivi.length;
  if ($('tb-aderenti')) $('tb-aderenti').textContent = aderenti.length;
  if ($('tb-vedove')) $('tb-vedove').textContent = vedove.length;
  if ($('tb-sostenuti')) $('tb-sostenuti').textContent = sostenuti.length;
  if ($('tb-non-attivi')) $('tb-non-attivi').textContent = nonAttivi.length;
  if ($('tb-famiglie')) $('tb-famiglie').textContent = famiglieCount;
}

async function loadAllData() {
  try {
    const [members, settings, stats, familiesRes, cloudStatus] = await Promise.all([
      api('/api/members'),
      api('/api/settings'),
      api('/api/stats'),
      api('/api/families'),
      api('/api/cloud/status').catch(() => null)
    ]);
    state.members = members;
    state.settings = settings;
    state.stats = stats;
    state.families = familiesRes.families || (Array.isArray(familiesRes) ? familiesRes : []);
    state.unassignedMembers = familiesRes.unassignedMembers || [];
    state.familiesData = familiesRes;
    state.cloudStatus = cloudStatus;

    if (settings.chiesa) {
      $('church-name').textContent = settings.chiesa;
    }
    renderCloudStatus();
    renderCurrentTab();
    updateTabBadges();
  } catch (err) {
    $('view').innerHTML = `<p class="loading" style="color:#dc2626;">Errore caricamento dati: ${escapeHtml(err.message)}</p>`;
  }
}

function renderCloudStatus() {
  const slot = $('cloud-status-slot');
  if (!slot) return;
  const s = state.cloudStatus;
  let pillHtml = '';
  if (s && s.connected) {
    const email = s.accountEmail ? ` (${escapeHtml(s.accountEmail)})` : '';
    pillHtml = `<span class="cloud-pill connected" title="Google Drive Connesso${email} - Cartella: ${escapeHtml(s.folderName || 'Registro Chiesa')}">☁️ Drive Connesso</span>`;
  } else if (s && (s.configured || s.hasCredentials)) {
    pillHtml = `<span class="cloud-pill" title="Google Drive configurato ma non connesso">☁️ Disconnesso</span>`;
  } else {
    pillHtml = `<span class="cloud-pill" title="Archivio locale attivo">💾 Locale</span>`;
  }

  slot.innerHTML = `
    ${pillHtml}
    <button id="btn-app-quit" class="header-quit-btn" title="Chiudi il gestionale">
      ⏻ Chiudi
    </button>
  `;

  slot.querySelector('.cloud-pill')?.addEventListener('click', () => {
    location.hash = '#impostazioni';
  });

  $('btn-app-quit')?.addEventListener('click', handleAppQuit);
}

// ---------------------------------------------------------------- Chiusura Applicazione (Sync Silenziosa)
function handleAppQuit() {
  const dlg = $('dlg');
  if (!dlg) return;

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3 style="display:flex; align-items:center; gap:8px; margin:0;">
        <span style="color:#ef4444;">⏻</span> Chiusura Gestionale
      </h3>
      <button class="close-btn" id="btn-cancel-quit" title="Annulla chiusura">✕ Annulla</button>
    </div>
    <div class="dialog-body" style="padding:22px;">
      <div style="font-size:15px; font-weight:600; color:#0f172a; margin-bottom:24px;">
        Confermi di voler chiudere il programma?
      </div>

      <div style="display:flex; justify-content:flex-end; gap:10px;" id="quit-actions-area">
        <button class="btn" id="btn-abort-quit" style="padding:8px 16px;">Annulla</button>
        <button class="btn danger" id="btn-confirm-quit" style="padding:8px 20px; font-weight:700; background:#dc2626; color:#ffffff;">
          ⏻ Chiudi Programma
        </button>
      </div>
    </div>
  `;

  if (!dlg.open) dlg.showModal();

  $('btn-cancel-quit')?.addEventListener('click', () => dlg.close());
  $('btn-abort-quit')?.addEventListener('click', () => dlg.close());

  $('btn-confirm-quit')?.addEventListener('click', async () => {
    dlg.close();
    try {
      await fetch('/api/app/quit', { method: 'POST', keepalive: true });
    } catch (_) {}
    try { window.close(); } catch (_) {}
  });
}

// ---------------------------------------------------------------- Routing e Tab
// ---------------------------------------------------------------- Routing, Menù a Schede e Navigazione
function initNavigation() {
  const links = document.querySelectorAll('.tabs a');
  links.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const tab = a.getAttribute('data-tab');
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(18);
      }
      location.hash = `#${tab}`;
    });
  });

  // Navigazione mobile bottom bar
  document.querySelectorAll('.bottom-tab-item[data-bottom-tab]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const target = btn.getAttribute('data-bottom-tab');
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(20);
      }
      location.hash = `#${target}`;
    });
  });

  // Pulsanti per aprire il Menù a Schede completo
  $('btn-open-tabs-menu')?.addEventListener('click', openTabsMenuModal);
  $('btn-bottom-all-tabs')?.addEventListener('click', openTabsMenuModal);

  window.addEventListener('hashchange', () => {
    const hash = (location.hash || '#tutti').replace('#', '');
    setTab(hash);
  });

  const initialTab = (location.hash || '#tutti').replace('#', '');
  setTab(initialTab);

  // Intercettazione globale per stampe A4 ed esportazioni Excel/CSV/JSON
  document.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;

    if (href.startsWith('/api/print/')) {
      e.preventDefault();
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(22);
      }
      handlePrintAction(href);
    } else if (href === '/api/export/csv') {
      e.preventDefault();
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(22);
      }
      handleExportCsvAction();
    } else if (href === '/api/export/json') {
      e.preventDefault();
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(22);
      }
      handleExportJsonAction();
    } else if (href.includes('/attachments/')) {
      if (isClientMode) {
        e.preventDefault();
        const parts = href.split('/');
        const mId = Number(parts[3]);
        const attId = parts[5];
        const m = state.members.find(x => x.id === mId);
        const att = (m?.allegati || []).find(a => a.id === attId);
        if (att) {
          if (att.driveViewLink) {
            if (window.Android && typeof window.Android.openUrl === 'function') {
              window.Android.openUrl(att.driveViewLink);
            } else {
              window.open(att.driveViewLink, '_blank');
            }
          } else if (att.dataBase64) {
            const win = window.open();
            if (win) {
              win.document.write(`<iframe src="${att.dataBase64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
            } else if (window.Android && typeof window.Android.openUrl === 'function') {
              window.Android.openUrl(att.dataBase64);
            }
          }
        }
      }
    }
  });
}

function setTab(tab) {
  if (!tab || tab === 'dashboard' || tab === 'schedario' || tab === 'membri') {
    tab = 'tutti';
  }
  state.currentTab = tab;

  document.querySelectorAll('.tabs a').forEach(a => {
    const tabName = a.getAttribute('data-tab');
    a.classList.toggle('active', tabName === tab);
  });

  // Aggiorna stato attivo nella bottom nav
  const isMemberTab = ['tutti', 'effettivi', 'aderenti', 'vedove', 'sostenuti', 'non-attivi'].includes(tab);
  document.querySelectorAll('.bottom-tab-item[data-bottom-tab]').forEach(btn => {
    const bTab = btn.getAttribute('data-bottom-tab');
    if (bTab === 'tutti') {
      btn.classList.toggle('active', isMemberTab);
    } else {
      btn.classList.toggle('active', bTab === tab);
    }
  });

  renderCurrentTab();
  updateTabBadges();
}

function openTabsMenuModal() {
  const dlg = $('dlg');
  if (!dlg) return;

  const attivi = state.members.filter(m => (m.stato || 'Attivo') === 'Attivo');
  const effettivi = attivi.filter(m => m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua));
  const aderenti = attivi.filter(m => m.ruolo === 'Aderente' || (!m.ruolo && !m.battesimoAcqua));
  const vedove = attivi.filter(m => !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov'));
  const sostenuti = attivi.filter(m => !!m.isSostenuto);
  const nonAttivi = state.members.filter(m => (m.stato || 'Attivo') !== 'Attivo');
  const famiglieCount = (state.families || []).length;

  const tabsConfig = [
    { id: 'tutti', icon: '👥', title: 'Registro Generale', desc: 'Tutti i membri fedeli registrati nella comunità', count: attivi.length, badgeCls: 'blue' },
    { id: 'effettivi', icon: '🟢', title: 'Membri Effettivi', desc: 'Fedeli battezzati in acqua comunicanti', count: effettivi.length, badgeCls: 'effettivo' },
    { id: 'aderenti', icon: '🔵', title: 'Membri Aderenti', desc: 'Fedeli aderenti, simpatizzanti e catecumeni', count: aderenti.length, badgeCls: 'aderente' },
    { id: 'vedove', icon: '🟣', title: 'Registro Vedove/i', desc: 'Cura pastorale, visite ed assistenza fraterna', count: vedove.length, badgeCls: 'vedova' },
    { id: 'sostenuti', icon: '🟠', title: 'Registro Sostenuti', desc: 'Persone e famiglie assistite caritativamente', count: sostenuti.length, badgeCls: 'sostenuto' },
    { id: 'non-attivi', icon: '🔴', title: 'Membri Non Attivi', desc: 'Fedeli trasferiti, dimessi o non attivi', count: nonAttivi.length, badgeCls: 'danger' },
    { id: 'famiglie', icon: '👨‍👩‍👧‍👦', title: 'Nuclei Familiari', desc: 'Ruolini familiari, ruoli e collegamenti', count: famiglieCount, badgeCls: 'green' },
    { id: 'impostazioni', icon: '⚙️', title: 'Impostazioni & Cloud', desc: 'Dati comunità, sincronizzazione Drive, backup JSON/CSV', count: null },
    { id: 'wiki', icon: '📖', title: 'Guida Utente & Manuale', desc: 'Manuale d\'uso canonico ed istruzioni operative', count: null }
  ];

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3 style="display:flex; align-items:center; gap:8px; margin:0;">
        <span>📑</span> Menù a Schede del Gestionale
      </h3>
      <button class="close-btn" id="btn-close-tabs-menu" title="Chiudi menù">✕</button>
    </div>
    <div class="dialog-body" style="padding:16px;">
      <div style="font-size:13px; color:var(--muted); margin-bottom:14px;">
        Seleziona rapidamente la scheda di lavoro desiderata:
      </div>
      <div class="tab-menu-grid">
        ${tabsConfig.map(t => `
          <div class="tab-menu-card ${state.currentTab === t.id ? 'active' : ''}" data-target-tab="${t.id}">
            <div class="tab-menu-card-icon">${t.icon}</div>
            <div class="tab-menu-card-info">
              <div class="tab-menu-card-title">
                ${escapeHtml(t.title)}
                ${t.count !== null ? `<span class="badge ${t.badgeCls || 'gray'}" style="font-size:11px; padding:1px 6px;">${t.count}</span>` : ''}
              </div>
              <div class="tab-menu-card-desc">${escapeHtml(t.desc)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  if (!dlg.open) dlg.showModal();

  $('btn-close-tabs-menu')?.addEventListener('click', () => dlg.close());

  dlg.querySelectorAll('[data-target-tab]').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.getAttribute('data-target-tab');
      if (window.Android && typeof window.Android.vibrate === 'function') {
        window.Android.vibrate(25);
      }
      dlg.close();
      location.hash = `#${target}`;
    });
  });
}

// ---------------------------------------------------------------- Gestione Stampe Native A4 & Esportazioni
async function handlePrintAction(url) {
  const parsed = new URL(url, 'http://localhost');
  const pathname = parsed.pathname;
  const params = parsed.searchParams;

  let html = '';
  let jobName = 'Registro_di_Chiesa';

  const s = state.settings || {};
  const families = state.families || [];

  if (pathname.startsWith('/api/print/member/')) {
    const id = Number(pathname.split('/')[4]);
    const m = state.members.find(x => x.id === id);
    if (!m) { toast('Membro non trovato per la stampa', 'due'); return; }
    if (window.PrintTemplates && window.PrintTemplates.memberCardPage) {
      html = window.PrintTemplates.memberCardPage(m, s, families);
    }
    jobName = `Scheda_${m.cognome}_${m.nome}`;
  } else if (pathname === '/api/print/families') {
    if (window.PrintTemplates && window.PrintTemplates.familyRegisterPage) {
      html = window.PrintTemplates.familyRegisterPage(families, s);
    }
    jobName = 'Ruolino_Famiglie_A4';
  } else if (pathname === '/api/print/register') {
    const regFilter = params.get('registro') || params.get('filter') || 'tutti';
    if (window.PrintTemplates && window.PrintTemplates.churchRegisterPage) {
      html = window.PrintTemplates.churchRegisterPage(state.members, s, regFilter, families);
    }
    jobName = `Registro_${regFilter}_A4`;
  }

  if (!html) {
    // Fallback via browser URL diretto se PrintTemplates non fosse ancora pronto
    window.open(url, '_blank');
    return;
  }

  if (window.Android && typeof window.Android.printHtml === 'function') {
    window.Android.printHtml(html, jobName);
  } else {
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => { printWin.print(); }, 400);
    } else {
      window.location.href = url;
    }
  }
}

async function handleExportCsvAction() {
  let csvText = '';
  if (window.LocalDbEngine && typeof window.LocalDbEngine.generateCsv === 'function') {
    csvText = window.LocalDbEngine.generateCsv();
  } else {
    try {
      const res = await fetch('/api/export/csv');
      const data = await res.json().catch(() => null);
      csvText = data?.csv || (await fetch('/api/export/csv').then(r => r.text()));
    } catch (_) {}
  }

  const fileName = `Registro_Membri_${new Date().toISOString().slice(0, 10)}.csv`;

  if (window.Android && typeof window.Android.saveFile === 'function') {
    const b64 = btoa(unescape(encodeURIComponent(csvText)));
    window.Android.saveFile(fileName, b64, 'text/csv');
    if (typeof window.Android.shareText === 'function') {
      window.Android.shareText('Esporta Elenco Membri (CSV)', csvText);
    }
  } else {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Tabella Membri (CSV) esportata con successo!', 'ok');
  }
}

async function handleExportJsonAction() {
  let dbObj = null;
  if (window.LocalDbEngine && typeof window.LocalDbEngine.getDb === 'function') {
    dbObj = window.LocalDbEngine.getDb();
  } else {
    dbObj = await api('/api/export/json');
  }
  const jsonText = JSON.stringify(dbObj, null, 2);
  const fileName = `Backup_GestionaleTralci_${new Date().toISOString().slice(0, 10)}.json`;

  if (window.Android && typeof window.Android.saveFile === 'function') {
    const b64 = btoa(unescape(encodeURIComponent(jsonText)));
    window.Android.saveFile(fileName, b64, 'application/json');
  } else {
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Backup completo JSON scaricato!', 'ok');
  }
}

function renderCurrentTab() {
  const main = $('view');
  switch (state.currentTab) {
    case 'tutti':
    case 'effettivi':
    case 'aderenti':
    case 'vedove':
    case 'sostenuti':
    case 'non-attivi':
      renderRegistro(main, state.currentTab);
      break;
    case 'famiglie':
      renderFamiglie(main);
      break;
    case 'impostazioni':
      renderImpostazioni(main);
      break;
    case 'wiki':
      renderWiki(main);
      break;
    default:
      renderRegistro(main, 'tutti');
  }
}

function renderSchedario(container, subview = 'membri') {
  container.innerHTML = `
    <div class="subnav">
      <a href="#membri" class="${subview === 'membri' ? 'active' : ''}">👥 Anagrafica Membri (${state.members.length})</a>
      <a href="#sacramenti" class="${subview === 'sacramenti' ? 'active' : ''}">🌊 Battesimi &amp; Fede</a>
      <a href="#famiglie" class="${subview === 'famiglie' ? 'active' : ''}">👨‍👩‍👧‍👦 Famiglie (${state.families.length})</a>
      <a href="#rubrica" class="${subview === 'rubrica' ? 'active' : ''}">📱 Rubrica &amp; Privacy</a>
    </div>
    <div id="schedario-subview"></div>
  `;

  const sub = $('schedario-subview');
  if (subview === 'sacramenti') {
    renderSacramenti(sub);
  } else if (subview === 'famiglie') {
    renderFamiglie(sub);
  } else if (subview === 'rubrica') {
    renderRubrica(sub);
  } else {
    renderMembri(sub);
  }
}

// ---------------------------------------------------------------- VISTA: DASHBOARD
function renderDashboard(container) {
  const s = state.stats || {
    total: state.members.length,
    battesimiAcqua: state.members.filter(m => m.battesimoAcqua).length,
    percAcqua: 100,
    battesimiSpiritoSanto: state.members.filter(m => m.battesimoSpiritoSanto).length,
    percSpiritoSanto: 88,
    consensiWhatsApp: state.members.length,
    consensiFotoVideo: state.members.length,
    ageDist: {},
    comuniMap: {},
    birthdaysThisMonth: []
  };

  const currentMonthName = new Date().toLocaleDateString('it-IT', { month: 'long' });

  let birthdayHtml = '';
  if (s.birthdaysThisMonth && s.birthdaysThisMonth.length > 0) {
    birthdayHtml = `
      <div class="card pad" style="margin-bottom: 24px;">
        <h3>🎂 Compleanni del Mese di ${currentMonthName.toUpperCase()} (${s.birthdaysThisMonth.length})</h3>
        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-top:12px;">
          ${s.birthdaysThisMonth.map(b => `
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px; font-size:13px; display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">🎉</span>
              <div>
                <strong>${escapeHtml(b.nome)}</strong><br>
                <span class="muted small">${formatDate(b.dataNascita)} (${b.eta} anni)</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Distribuzione fasce d'età
  const ageDist = s.ageDist || {};
  const maxAgeCount = Math.max(1, ...Object.values(ageDist));
  const ageDistHtml = Object.entries(ageDist).map(([fascia, count]) => {
    const pct = Math.round((count / (s.total || 1)) * 100);
    return `
      <div style="margin-bottom: 12px;">
        <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:4px; font-weight:600;">
          <span>${fascia}</span>
          <span>${count} membri (${pct}%)</span>
        </div>
        <div style="background:#e2e8f0; height:8px; border-radius:999px; overflow:hidden;">
          <div style="background:#0284c7; width:${(count / maxAgeCount) * 100}%; height:100%; border-radius:999px;"></div>
        </div>
      </div>
    `;
  }).join('');

  // Top comuni
  const comuniEntries = Object.entries(s.comuniMap || {}).sort((a, b) => b[1] - a[1]);
  const comuniHtml = comuniEntries.map(([comune, count]) => `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; border-bottom:1px solid var(--line); font-size:13px;">
      <span style="font-weight:600;">📍 ${escapeHtml(comune)}</span>
      <span class="badge blue">${count} membri</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Panoramica Registro Ecclesiastico</h2>
        <div class="muted small">${escapeHtml(state.settings.chiesa || 'Comunità')} · Pastore: ${escapeHtml(state.settings.pastore || 'Bruno Astemio')}</div>
      </div>
      <div class="spacer"></div>
      <a href="/api/print/register" target="_blank" class="btn">🖨️ Stampa Registro A4</a>
      <a href="/api/export/csv" class="btn">📥 Esporta Excel (CSV)</a>
      <button class="btn primary" id="btn-quick-new-member">+ Nuovo Membro</button>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-title">Membri Registrati <span>👥</span></div>
        <div class="kpi-value">${s.total}</div>
        <div class="kpi-sub">Totale fedeli inseriti</div>
      </div>

      <div class="kpi-card blue">
        <div class="kpi-title">Battesimi in Acqua <span>🌊</span></div>
        <div class="kpi-value">${s.battesimiAcqua}</div>
        <div class="kpi-sub">${s.percAcqua}% dei membri registrati</div>
      </div>

      <div class="kpi-card gold">
        <div class="kpi-title">Spirito Santo <span>🕊️</span></div>
        <div class="kpi-value">${s.battesimiSpiritoSanto}</div>
        <div class="kpi-sub">${s.percSpiritoSanto}% con battesimo SS</div>
      </div>

      <div class="kpi-card green">
        <div class="kpi-title">Consensi WhatsApp <span>💬</span></div>
        <div class="kpi-value">${s.consensiWhatsApp}</div>
        <div class="kpi-sub">Autorizzati comunicazioni</div>
      </div>

      <div class="kpi-card purple">
        <div class="kpi-title">Consensi Foto / Video <span>📷</span></div>
        <div class="kpi-value">${s.consensiFotoVideo}</div>
        <div class="kpi-sub">Conformità privacy GDPR</div>
      </div>
    </div>

    ${birthdayHtml}

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap:24px;">
      <div class="card pad">
        <h3>📊 Fasce di Età della Comunità</h3>
        <div style="margin-top:16px;">
          ${ageDistHtml}
        </div>
      </div>

      <div class="card pad">
        <h3>📍 Distribuzione Geografica Residenze</h3>
        <div style="margin-top:10px; max-height:280px; overflow-y:auto;">
          ${comuniHtml}
        </div>
      </div>
    </div>
  `;

  $('btn-quick-new-member')?.addEventListener('click', () => openMemberModal());
}

// ---------------------------------------------------------------- VISTA: REGISTRI ECCLESIALI
function getRegistroMeta(tipo) {
  switch (tipo) {
    case 'effettivi':
      return {
        key: 'effettivi',
        title: 'Registro dei Membri Effettivi',
        subtitle: 'Elenco ufficiale dei membri battezzati e comunicanti della comunità',
        badgeClass: 'effettivo',
        filterFn: m => (m.stato || 'Attivo') === 'Attivo' && (m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua)),
        printUrl: '/api/print/register?registro=effettivi',
        printLabel: 'Stampa Membri Effettivi (A4)'
      };
    case 'aderenti':
      return {
        key: 'aderenti',
        title: 'Registro dei Membri Aderenti',
        subtitle: 'Elenco dei fedeli aderenti, simpatizzanti e catecumeni',
        badgeClass: 'aderente',
        filterFn: m => (m.stato || 'Attivo') === 'Attivo' && (m.ruolo === 'Aderente' || (!m.ruolo && !m.battesimoAcqua)),
        printUrl: '/api/print/register?registro=aderenti',
        printLabel: 'Stampa Membri Aderenti (A4)'
      };
    case 'vedove':
      return {
        key: 'vedove',
        title: 'Registro delle Vedove e dei Vedovi',
        subtitle: 'Registro ecclesiale per la cura pastorale, visite ed assistenza fraterna',
        badgeClass: 'vedova',
        filterFn: m => (m.stato || 'Attivo') === 'Attivo' && (!!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov')),
        printUrl: '/api/print/register?registro=vedove',
        printLabel: 'Stampa Registro Vedove/i (A4)'
      };
    case 'sostenuti':
      return {
        key: 'sostenuti',
        title: 'Registro dei Membri Sostenuti',
        subtitle: 'Elenco delle persone e nuclei assistiti tramite fondo caritativo e visite',
        badgeClass: 'sostenuto',
        filterFn: m => (m.stato || 'Attivo') === 'Attivo' && (!!m.isSostenuto),
        printUrl: '/api/print/register?registro=sostenuti',
        printLabel: 'Stampa Registro Sostenuti (A4)'
      };
    case 'non-attivi':
      return {
        key: 'non-attivi',
        title: 'Membri Non Attivi',
        subtitle: 'Elenco dei fedeli non attivi o disattivati nella comunità',
        badgeClass: 'danger',
        filterFn: m => (m.stato || 'Attivo') !== 'Attivo',
        printUrl: '/api/print/register?registro=non-attivi',
        printLabel: 'Stampa Membri Non Attivi (A4)'
      };
    case 'tutti':
    default:
      return {
        key: 'tutti',
        title: 'Registro Generale dei Membri',
        subtitle: 'Elenco complessivo dei fedeli registrati nella comunità',
        badgeClass: '',
        filterFn: m => (m.stato || 'Attivo') === 'Attivo',
        printUrl: '/api/print/register?registro=tutti',
        printLabel: 'Stampa Registro Generale (A4)'
      };
  }
}

function renderRegistro(container, tipo = 'tutti') {
  const meta = getRegistroMeta(tipo);
  const subset = state.members.filter(meta.filterFn);

  const attivi = state.members.filter(m => (m.stato || 'Attivo') === 'Attivo');
  const cntTutti = attivi.length;
  const cntEffettivi = attivi.filter(m => m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua)).length;
  const cntAderenti = attivi.filter(m => m.ruolo === 'Aderente' || (!m.ruolo && !m.battesimoAcqua)).length;
  const cntVedove = attivi.filter(m => !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov')).length;
  const cntSostenuti = attivi.filter(m => !!m.isSostenuto).length;
  const cntNonAttivi = state.members.filter(m => (m.stato || 'Attivo') !== 'Attivo').length;

  container.innerHTML = `
    <!-- Sotto-schede rapide per navigazione mobile e desktop -->
    <div class="register-subtabs">
      <a href="#tutti" class="subtab ${tipo === 'tutti' ? 'active' : ''}">👥 Tutti <span class="badge gray">${cntTutti}</span></a>
      <a href="#effettivi" class="subtab ${tipo === 'effettivi' ? 'active' : ''}">🟢 Effettivi <span class="badge effettivo">${cntEffettivi}</span></a>
      <a href="#aderenti" class="subtab ${tipo === 'aderenti' ? 'active' : ''}">🔵 Aderenti <span class="badge aderente">${cntAderenti}</span></a>
      <a href="#vedove" class="subtab ${tipo === 'vedove' ? 'active' : ''}">🟣 Vedove <span class="badge vedova">${cntVedove}</span></a>
      <a href="#sostenuti" class="subtab ${tipo === 'sostenuti' ? 'active' : ''}">🟠 Sostenuti <span class="badge sostenuto">${cntSostenuti}</span></a>
      <a href="#non-attivi" class="subtab ${tipo === 'non-attivi' ? 'active' : ''}">🔴 Non Attivi <span class="badge danger">${cntNonAttivi}</span></a>
    </div>

    <div class="toolbar" style="margin-bottom:8px;">
      <div>
        <h2 style="font-size:16px; margin:0; display:flex; align-items:center; gap:8px;">
          ${escapeHtml(meta.title)}
          <span class="badge ${meta.badgeClass || 'gray'}" style="font-size:11px; padding:1px 6px;">${subset.length} membri</span>
        </h2>
        <div class="muted small" style="font-size:11.5px; margin-top:1px;">${escapeHtml(meta.subtitle)}</div>
      </div>
      <div class="spacer"></div>
      <a href="${meta.printUrl}" target="_blank" class="btn small btn-print">🖨️ ${meta.printLabel}</a>
      <a href="/api/export/csv" class="btn small">📥 Esporta Excel (CSV)</a>
      <button class="btn small primary" id="btn-add-reg-member">+ Nuovo Membro</button>
    </div>

    <div class="card pad" style="margin-bottom:8px; padding:6px 12px;">
      <div style="display:flex; gap:10px; align-items:center;">
        <div class="search-bar" style="flex:1; max-width:480px;">
          <span class="search-icon" style="left:9px; font-size:13px;">🔍</span>
          <input type="text" id="member-search" placeholder="Cerca N. Prot., nominativo, CF, comune..." value="${escapeHtml(state.search)}" style="padding:4px 10px 4px 30px; height:31px; font-size:12.5px;">
        </div>
        ${state.search ? `
          <button class="btn small" id="btn-reset-search" style="padding:3px 8px; font-size:11.5px;">✕ Azzera</button>
        ` : ''}
      </div>
    </div>

    <div id="members-table-slot"></div>
  `;

  $('btn-add-reg-member')?.addEventListener('click', () => openMemberModal(null, tipo));

  const searchInput = $('member-search');
  searchInput?.addEventListener('input', e => {
    state.search = e.target.value;
    updateRegistroTable(tipo);
    const resetBtn = $('btn-reset-search');
    if (resetBtn) resetBtn.style.display = state.search ? '' : 'none';
  });

  $('btn-reset-search')?.addEventListener('click', () => {
    state.search = '';
    const input = $('member-search');
    if (input) input.value = '';
    const resetBtn = $('btn-reset-search');
    if (resetBtn) resetBtn.style.display = 'none';
    updateRegistroTable(tipo);
  });

  updateRegistroTable(tipo);
}

function updateRegistroTable(tipo = 'tutti') {
  const slot = $('members-table-slot');
  if (!slot) return;

  const meta = getRegistroMeta(tipo);
  let list = state.members.filter(meta.filterFn);

  // Filtro ricerca full-text immediata
  if (state.search && state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    list = list.filter(m => {
      const allText = `${m.protocollo ?? m.id} ${m.cognome} ${m.nome} ${m.codiceFiscale || ''} ${m.comune || ''} ${m.indirizzo || ''} ${m.telefono || ''} ${m.email || ''} ${m.professione || ''} ${m.ruolo || ''} ${m.statoCivile || ''} ${m.dettaglioSostegno || ''}`.toLowerCase();
      return allText.includes(q);
    });
  }

  // Ordinamento
  list.sort((a, b) => {
    if (state.sortField === 'protocollo') {
      const na = Number(a.protocollo ?? a.id) || 0;
      const nb = Number(b.protocollo ?? b.id) || 0;
      return state.sortDir === 'asc' ? na - nb : nb - na;
    }
    let va = a[state.sortField] ?? '';
    let vb = b[state.sortField] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return state.sortDir === 'asc' ? -1 : 1;
    if (va > vb) return state.sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  if (list.length === 0) {
    slot.innerHTML = `
      <div class="card pad center muted" style="padding:30px 20px;">
        Nessun membro trovato nel registro corrispondente ai filtri specificati.
      </div>
    `;
    return;
  }

  const rows = list.map((m, idx) => {
    const age = calcAge(m.dataNascita);
    const isEff = m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua);
    const ruoloText = isEff ? 'Effettivo' : 'Aderente';
    const ruoloBadgeClass = isEff ? 'effettivo' : 'aderente';
    const statoCiv = m.statoCivile || (m.isVedovo ? 'Vedovo/a' : '—');

    let extraColContent = '';
    if (tipo === 'sostenuti') {
      extraColContent = m.dettaglioSostegno ? `<span style="font-weight:600; color:#c2410c;">${escapeHtml(m.dettaglioSostegno)}</span>` : '<span class="muted">Assistenza fraterna</span>';
    } else if (tipo === 'vedove') {
      extraColContent = `<span class="badge vedova">Vedova/o</span>`;
    } else {
      extraColContent = `<span class="badge ${ruoloBadgeClass}">${ruoloText}</span>`;
    }

    return `
      <tr>
        <td style="width:60px; text-align:center;"><span class="prot-pill">#${m.protocollo ?? m.id}</span></td>
        <td>
          <div style="font-weight:700; color:#0f172a; font-size:13px; display:flex; align-items:center; gap:5px;">
            ${(m.allegati && m.allegati.length > 0) ? `
              <span title="${m.allegati.length} documenti allegati" style="font-size:10px; color:#0284c7; background:#e0f2fe; border:1px solid #bae6fd; padding:0 4px; border-radius:3px; font-weight:700; white-space:nowrap; flex-shrink:0;">📎 ${m.allegati.length}</span>
            ` : ''}
            <a href="javascript:void(0)" data-action="view" data-id="${m.id}" style="color:#0f172a; text-decoration:none;">
              ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}
            </a>
          </div>
          <div style="font-size:11px; margin-top:2px; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            ${m.codiceFiscale ? `<span style="font-family:monospace; color:#475569; font-weight:600; font-size:10.5px;">${escapeHtml(m.codiceFiscale)}</span>` : ''}
            ${(m.codiceFiscale && m.professione) ? '<span class="muted">·</span>' : ''}
            ${m.professione ? `<span class="muted">${escapeHtml(m.professione)}</span>` : ''}
          </div>
        </td>
        <td>
          <div>${formatDate(m.dataNascita)}</div>
          ${age ? `<div class="muted" style="font-size:11px; margin-top:1px;">${age} anni</div>` : ''}
        </td>
        <td style="font-size:11.5px;">
          ${escapeHtml(statoCiv)}
        </td>
        <td>
          <div style="font-weight:600;">${escapeHtml(m.comune || '—')}</div>
          ${m.indirizzo ? `<div class="muted" style="font-size:11px; margin-top:1px;">${escapeHtml(m.indirizzo)}</div>` : ''}
        </td>
        <td>
          ${m.telefono ? `<span style="font-weight:600; color:#0f172a;">${escapeHtml(m.telefono)}</span>` : '<span class="muted">—</span>'}
        </td>
        <td style="text-align:center;">
          ${extraColContent}
          ${m.dataAdesione ? `<div class="muted small" style="font-size:10px; margin-top:2px;" title="Data Adesione Comunità">Adesione: ${formatDate(m.dataAdesione)}</div>` : ''}
        </td>
        <td style="text-align:center;">
          <span class="badge ${m.battesimoAcqua ? 'green' : 'gray'}" style="font-weight:700;" title="${m.dataBA ? 'Battesimo in Acqua: ' + escapeHtml(m.dataBA) : 'Battesimo in Acqua'}">
            ${m.battesimoAcqua ? 'SI' : 'NO'}
          </span>
        </td>
        <td style="text-align:center;">
          <span class="badge ${m.battesimoSpiritoSanto ? 'green' : 'gray'}" style="font-weight:700;" title="${m.dataSS ? 'Spirito Santo: ' + escapeHtml(m.dataSS) : 'Battesimo nello Spirito Santo'}">
            ${m.battesimoSpiritoSanto ? 'SI' : 'NO'}
          </span>
        </td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn small" data-action="view" data-id="${m.id}" title="Visualizza Scheda Membro" style="font-size:13.5px; padding:2px 6px; line-height:1.1;">👁️</button>
          <button class="btn small" data-action="edit" data-id="${m.id}" title="Modifica Scheda e Allegati" style="font-size:13.5px; padding:2px 6px; line-height:1.1;">✏️</button>
          <a href="/api/print/member/${m.id}" target="_blank" class="btn small btn-print" title="Stampa Scheda Ufficiale A4" style="font-size:13.5px; padding:2px 6px; line-height:1.1; text-decoration:none;">🖨️</a>
          <button class="btn small danger" data-action="delete" data-id="${m.id}" title="Elimina Membro" style="font-size:13.5px; padding:2px 6px; line-height:1.1;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  slot.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:65px; text-align:center; cursor:pointer;" id="th-sort-prot" title="Numero di Protocollo Cartaceo (Clicca per ordinare)">
              N. Prot. ${state.sortField === 'protocollo' ? (state.sortDir === 'asc' ? '▲' : '▼') : '⇅'}
            </th>
            <th style="cursor:pointer;" id="th-sort-nom" title="Ordina per Cognome e Nome">
              Nominativo ${state.sortField === 'cognome' ? (state.sortDir === 'asc' ? '▲' : '▼') : ''}
            </th>
            <th>Nascita / Età</th>
            <th>Stato Civile</th>
            <th>Residenza</th>
            <th>Telefono</th>
            <th style="text-align:center;">${tipo === 'sostenuti' ? 'Dettaglio Sostegno' : (tipo === 'vedove' ? 'Stato Registro' : 'Membro')}</th>
            <th style="text-align:center;">Battesimo Acqua</th>
            <th style="text-align:center;">Spirito Santo</th>
            <th style="text-align:right;">Azioni</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  slot.querySelector('#th-sort-prot')?.addEventListener('click', () => {
    if (state.sortField === 'protocollo') {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = 'protocollo';
      state.sortDir = 'asc';
    }
    updateRegistroTable(tipo);
  });

  slot.querySelector('#th-sort-nom')?.addEventListener('click', () => {
    if (state.sortField === 'cognome') {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortField = 'cognome';
      state.sortDir = 'asc';
    }
    updateRegistroTable(tipo);
  });

  slot.querySelectorAll('a[data-action="view"], button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      const id = Number(btn.getAttribute('data-id'));
      const member = state.members.find(x => x.id === id);
      if (!member) return;

      if (action === 'view') openMemberProfile(member);
      else if (action === 'edit') openMemberModal(member, tipo);
      else if (action === 'delete') confirmDeleteMember(member);
    });
  });
}

// ---------------------------------------------------------------- VISTA: SACRAMENTI
function renderSacramenti(container) {
  const baList = state.members.filter(m => m.battesimoAcqua);
  const ssList = state.members.filter(m => m.battesimoSpiritoSanto);

  container.innerHTML = `
    <div class="toolbar">
      <h2>Registro Sacramenti di Fede &amp; Battesimi</h2>
      <div class="spacer"></div>
      <a href="/api/print/register?filter=ba" target="_blank" class="btn">🖨️ Stampa Battesimi Acqua</a>
      <a href="/api/print/register?filter=ss" target="_blank" class="btn">🖨️ Stampa Battesimi Spirito Santo</a>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card blue">
        <div class="kpi-title">Battesimi in Acqua <span>🌊</span></div>
        <div class="kpi-value">${baList.length} / ${state.members.length}</div>
        <div class="kpi-sub">Percentuale: ${Math.round((baList.length / (state.members.length || 1)) * 100)}%</div>
      </div>

      <div class="kpi-card gold">
        <div class="kpi-title">Battesimi nello Spirito Santo <span>🕊️</span></div>
        <div class="kpi-value">${ssList.length} / ${state.members.length}</div>
        <div class="kpi-sub">Percentuale: ${Math.round((ssList.length / (state.members.length || 1)) * 100)}%</div>
      </div>
    </div>

    <div class="card pad">
      <h3>📜 Elenco Dettagliato Battesimi Membri</h3>
      <div class="table-wrap" style="margin-top:14px;">
        <table>
          <thead>
            <tr>
              <th style="width:65px; text-align:center;">N. Prot.</th>
              <th>Membro</th>
              <th>Battesimo in Acqua</th>
              <th>Data / Anno Acqua</th>
              <th>Battesimo Spirito Santo</th>
              <th>Data / Anno Spirito Santo</th>
              <th style="text-align:right;">Scheda</th>
            </tr>
          </thead>
          <tbody>
            ${state.members.map(m => `
              <tr>
                <td style="text-align:center;"><span class="prot-pill">#${m.protocollo ?? m.id}</span></td>
                <td style="font-weight:700;">${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</td>
                <td>
                  ${m.battesimoAcqua ? '<span class="badge blue">✓ Ricevuto</span>' : '<span class="badge gray">In attesa</span>'}
                </td>
                <td style="font-weight:600; color:#0369a1;">${escapeHtml(formatDate(m.dataBA))}</td>
                <td>
                  ${m.battesimoSpiritoSanto ? '<span class="badge amber">🕊️ Ricevuto</span>' : '<span class="badge gray">In attesa</span>'}
                </td>
                <td style="font-weight:600; color:#b45309;">${escapeHtml(formatDate(m.dataSS))}</td>
                <td style="text-align:right;">
                  <button class="btn small" onclick="handlePrintAction('/api/print/member/${m.id}')">🖨️ Scheda</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------- VISTA: FAMIGLIE
function renderFamiglie(container) {
  const families = state.families || [];
  const unassigned = state.unassignedMembers || [];
  const totalAssigned = state.familiesData?.totalAssignedMembers ?? families.reduce((acc, f) => acc + (f.memberIds?.length || 0), 0);

  container.innerHTML = `
    <div class="toolbar">
      <div>
        <h2>Nuclei Familiari della Comunità (${families.length})</h2>
        <div class="muted small">
          👥 <strong>${totalAssigned}</strong> membri in gruppi familiari · 👤 <strong>${unassigned.length}</strong> membri singoli o non assegnati
        </div>
      </div>
      <div class="spacer"></div>
      <a href="/api/print/families" target="_blank" class="btn">🖨️ Stampa Ruolino Famiglie (A4)</a>
      <button class="btn primary" id="btn-create-family">➕ Crea Nuovo Gruppo Familiare</button>
    </div>

    <!-- Barra di ricerca rapida gruppi -->
    <div class="card pad" style="margin-bottom:20px; padding:14px 20px;">
      <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <div class="search-bar" style="max-width:420px;">
          <span class="search-icon">🔍</span>
          <input type="text" id="family-search" placeholder="Cerca gruppo, cognome, componente, indirizzo...">
        </div>
        <div class="spacer"></div>
        <div class="muted small">
          Puoi creare liberamente nuovi gruppi o modificare e riorganizzare quelli esistenti.
        </div>
      </div>
    </div>

    <!-- Griglia dei gruppi familiari -->
    <div class="family-grid" id="family-grid-slot">
      <!-- popolato dinamicamente -->
    </div>

    <!-- Sezione Membri non assegnati -->
    <div class="card pad unassigned-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
        <h3 style="margin:0; font-size:16.5px; color:#0f172a;">
          👤 Membri Singoli o Non Assegnati a un Gruppo (${unassigned.length})
        </h3>
        <span class="muted small">Fedeli censiti non ancora associati a un nucleo familiare</span>
      </div>

      ${unassigned.length === 0 ? `
        <div style="color:#059669; font-weight:600; padding:12px 0;">
          ✓ Tutti i fedeli del registro sono attualmente associati a un gruppo familiare!
        </div>
      ` : `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:65px; text-align:center;">N. Prot.</th>
                <th>Nominativo</th>
                <th>Residenza</th>
                <th>Telefono</th>
                <th style="text-align:right;">Azioni Rapide</th>
              </tr>
            </thead>
            <tbody>
              ${unassigned.map(m => `
                <tr>
                  <td style="text-align:center;"><span class="prot-pill">#${m.protocollo ?? m.id}</span></td>
                  <td style="font-weight:700;">
                    ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}
                    <span class="muted small">(${escapeHtml(m.professione || '—')})</span>
                  </td>
                  <td>${escapeHtml(m.indirizzo || '—')}, ${escapeHtml(m.comune || '—')}</td>
                  <td>${escapeHtml(m.telefono || '—')}</td>
                  <td style="text-align:right; white-space:nowrap;">
                    <button class="btn small primary" data-action="assign-member" data-id="${m.id}" title="Aggiungi a un gruppo esistente">
                      ➕ Assegna a Gruppo
                    </button>
                    <button class="btn small" data-action="create-from-member" data-id="${m.id}" title="Crea un nuovo nucleo per questo membro">
                      🏠 Crea Gruppo
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  $('btn-create-family')?.addEventListener('click', () => openFamilyModal());

  // Gestione ricerca gruppi
  const searchInput = $('family-search');
  searchInput?.addEventListener('input', () => updateFamilyGrid(searchInput.value));

  // Azioni membri non assegnati
  container.querySelectorAll('button[data-action="assign-member"]').forEach(b => {
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-id'));
      const member = state.members.find(x => x.id === id);
      if (member) openAssignMemberModal(member);
    });
  });

  container.querySelectorAll('button[data-action="create-from-member"]').forEach(b => {
    b.addEventListener('click', () => {
      const id = Number(b.getAttribute('data-id'));
      const member = state.members.find(x => x.id === id);
      if (member) {
        openFamilyModal(null, {
          nome: `Famiglia ${member.cognome}`,
          indirizzo: member.indirizzo || '',
          comune: member.comune || '',
          provincia: member.provincia || '',
          capofamigliaId: member.id,
          memberIds: [member.id]
        });
      }
    });
  });

  updateFamilyGrid('');
}

function updateFamilyGrid(query = '') {
  const slot = $('family-grid-slot');
  if (!slot) return;

  const q = query.trim().toLowerCase();
  let list = state.families || [];

  if (q) {
    list = list.filter(f => {
      const inHead = `${f.nome} ${f.indirizzo || ''} ${f.comune || ''} ${f.note || ''}`.toLowerCase();
      const inMembers = (f.membri || []).some(m => `${m.cognome} ${m.nome}`.toLowerCase().includes(q));
      return inHead.includes(q) || inMembers;
    });
  }

  if (list.length === 0) {
    slot.innerHTML = `
      <div class="card pad center muted" style="grid-column: 1 / -1; padding:40px 20px;">
        Nessun gruppo familiare trovato corrispondente alla ricerca.
      </div>
    `;
    return;
  }

  slot.innerHTML = list.map(f => {
    const membri = Array.isArray(f.membri) && f.membri.length ? f.membri :
      (Array.isArray(f.memberIds) ? f.memberIds.map(id => state.members.find(m => m.id === id)).filter(Boolean) : []);
    const capoObj = f.capofamiglia ? (typeof f.capofamiglia === 'object' ? f.capofamiglia : { nome: String(f.capofamiglia) }) :
      (f.capofamigliaId ? state.members.find(m => m.id === f.capofamigliaId) : membri[0]);
    const capoNome = capoObj ? (capoObj.nome && capoObj.cognome ? `${capoObj.cognome} ${capoObj.nome}` : (capoObj.nome || '')) : '';

    return `
      <div class="family-card">
        <div class="family-head">
          <div>
            <div class="family-title">🏠 ${escapeHtml(f.nome)}</div>
            <div style="margin-top:2px;">
              <span class="family-count">${membri.length} component${membri.length === 1 ? 'e' : 'i'}</span>
              ${capoNome ? `<span class="family-capo-badge" style="margin-left:6px;">★ ${escapeHtml(capoNome)}</span>` : ''}
            </div>
          </div>
          <div class="family-head-actions">
            <button class="btn small" data-action="edit-family" data-id="${f.id}" title="Modifica gruppo">✏️ Modifica</button>
            <button class="btn small primary" data-action="add-member-to-family" data-id="${f.id}" title="Aggiungi membro al gruppo">➕ Membro</button>
            <button class="btn small danger" data-action="delete-family" data-id="${f.id}" title="Elimina gruppo">🗑️</button>
          </div>
        </div>

        <div class="family-address">
          📍 ${escapeHtml(f.indirizzo || 'Indirizzo non specificato')}${f.comune ? `, ${escapeHtml(f.comune)}` : ''} ${f.provincia ? `(${escapeHtml(f.provincia)})` : ''}
        </div>

        ${f.note ? `
          <div style="font-size:12px; color:#475569; font-style:italic; margin-bottom:12px; background:#f8fafc; padding:6px 10px; border-radius:6px; border-left:3px solid #0284c7;">
            ${escapeHtml(f.note)}
          </div>
        ` : ''}

        <div class="family-members-list">
          ${membri.length === 0 ? `
            <div class="muted small" style="padding:10px; text-align:center; background:#f8fafc; border-radius:6px;">
              Nessun componente in questo gruppo. Fai clic su "➕ Membro" per aggiungerne.
            </div>
          ` : membri.map(m => {
            const isCapo = f.capofamigliaId === m.id;
            const age = calcAge(m.dataNascita);
            const waUrl = formatWaUrl(m.telefono);
            const telUri = formatTelUri(m.telefono);

            return `
              <div class="family-member-row">
                <div>
                  <div style="font-weight:700; color:#0f172a; display:flex; align-items:center; gap:6px;">
                    ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}
                    ${isCapo ? '<span class="family-capo-badge">Capofamiglia</span>' : ''}
                  </div>
                  <div class="muted small">
                    ${age ? `${age} anni · ` : ''}${escapeHtml(m.professione || '—')}
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:6px;">
                  ${waUrl ? `
                    <a href="${waUrl}" target="_blank" rel="noopener noreferrer" class="btn small success" style="padding:2px 7px; font-size:11px;" title="Chat WhatsApp">💬</a>
                  ` : ''}
                  ${telUri ? `
                    <a href="tel:${telUri}" class="btn small" style="padding:2px 7px; font-size:11px;" title="Chiama ${escapeHtml(m.telefono)}">📞</a>
                  ` : ''}
                  <button class="btn small danger" style="padding:2px 7px; font-size:11px;" data-action="remove-member-from-family" data-family-id="${f.id}" data-member-id="${m.id}" title="Rimuovi dal gruppo">
                    ✕
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Event listener per le azioni sui gruppi
  slot.querySelectorAll('button[data-action="edit-family"]').forEach(b => {
    b.addEventListener('click', () => {
      const famId = b.getAttribute('data-id');
      const fam = state.families.find(x => x.id === famId);
      if (fam) openFamilyModal(fam);
    });
  });

  slot.querySelectorAll('button[data-action="add-member-to-family"]').forEach(b => {
    b.addEventListener('click', () => {
      const famId = b.getAttribute('data-id');
      const fam = state.families.find(x => x.id === famId);
      if (fam) openAddMemberToFamilyModal(fam);
    });
  });

  slot.querySelectorAll('button[data-action="delete-family"]').forEach(b => {
    b.addEventListener('click', () => {
      const famId = b.getAttribute('data-id');
      const fam = state.families.find(x => x.id === famId);
      if (fam) confirmDeleteFamily(fam);
    });
  });

  slot.querySelectorAll('button[data-action="remove-member-from-family"]').forEach(b => {
    b.addEventListener('click', () => {
      const famId = b.getAttribute('data-family-id');
      const memberId = Number(b.getAttribute('data-member-id'));
      const fam = state.families.find(x => x.id === famId);
      const member = state.members.find(x => x.id === memberId);
      if (fam && member) removeMemberFromFamily(fam, member);
    });
  });
}

// ---------------------------------------------------------------- MODALI & AZIONI FAMIGLIE
function openFamilyModal(family = null, prefill = null) {
  const isEdit = !!family;
  const dlg = $('dlg');

  const currentMemberIds = family ? [...(family.memberIds || [])] : (prefill?.memberIds || []);
  const initialCapoId = family ? family.capofamigliaId : (prefill?.capofamigliaId || null);

  // Mappa di appartenenza attuale per mostrare lo stato di ciascun membro
  const memberGroupMap = {};
  state.families.forEach(f => {
    (f.memberIds || []).forEach(mId => {
      memberGroupMap[mId] = f.nome;
    });
  });

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>${isEdit ? `Modifica Gruppo: ${escapeHtml(family.nome)}` : 'Crea Nuovo Gruppo Familiare'}</h3>
      <button class="close-btn" id="btn-close-dlg">✕</button>
    </div>
    <form id="form-family-edit">
      <div class="dialog-body">
        <div class="form-group" style="margin-bottom:12px;">
          <label>Nome del Gruppo Familiare *</label>
          <input type="text" id="fam-nome" placeholder="es. Famiglia Astemio, Famiglia Rossi, Nucleo Bianchi..." value="${escapeHtml(family?.nome || prefill?.nome || '')}" required>
        </div>

        <div class="form-grid" style="margin-bottom:12px;">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Indirizzo di Residenza</label>
            <input type="text" id="fam-indirizzo" placeholder="es. Via Nuova 5" value="${escapeHtml(family?.indirizzo || prefill?.indirizzo || '')}">
          </div>
          <div class="form-group">
            <label>Comune</label>
            <input type="text" id="fam-comune" placeholder="es. Novara" value="${escapeHtml(family?.comune || prefill?.comune || '')}">
          </div>
          <div class="form-group">
            <label>Provincia</label>
            <input type="text" id="fam-provincia" placeholder="es. NO" maxlength="4" value="${escapeHtml(family?.provincia || prefill?.provincia || '')}">
          </div>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
          <label>Capofamiglia (opzionale)</label>
          <select id="fam-capofamiglia">
            <option value="">-- Nessun capofamiglia designato --</option>
            ${state.members.filter(m => (m.stato || 'Attivo') === 'Attivo').map(m => `
              <option value="${m.id}" ${initialCapoId === m.id ? 'selected' : ''}>
                ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)} (Prot. #${m.protocollo ?? m.id})
              </option>
            `).join('')}
          </select>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
          <label>Note sul nucleo</label>
          <input type="text" id="fam-note" placeholder="es. Famiglia pastorale, note particolari..." value="${escapeHtml(family?.note || prefill?.note || '')}">
        </div>

        <div class="form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="margin:0;">Seleziona i Componenti del Gruppo</label>
            <span class="muted small" id="fam-selected-count">${currentMemberIds.length} selezionati</span>
          </div>
          <div style="margin-bottom:8px;">
            <input type="text" id="filter-picker-members" placeholder="Filtra nominativi nella lista..." style="padding:6px 10px; font-size:12.5px;">
          </div>
          <div class="member-picker-list" id="picker-list">
            ${state.members.filter(m => (m.stato || 'Attivo') === 'Attivo').map(m => {
              const isChecked = currentMemberIds.includes(m.id);
              const curGroup = memberGroupMap[m.id];
              let statusLabel = '';
              if (curGroup) {
                if (family && curGroup === family.nome) {
                  statusLabel = '<span style="color:#0284c7; font-size:11px;">(già in questo gruppo)</span>';
                } else {
                  statusLabel = `<span style="color:#b45309; font-size:11px;">(in: ${escapeHtml(curGroup)})</span>`;
                }
              } else {
                statusLabel = '<span style="color:#15803d; font-size:11px;">(non assegnato)</span>';
              }

              return `
                <label class="member-picker-item ${isChecked ? 'selected' : ''}" data-name="${escapeHtml((m.cognome + ' ' + m.nome).toLowerCase())}">
                  <input type="checkbox" name="family-member" value="${m.id}" ${isChecked ? 'checked' : ''}>
                  <div style="flex:1;">
                    <strong>${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</strong>
                    ${statusLabel}
                  </div>
                  <div class="muted small">${escapeHtml(m.comune || '')}</div>
                </label>
              `;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" id="btn-cancel-dlg">Annulla</button>
        <button type="submit" class="btn primary">${isEdit ? 'Salva Modifiche Gruppo' : 'Crea Gruppo Familiare'}</button>
      </div>
    </form>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-cancel-dlg').addEventListener('click', () => dlg.close());

  // Filtro rapido dei membri nel picker
  const filterInput = $('filter-picker-members');
  filterInput?.addEventListener('input', () => {
    const term = filterInput.value.trim().toLowerCase();
    const items = dlg.querySelectorAll('.member-picker-item');
    items.forEach(it => {
      const name = it.getAttribute('data-name');
      it.style.display = (!term || name.includes(term)) ? 'flex' : 'none';
    });
  });

  // Aggiornamento dinamico conteggio selezionati
  const checkboxes = dlg.querySelectorAll('input[name="family-member"]');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.member-picker-item').classList.toggle('selected', cb.checked);
      const selCount = dlg.querySelectorAll('input[name="family-member"]:checked').length;
      $('fam-selected-count').textContent = `${selCount} selezionati`;
    });
  });

  $('form-family-edit').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = $('fam-nome').value.trim();
    if (!nome) {
      toast('Il nome del gruppo è obbligatorio', 'err');
      return;
    }

    const selectedMemberIds = Array.from(dlg.querySelectorAll('input[name="family-member"]:checked'))
      .map(cb => Number(cb.value));

    const payload = {
      nome,
      indirizzo: $('fam-indirizzo').value.trim(),
      comune: $('fam-comune').value.trim(),
      provincia: $('fam-provincia').value.trim().toUpperCase(),
      capofamigliaId: $('fam-capofamiglia').value ? Number($('fam-capofamiglia').value) : null,
      note: $('fam-note').value.trim(),
      memberIds: selectedMemberIds
    };

    try {
      if (isEdit) {
        await api(`/api/families/${family.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast(`Gruppo "${payload.nome}" aggiornato con successo!`);
      } else {
        await api('/api/families', { method: 'POST', body: JSON.stringify(payload) });
        toast(`Nuovo gruppo "${payload.nome}" creato con successo!`);
      }
      dlg.close();
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  dlg.showModal();
}

// Modale rapido per aggiungere un membro a un gruppo specifico
function openAddMemberToFamilyModal(family) {
  const dlg = $('dlg');
  const availableMembers = state.members.filter(m => (m.stato || 'Attivo') === 'Attivo' && !(family.memberIds || []).includes(m.id));

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>Aggiungi Membro a "${escapeHtml(family.nome)}"</h3>
      <button class="close-btn" id="btn-close-dlg">✕</button>
    </div>
    <form id="form-quick-add-member">
      <div class="dialog-body">
        <p class="muted small" style="margin-top:0;">
          Seleziona il fedele da associare a questo gruppo familiare.
        </p>
        <div class="form-group">
          <label>Membro del registro</label>
          <select id="select-quick-member" required>
            <option value="">-- Seleziona un membro --</option>
            ${availableMembers.map(m => `
              <option value="${m.id}">
                ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)} (Prot. #${m.protocollo ?? m.id}) · ${escapeHtml(m.comune || '—')}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" id="btn-cancel-dlg">Annulla</button>
        <button type="submit" class="btn primary">Aggiungi al Gruppo</button>
      </div>
    </form>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-cancel-dlg').addEventListener('click', () => dlg.close());

  $('form-quick-add-member').addEventListener('submit', async e => {
    e.preventDefault();
    const memberId = Number($('select-quick-member').value);
    if (!memberId) return;

    try {
      await api(`/api/families/${family.id}/add-member`, {
        method: 'POST',
        body: JSON.stringify({ memberId })
      });
      toast(`Membro aggiunto al gruppo "${family.nome}"!`);
      dlg.close();
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  dlg.showModal();
}

// Modale per assegnare un membro non assegnato a un gruppo esistente
function openAssignMemberModal(member) {
  const dlg = $('dlg');

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>Assegna ${escapeHtml(member.cognome)} ${escapeHtml(member.nome)} a un Gruppo</h3>
      <button class="close-btn" id="btn-close-dlg">✕</button>
    </div>
    <form id="form-assign-member">
      <div class="dialog-body">
        <p class="muted small" style="margin-top:0;">
          Scegli a quale nucleo familiare associare <strong>${escapeHtml(member.cognome)} ${escapeHtml(member.nome)}</strong>.
        </p>
        <div class="form-group" style="margin-bottom:14px;">
          <label>Seleziona Gruppo Familiare</label>
          <select id="select-target-family" required>
            <option value="">-- Seleziona gruppo esistente --</option>
            ${state.families.map(f => `
              <option value="${f.id}">
                🏠 ${escapeHtml(f.nome)} (${(f.membri || f.memberIds || []).length} componenti) · ${escapeHtml(f.indirizzo || '')}
              </option>
            `).join('')}
          </select>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" id="btn-cancel-dlg">Annulla</button>
        <button type="submit" class="btn primary">Assegna Membro</button>
      </div>
    </form>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-cancel-dlg').addEventListener('click', () => dlg.close());

  $('form-assign-member').addEventListener('submit', async e => {
    e.preventDefault();
    const familyId = $('select-target-family').value;
    if (!familyId) return;

    try {
      await api(`/api/families/${familyId}/add-member`, {
        method: 'POST',
        body: JSON.stringify({ memberId: member.id })
      });
      toast(`Membro assegnato al gruppo!`);
      dlg.close();
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  dlg.showModal();
}

async function removeMemberFromFamily(family, member) {
  if (!confirm(`Rimuovere ${member.cognome} ${member.nome} dal gruppo "${family.nome}"?\n\n(Il membro rimarrà regolarmente censito nel registro di chiesa).`)) {
    return;
  }

  try {
    await api(`/api/families/${family.id}/remove-member`, {
      method: 'POST',
      body: JSON.stringify({ memberId: member.id })
    });
    toast(`Membro rimosso dal gruppo "${family.nome}"`);
    await loadAllData();
  } catch (err) {
    toast(err.message, 'err');
  }
}

async function confirmDeleteFamily(family) {
  if (!confirm(`Sei sicuro di voler eliminare il gruppo "${family.nome}"?\n\nATTENZIONE: Verrà eliminato solo il gruppo familiare. I fedeli censiti rimarranno intatti nel registro e diventeranno disponibili come membri non assegnati.`)) {
    return;
  }

  try {
    await api(`/api/families/${family.id}`, { method: 'DELETE' });
    toast(`Gruppo "${family.nome}" eliminato`);
    await loadAllData();
  } catch (err) {
    toast(err.message, 'err');
  }
}

// ---------------------------------------------------------------- VISTA: RUBRICA & PRIVACY
function renderRubrica(container) {
  container.innerHTML = `
    <div class="toolbar">
      <h2>Rubrica Telefonica &amp; Consensi Privacy (GDPR)</h2>
      <div class="spacer"></div>
      <button class="btn" id="btn-copy-wa-numbers">📋 Copia Tutti i Cellulari WhatsApp</button>
    </div>

    <div class="card pad">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nominativo</th>
              <th>Cellulare / Telefono</th>
              <th>Email</th>
              <th>Consenso WhatsApp</th>
              <th>Consenso Foto/Video</th>
              <th style="text-align:right;">Azione Rapida</th>
            </tr>
          </thead>
          <tbody>
            ${state.members.map(m => {
              const waUrl = formatWaUrl(m.telefono);
              const telUri = formatTelUri(m.telefono);
              const hasWaConsent = m.consensoWhatsApp === 'Acconsentito' || m.consensoWhatsApp === true;
              const hasFotoConsent = m.consensoFotoVideo === 'Acconsentito' || m.consensoFotoVideo === true;

              return `
                <tr>
                  <td style="font-weight:700;">${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</td>
                  <td>
                    ${m.telefono ? `<a href="tel:${telUri}">${escapeHtml(m.telefono)}</a>` : '<span class="muted">—</span>'}
                  </td>
                  <td>
                    ${m.email ? `<a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>` : '<span class="muted">—</span>'}
                  </td>
                  <td>
                    ${hasWaConsent ? '<span class="badge green">✓ Acconsentito</span>' : '<span class="badge gray">Non rilasciato</span>'}
                  </td>
                  <td>
                    ${hasFotoConsent ? '<span class="badge green">✓ Acconsentito</span>' : '<span class="badge gray">Non rilasciato</span>'}
                  </td>
                  <td style="text-align:right;">
                    ${waUrl ? `
                      <a href="${waUrl}" target="_blank" class="btn small success" title="Invia messaggio WhatsApp">
                        💬 WhatsApp
                      </a>
                    ` : ''}
                    ${m.email ? `
                      <a href="mailto:${escapeHtml(m.email)}" class="btn small" title="Invia email">
                        ✉️ Email
                      </a>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $('btn-copy-wa-numbers')?.addEventListener('click', () => {
    const validNumbers = state.members
      .filter(m => m.telefono && (m.consensoWhatsApp === 'Acconsentito' || m.consensoWhatsApp === true))
      .map(m => m.telefono)
      .join(', ');

    if (!validNumbers) {
      toast('Nessun numero telefonico con consenso WhatsApp trovato', 'err');
      return;
    }

    navigator.clipboard.writeText(validNumbers).then(() => {
      toast('Numeri di telefono copiati negli appunti!');
    }).catch(() => {
      prompt('Copia i seguenti numeri:', validNumbers);
    });
  });
}

// ---------------------------------------------------------------- VISTA: IMPOSTAZIONI
function renderImpostazioni(container) {
  const s = state.settings || {};
  const cs = state.cloudStatus || {};
  state.settingsTab = state.settingsTab || 'chiesa';

  container.innerHTML = `
    <div class="toolbar" style="margin-bottom:14px;">
      <div>
        <h2 style="margin:0; font-size:18px;">⚙️ Impostazioni Gestionale &amp; Backup</h2>
        <div class="muted small">Configurazione generale della comunità, tipologie documenti e copie di sicurezza</div>
      </div>
    </div>

    <div class="settings-container">
      <!-- Barra Navigazione a Schede -->
      <div class="settings-nav">
        <button type="button" class="settings-tab-btn ${state.settingsTab === 'chiesa' ? 'active' : ''}" data-settings-tab="chiesa">
          ⛪ 1. Dati Comunità
        </button>
        <button type="button" class="settings-tab-btn ${state.settingsTab === 'documenti' ? 'active' : ''}" data-settings-tab="documenti">
          📁 2. Tipologie Documenti
        </button>
        <button type="button" class="settings-tab-btn ${state.settingsTab === 'backup' ? 'active' : ''}" data-settings-tab="backup">
          💾 3. Backup &amp; Cloud Drive
        </button>
        <button type="button" class="settings-tab-btn ${state.settingsTab === 'tutte' ? 'active' : ''}" data-settings-tab="tutte" style="margin-left:auto;">
          📑 Mostra Tutte le Sezioni
        </button>
      </div>

      <!-- SCHEDA 1: Dati della Comunità / Chiesa -->
      <div class="settings-panel ${state.settingsTab === 'chiesa' || state.settingsTab === 'tutte' ? 'active' : ''}" id="panel-chiesa">
        <div class="settings-card">
          <h3>⛪ Dati Ufficiali della Comunità / Chiesa</h3>
          <p class="settings-section-desc">
            Questi dati vengono utilizzati nelle intestazioni dei registri ufficiali, nelle schede anagrafiche dei fedeli e nei modelli di stampa A4.
          </p>

          <form id="form-settings">
            <div class="form-group" style="margin-bottom:16px;">
              <label style="font-weight:700;">Denominazione Ufficiale Chiesa *</label>
              <input type="text" id="set-chiesa" value="${escapeHtml(s.chiesa || '')}" required style="font-size:14px; font-weight:600; padding:8px 12px;">
            </div>

            <div class="form-grid" style="margin-bottom:16px;">
              <div class="form-group">
                <label style="font-weight:700;">Pastore Responsabile</label>
                <input type="text" id="set-pastore" value="${escapeHtml(s.pastore || '')}" placeholder="es. Nome e Cognome del Pastore" style="padding:8px 12px;">
              </div>
              <div class="form-group">
                <label style="font-weight:700;">Indirizzo della Sede</label>
                <input type="text" id="set-indirizzo" value="${escapeHtml(s.indirizzo || '')}" placeholder="es. Via/Piazza, Numero Civico" style="padding:8px 12px;">
              </div>
            </div>

            <div class="form-grid" style="margin-bottom:16px;">
              <div class="form-group">
                <label style="font-weight:700;">Città / Comune</label>
                <input type="text" id="set-citta" value="${escapeHtml(s.citta || '')}" placeholder="es. Novara" style="padding:8px 12px;">
              </div>
              <div class="form-group">
                <label style="font-weight:700;">Provincia (Sigla)</label>
                <input type="text" id="set-provincia" value="${escapeHtml(s.provincia || '')}" maxlength="4" placeholder="es. NO" style="padding:8px 12px; text-transform:uppercase;">
              </div>
            </div>

            <div class="form-grid" style="margin-bottom:20px;">
              <div class="form-group">
                <label style="font-weight:700;">Telefono / Cellulare Comunità</label>
                <input type="text" id="set-telefono" value="${escapeHtml(s.telefono || '')}" placeholder="es. 0321 ... / 333 ..." style="padding:8px 12px;">
              </div>
              <div class="form-group">
                <label style="font-weight:700;">Email Ufficiale / PEC</label>
                <input type="email" id="set-email" value="${escapeHtml(s.email || '')}" placeholder="es. segreteria@chiesa..." style="padding:8px 12px;">
              </div>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px 18px; margin-bottom:20px;">
              <div style="font-size:11px; font-weight:700; text-transform:uppercase; color:#64748b; letter-spacing:0.5px; margin-bottom:4px;">
                Anteprima Intestazione nelle Stampe A4:
              </div>
              <div style="font-size:15px; font-weight:700; color:#0f172a;" id="prev-chiesa">${escapeHtml(s.chiesa || 'Nome Comunità')}</div>
              <div style="font-size:12.5px; color:#475569; margin-top:2px;">
                Pastore: <strong id="prev-pastore">${escapeHtml(s.pastore || '—')}</strong> · Sede: <span id="prev-sede">${escapeHtml([s.indirizzo, s.citta, s.provincia].filter(Boolean).join(', ') || '—')}</span>
              </div>
            </div>

            <button type="submit" class="btn primary" style="padding:10px 24px; font-size:14px; font-weight:700;">
              💾 Salva Dati Comunità
            </button>
          </form>
        </div>
      </div>

      <!-- SCHEDA 2: Tipologie Documenti Allegabili -->
      <div class="settings-panel ${state.settingsTab === 'documenti' || state.settingsTab === 'tutte' ? 'active' : ''}" id="panel-documenti">
        <div class="settings-card" id="card-doc-categories">
          <h3>📁 Tipologie Documenti Allegabili alle Schede</h3>
          <p class="settings-section-desc">
            Configura le categorie e le tipologie di documenti da poter allegare alle schede anagrafiche dei membri.
          </p>

          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 16px; margin-bottom:18px; font-size:13px; color:#166534; line-height:1.45; display:flex; align-items:flex-start; gap:10px;">
            <span style="font-size:20px; line-height:1;">☁️</span>
            <div>
              <strong>Archiviazione Cloud Diretta:</strong> I documenti allegati non appesantiscono il disco locale né il database, ma vengono archiviati direttamente su <strong>Google Drive</strong> nella cartella dedicata <code>Registro Chiesa / Allegati / [Tipologia]</code>.
            </div>
          </div>

          <!-- Form aggiunta -->
          <form id="form-add-doc-cat" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:18px;">
            <label style="font-size:13px; font-weight:700; color:#0f172a; display:block; margin-bottom:8px;">
              ➕ Aggiungi Nuova Tipologia di Documento:
            </label>
            <div style="display:flex; gap:10px;">
              <input type="text" id="input-new-doc-cat" placeholder="es. Certificato Matrimonio, Atto Notarile, Modulo Minori..." required style="flex:1; font-size:13.5px; padding:8px 12px;">
              <button type="submit" class="btn primary" style="white-space:nowrap; padding:8px 18px; font-weight:700;">➕ Aggiungi</button>
            </div>
          </form>

          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <span style="font-size:13.5px; font-weight:700; color:#1e293b;">
              Tipologie Attualmente Configurate (<span id="doc-cat-count">0</span>):
            </span>
            <button type="button" class="btn small" id="btn-reset-doc-cats" style="font-size:12px; padding:5px 10px;" title="Ripristina l'elenco standard predefinito">
              🔄 Ripristina Predefinite
            </button>
          </div>

          <div id="doc-cats-container" style="display:flex; flex-direction:column; gap:8px;">
            <!-- Popolato dinamicamente da updateDocCatsUI() -->
          </div>
        </div>
      </div>

      <!-- SCHEDA 3: Backup, Esportazione & Cloud Google Drive -->
      <div class="settings-panel ${state.settingsTab === 'backup' || state.settingsTab === 'tutte' ? 'active' : ''}" id="panel-backup">
        <!-- Card Backup Locale -->
        <div class="settings-card">
          <h3>💾 Backup Locale ed Esportazione Dati</h3>
          <p class="settings-section-desc">
            I dati sono memorizzati in locale su questo computer in <code>data/db.json</code>. Viene creata una copia di sicurezza automatica a ogni avvio del programma.
          </p>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px; margin-bottom:20px;">
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="font-weight:700; color:#0f172a; margin-bottom:4px; font-size:14px;">📊 Esportazione Excel (CSV)</div>
                <div class="muted small" style="margin-bottom:14px;">Scarica l'elenco anagrafico di tutti i membri compatibile con Microsoft Excel, Calc o Google Fogli.</div>
              </div>
              <a href="/api/export/csv" class="btn" style="text-align:center;">📥 Scarica Tabella Membri (CSV)</a>
            </div>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="font-weight:700; color:#0f172a; margin-bottom:4px; font-size:14px;">📦 Backup Completo (JSON)</div>
                <div class="muted small" style="margin-bottom:14px;">Salva un archivio completo con membri, famiglie, registri e impostazioni.</div>
              </div>
              <a href="/api/export/json" class="btn" style="text-align:center;">📦 Scarica Backup Completo (JSON)</a>
            </div>
          </div>

          <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:8px; padding:16px;">
            <div style="font-weight:700; color:#c2410c; margin-bottom:4px; font-size:13.5px;">⚠️ Ripristino Database da File di Backup</div>
            <div class="muted small" style="color:#9a3412; margin-bottom:12px;">
              Attenzione: il ripristino sostituirà tutti i dati correnti del gestionale con quelli del file JSON selezionato.
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <input type="file" id="input-restore-file" accept=".json" style="flex:1; min-width:240px; padding:6px; font-size:13px; background:#fff; border:1px solid #fdba74; border-radius:6px;">
              <button class="btn danger small" id="btn-do-restore" style="padding:8px 16px; font-weight:700;">Ripristina Database</button>
            </div>
          </div>
        </div>

        <!-- Card Cloud Google Drive -->
        <div class="settings-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
            <h3 style="margin:0;">☁️ Sincronizzazione Google Drive</h3>
            <span class="badge ${cs.connected ? 'green' : (cs.configured ? 'blue' : '')}" style="font-size:12px; padding:4px 10px;">
              ${cs.connected ? '🟢 Connesso' : (cs.configured ? 'Pronto all\'accesso' : 'Non configurato')}
            </span>
          </div>

          <p class="settings-section-desc">
            ${cs.configured 
              ? '✓ <strong>ID Applicazione memorizzato e pronto</strong>: i computer su cui installerai l\'app avranno già la configurazione pronta.' 
              : 'Inserisci o importa il Client ID del progetto Google Cloud per abilitare la sincronizzazione automatica.'}
          </p>

          ${cs.connected ? `
            <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:14px 18px; margin-bottom:16px; font-size:13px;">
              <div style="font-weight:700; color:#166534; font-size:14px; margin-bottom:6px;">
                ✓ Account Connesso: ${escapeHtml(cs.accountEmail || 'Account Google')}
              </div>
              <div class="muted small" style="margin-bottom:2px;">Cartella Cloud: <code>${escapeHtml(cs.folderName || 'Registro Chiesa')}</code></div>
              <div class="muted small">Ultimo salvataggio: ${cs.lastSync ? new Date(cs.lastSync).toLocaleString('it-IT') : 'Mai eseguito'}</div>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap;">
              <button class="btn success small" id="btn-cloud-sync-now" style="padding:8px 14px; font-weight:600;">🔄 Sincronizza &amp; Riconcilia da Drive</button>
              <button class="btn small" id="btn-cloud-restore-now" style="padding:8px 14px;">⬇️ Scarica e Ripristina da Drive</button>
              <button class="btn small" id="btn-cloud-config" style="padding:8px 14px;">⚙️ Configurazione Drive</button>
              <button class="btn danger small" id="btn-cloud-disconnect" style="padding:8px 14px;">Disconnetti</button>
            </div>
          ` : `
            <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:14px;">
              <div style="margin-bottom:14px; font-size:13.5px; line-height:1.45;">
                ${cs.configured ? `
                  <span style="color:#059669; font-weight:700;">✓ Client ID già memorizzato per l'installer.</span><br>
                  Fai clic su <strong>Accedi con Google Drive</strong> per autorizzare il salvataggio sicuro dei registri della comunità.
                ` : `
                  Importa il file <code>client_secret_*.json</code> scaricato da Google Cloud Console oppure inserisci le chiavi manualmente.
                `}
              </div>
              <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                <button class="btn primary" id="btn-cloud-login-now" style="font-weight:700; padding:9px 18px;">
                  🔑 Accedi con Google Drive
                </button>
                <button class="btn small" id="btn-cloud-import-file">📂 Importa client_secret.json</button>
                <button class="btn small" id="btn-cloud-config">⚙️ Modifica Chiavi</button>
                <input type="file" id="input-cloud-secret-file" accept=".json" style="display:none;">
              </div>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  // Gestione Navigazione a Schede (Subtabs)
  container.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-settings-tab');
      state.settingsTab = tab;

      container.querySelectorAll('.settings-tab-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-settings-tab') === tab);
      });

      const panels = {
        chiesa: container.querySelector('#panel-chiesa'),
        documenti: container.querySelector('#panel-documenti'),
        backup: container.querySelector('#panel-backup')
      };

      if (tab === 'tutte') {
        panels.chiesa?.classList.add('active');
        panels.documenti?.classList.add('active');
        panels.backup?.classList.add('active');
      } else {
        panels.chiesa?.classList.toggle('active', tab === 'chiesa');
        panels.documenti?.classList.toggle('active', tab === 'documenti');
        panels.backup?.classList.toggle('active', tab === 'backup');
      }
    });
  });

  // Aggiornamento live anteprima intestazione
  const updateSettingsPreview = () => {
    const ch = $('set-chiesa')?.value.trim() || 'Nome Comunità';
    const pa = $('set-pastore')?.value.trim() || '—';
    const ind = $('set-indirizzo')?.value.trim();
    const ci = $('set-citta')?.value.trim();
    const pr = $('set-provincia')?.value.trim().toUpperCase();
    const sede = [ind, ci, pr].filter(Boolean).join(', ') || '—';

    if ($('prev-chiesa')) $('prev-chiesa').textContent = ch;
    if ($('prev-pastore')) $('prev-pastore').textContent = pa;
    if ($('prev-sede')) $('prev-sede').textContent = sede;
  };

  ['set-chiesa', 'set-pastore', 'set-indirizzo', 'set-citta', 'set-provincia'].forEach(id => {
    $(id)?.addEventListener('input', updateSettingsPreview);
  });

  $('form-settings').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const payload = {
        chiesa: $('set-chiesa').value.trim(),
        pastore: $('set-pastore').value.trim(),
        indirizzo: $('set-indirizzo').value.trim(),
        citta: $('set-citta').value.trim(),
        provincia: $('set-provincia').value.trim().toUpperCase(),
        telefono: $('set-telefono').value.trim(),
        email: $('set-email').value.trim()
      };
      state.settings = await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
      $('church-name').textContent = state.settings.chiesa;
      toast('Impostazioni chiesa salvate con successo!');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  // Gestione Tipologie Documenti Allegabili
  const updateDocCatsUI = async () => {
    const containerEl = $('doc-cats-container');
    const countEl = $('doc-cat-count');
    if (!containerEl) return;

    let docCats = getDocCategories();
    let counts = {};

    try {
      const data = await api('/api/settings/doc-categories');
      if (data && Array.isArray(data.categories)) {
        docCats = data.categories;
        state.settings.categorieDocumenti = data.categories;
        counts = data.counts || {};
      }
    } catch {
      (state.members || []).forEach(m => {
        (m.allegati || []).forEach(a => {
          const c = a.categoria || 'Altro Documento';
          counts[c] = (counts[c] || 0) + 1;
        });
      });
    }

    if (countEl) countEl.textContent = docCats.length;

    if (docCats.length === 0) {
      containerEl.innerHTML = `
        <div class="muted small" style="text-align:center; padding:16px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:6px;">
          Nessuna tipologia definita. Clicca su "Ripristina Predefinite" per ricaricare le tipologie standard.
        </div>
      `;
      return;
    }

    containerEl.innerHTML = docCats.map((cat, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === docCats.length - 1;
      const count = counts[cat] || 0;
      return `
        <div class="doc-cat-item" style="display:flex; align-items:center; justify-content:space-between; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; gap:10px; transition:all .15s ease;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <span style="font-size:16px;">📄</span>
            <div style="min-width:0; overflow:hidden;">
              <strong style="color:#0f172a; font-size:13px; display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(cat)}</strong>
              <span class="muted small" style="font-size:11px;">
                ${count > 0 ? `📎 <strong>${count}</strong> ${count === 1 ? 'file archiviato' : 'file archiviati'}` : 'Nessun file collegato'}
              </span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
            <button type="button" class="btn small" data-move-doc-cat="up" data-idx="${idx}" ${isFirst ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="Sposta in alto" style="padding:3px 7px; font-size:11px;">⬆️</button>
            <button type="button" class="btn small" data-move-doc-cat="down" data-idx="${idx}" ${isLast ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : ''} title="Sposta in basso" style="padding:3px 7px; font-size:11px;">⬇️</button>
            <button type="button" class="btn small" data-rename-doc-cat="${idx}" title="Rinomina tipologia" style="padding:3px 8px; font-size:11px; margin-left:4px;">✏️ Rinomina</button>
            <button type="button" class="btn small danger" data-delete-doc-cat="${idx}" title="Elimina tipologia" style="padding:3px 8px; font-size:11px;">🗑️</button>
          </div>
        </div>
      `;
    }).join('');

    // Handlers Sposta su / giù
    containerEl.querySelectorAll('button[data-move-doc-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const direction = btn.getAttribute('data-move-doc-cat');
        const idx = Number(btn.getAttribute('data-idx'));
        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= docCats.length) return;
        const newCats = [...docCats];
        const tmp = newCats[idx];
        newCats[idx] = newCats[newIdx];
        newCats[newIdx] = tmp;
        try {
          const res = await api('/api/settings/doc-categories', {
            method: 'POST',
            body: JSON.stringify({ action: 'saveAll', categories: newCats })
          });
          state.settings.categorieDocumenti = res.categories;
          toast('Ordinamento tipologie salvato!');
          updateDocCatsUI();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });

    // Handler Rinomina
    containerEl.querySelectorAll('button[data-rename-doc-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-rename-doc-cat'));
        const oldName = docCats[idx];
        const newName = prompt(`Rinomina la tipologia di documento:\n\nAttuale: "${oldName}"\nNuovo nome:`, oldName);
        if (!newName || !newName.trim() || newName.trim() === oldName) return;
        try {
          const res = await api('/api/settings/doc-categories', {
            method: 'POST',
            body: JSON.stringify({ action: 'rename', oldName, newName: newName.trim() })
          });
          state.settings.categorieDocumenti = res.categories;
          (state.members || []).forEach(m => {
            (m.allegati || []).forEach(a => {
              if ((a.categoria || '').toLowerCase() === oldName.toLowerCase()) {
                a.categoria = newName.trim();
              }
            });
          });
          toast(`Tipologia rinominata in "${newName.trim()}"${res.updatedCount ? ` (${res.updatedCount} documenti aggiornati)` : ''}!`);
          updateDocCatsUI();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });

    // Handler Elimina
    containerEl.querySelectorAll('button[data-delete-doc-cat]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-delete-doc-cat'));
        const cat = docCats[idx];
        const count = counts[cat] || 0;
        let confirmMsg = `Sei sicuro di voler eliminare la tipologia "${cat}"?`;
        if (count > 0) {
          confirmMsg = `Attenzione: ci sono ${count} file archiviati con la tipologia "${cat}".\n\nEliminandola, non sarà più selezionabile per i nuovi file, ma i file già archiviati conserveranno il documento.\n\nVuoi procedere?`;
        }
        if (!confirm(confirmMsg)) return;
        try {
          const res = await api('/api/settings/doc-categories', {
            method: 'POST',
            body: JSON.stringify({ action: 'delete', name: cat })
          });
          state.settings.categorieDocumenti = res.categories;
          toast(`Tipologia "${cat}" eliminata!`);
          updateDocCatsUI();
        } catch (err) {
          toast(err.message, 'err');
        }
      });
    });
  };

  updateDocCatsUI();

  $('form-add-doc-cat')?.addEventListener('submit', async e => {
    e.preventDefault();
    const input = $('input-new-doc-cat');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    try {
      const res = await api('/api/settings/doc-categories', {
        method: 'POST',
        body: JSON.stringify({ action: 'add', name })
      });
      state.settings.categorieDocumenti = res.categories;
      toast(`Nuova tipologia "${name}" aggiunta con successo!`);
      input.value = '';
      updateDocCatsUI();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('btn-reset-doc-cats')?.addEventListener('click', async () => {
    if (!confirm('Ripristinare l\'elenco predefinito delle 6 tipologie di documento standard?\n(Certificato di Battesimo, Attestato di Trasferimento, Documento di Identità / CF, Modulo Privacy Firmato, Certificato di Matrimonio, Altro Documento)')) return;
    try {
      const res = await api('/api/settings/doc-categories', {
        method: 'POST',
        body: JSON.stringify({ action: 'reset' })
      });
      state.settings.categorieDocumenti = res.categories;
      toast('Tipologie documenti predefinite ripristinate!');
      updateDocCatsUI();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('btn-do-restore')?.addEventListener('click', async () => {
    const fileInput = $('input-restore-file');
    if (!fileInput.files || !fileInput.files[0]) {
      toast('Seleziona un file JSON di backup', 'err');
      return;
    }
    if (!confirm('ATTENZIONE: Il ripristino sostituirà tutti i dati correnti con quelli del file. Continuare?')) {
      return;
    }

    try {
      const file = fileInput.files[0];
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await api('/api/import/json', { method: 'POST', body: JSON.stringify(parsed) });
      toast(`Ripristinati con successo ${res.count} membri!`);
      await loadAllData();
    } catch (err) {
      toast(`Errore ripristino: ${err.message}`, 'err');
    }
  });

  // Google Drive Handlers
  $('btn-cloud-login-now')?.addEventListener('click', async () => {
    try {
      const auth = await api('/api/cloud/auth-url');
      window.open(auth.url, '_blank', 'width=620,height=720');
      toast('Finestra di autorizzazione Google aperta...');
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('btn-cloud-import-file')?.addEventListener('click', () => {
    $('input-cloud-secret-file')?.click();
  });

  $('input-cloud-secret-file')?.addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await api('/api/cloud/import-secret', { method: 'POST', body: JSON.stringify(parsed) });
      toast('Client ID Google memorizzato e configurato con successo per tutti i PC!');
      await loadAllData();
    } catch (err) {
      toast(`Errore importazione file credenziali: ${err.message}`, 'err');
    }
  });

  $('btn-cloud-restore-now')?.addEventListener('click', async () => {
    if (!confirm('ATTENZIONE: Scaricare il database da Google Drive sovrascriverà i dati locali con l\'ultima versione salvata su Drive. Continuare?')) {
      return;
    }
    try {
      toast('Download da Google Drive in corso...');
      const res = await api('/api/cloud/restore-latest', { method: 'POST' });
      toast(`Database ripristinato con successo da Drive (${res.count} membri)!`);
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('btn-cloud-config')?.addEventListener('click', () => openCloudConfigModal());

  $('btn-cloud-sync-now')?.addEventListener('click', async () => {
    try {
      toast('Sincronizzazione e verifica allegati con Google Drive in corso...');
      const res = await api('/api/cloud/sync-and-reconcile', { method: 'POST' });
      if (res.reconciledCount > 0) {
        toast(`Sincronizzazione completata: ${res.totalMembers} membri, ${res.totalAttachments} allegati (${res.reconciledCount} recuperati e collegati da Drive)!`);
      } else {
        toast(`Sincronizzazione completata: ${res.totalMembers} membri, ${res.totalAttachments} allegati perfettamente allineati con Google Drive.`);
      }
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  $('btn-cloud-disconnect')?.addEventListener('click', async () => {
    if (!confirm('Disconnettere Google Drive da questa postazione?')) return;
    try {
      await api('/api/cloud/disconnect', { method: 'POST' });
      if (window.driveClient && typeof window.driveClient.disconnect === 'function') {
        window.driveClient.disconnect();
      }
      toast('Google Drive disconnesso con successo');
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });
}

// ---------------------------------------------------------------- MODALE: LOGO UFFICIALE INGRANDIBILE
function openLogoLightboxModal() {
  const dlg = $('dlg');
  if (!dlg) return;

  dlg.innerHTML = `
    <div class="dialog-header" style="background:#0f172a; color:#fff;">
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:22px;">🏛️</span>
        <div>
          <h3 style="margin:0; font-size:16px; color:#fff;">Logo Ufficiale della Chiesa</h3>
          <div style="font-size:11.5px; opacity:0.85;">Chiesa Evangelica Pentecostale e Missionaria "Come Tralci" - Novara</div>
        </div>
      </div>
      <button class="close-btn" id="btn-close-logo-dlg" style="color:#fff;">✕</button>
    </div>
    <div class="dialog-body center" style="padding:24px 16px; background:#f8fafc; user-select:none;">
      <div style="max-width:520px; margin:0 auto; background:#ffffff; padding:20px; border-radius:12px; border:1px solid #cbd5e1; box-shadow:0 10px 25px -5px rgba(0,0,0,0.12); overflow:hidden;">
        <img src="logo.png" alt="Logo Ufficiale Come Tralci Novara" id="modal-zoomable-logo" style="width:100%; max-height:400px; object-fit:contain; border-radius:8px; cursor:zoom-in; transition:transform 0.25s ease;" title="Fai clic per ingrandire o rimpicciolire il logo">
      </div>
      <div class="muted small center" style="margin-top:14px; font-size:12px;">
        🔍 <strong>Fai clic sul logo per ingrandirlo / ridurlo</strong> (o usa il pulsante in basso)
      </div>
    </div>
    <div class="dialog-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
      <a href="logo.png" download="Logo_Come_Tralci_Novara.png" class="btn small" style="padding:6px 14px; font-weight:600;">
        💾 Salva File Logo (PNG)
      </a>
      <div style="display:flex; gap:8px;">
        <button type="button" class="btn small" id="btn-toggle-logo-zoom" style="font-weight:600;">🔍 Ingrandisci Zoom</button>
        <button type="button" class="btn primary small" id="btn-close-logo-btn">Chiudi</button>
      </div>
    </div>
  `;

  let isZoomed = false;
  const img = $('modal-zoomable-logo');
  const toggleBtn = $('btn-toggle-logo-zoom');

  function toggleZoom() {
    isZoomed = !isZoomed;
    if (isZoomed) {
      if (img) {
        img.style.transform = 'scale(1.45)';
        img.style.cursor = 'zoom-out';
      }
      if (toggleBtn) toggleBtn.textContent = '🔍 Riduci Zoom';
    } else {
      if (img) {
        img.style.transform = 'scale(1)';
        img.style.cursor = 'zoom-in';
      }
      if (toggleBtn) toggleBtn.textContent = '🔍 Ingrandisci Zoom';
    }
  }

  img?.addEventListener('click', toggleZoom);
  toggleBtn?.addEventListener('click', toggleZoom);
  $('btn-close-logo-dlg')?.addEventListener('click', () => dlg.close());
  $('btn-close-logo-btn')?.addEventListener('click', () => dlg.close());

  if (!dlg.open) dlg.showModal();
}

// ---------------------------------------------------------------- MODALI: DETTAGLIO MEMBRO
function openMemberProfile(m) {
  const dlg = $('dlg');
  const age = calcAge(m.dataNascita);
  const isEff = m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua);
  const isVed = !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov');
  const isSost = !!m.isSostenuto;

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>Scheda Membro: ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)} (Prot. #${m.protocollo ?? m.id})</h3>
      <button class="close-btn" id="btn-close-dlg" title="Chiudi scheda">✕ Chiudi</button>
    </div>
    <div class="dialog-body">
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:16px; border-bottom:1px solid var(--line); padding-bottom:14px;">
        <div class="avatar" style="width:48px; height:48px; font-size:18px;">
          ${(m.nome[0] || '').toUpperCase()}${(m.cognome[0] || '').toUpperCase()}
        </div>
        <div style="flex:1;">
          <div style="font-size:18px; font-weight:700; color:#0f172a;">${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</div>
          <div style="display:flex; align-items:center; gap:6px; margin-top:4px; flex-wrap:wrap;">
            <span class="prot-pill" style="font-size:12px; background:#e0f2fe; border-color:#0284c7; color:#0369a1;">📋 Prot. #${m.protocollo ?? m.id}</span>
            <span class="badge ${isEff ? 'effettivo' : 'aderente'}">${isEff ? 'Membro Effettivo' : 'Membro Aderente'}</span>
            ${isVed ? '<span class="badge vedova">Registro Vedove/i</span>' : ''}
            <span class="badge ${(m.stato || 'Attivo') === 'Attivo' ? 'green' : 'danger'}" style="font-size:11px; font-weight:700;">
              ● Stato: ${escapeHtml(m.stato || 'Attivo')}
            </span>
            <button type="button" class="btn small" id="btn-toggle-member-status" style="font-size:11px; padding:2px 8px; line-height:1.2;" title="Cambia stato del membro">
              ${(m.stato || 'Attivo') === 'Attivo' ? '⏸️ Disattiva' : '▶️ Riattiva'}
            </button>
            <span class="muted small">· Data Adesione: <strong>${m.dataAdesione ? formatDate(m.dataAdesione) : '—'}</strong></span>
          </div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px;">
        <div>
          <div class="muted small">Protocollo</div>
          <div style="font-weight:700; color:#0284c7; font-size:14px;">#${m.protocollo ?? m.id} <span class="muted small" style="font-weight:normal;">(ID #${m.id})</span></div>
        </div>
        <div>
          <div class="muted small">Codice Fiscale</div>
          <div style="font-family:monospace; font-weight:700; color:#0f172a; letter-spacing:0.5px;">${escapeHtml(m.codiceFiscale || '—')}</div>
        </div>

        <div>
          <div class="muted small">Data di Nascita</div>
          <div style="font-weight:600;">${formatDate(m.dataNascita)} ${age ? `(${age} anni)` : ''}</div>
        </div>
        <div>
          <div class="muted small">Luogo di Nascita</div>
          <div style="font-weight:600;">${escapeHtml(m.luogoNascita || '—')} ${m.provinciaNascita ? `(${escapeHtml(m.provinciaNascita)})` : ''}</div>
        </div>

        <div>
          <div class="muted small">Stato Civile</div>
          <div style="font-weight:600;">${escapeHtml(m.statoCivile || (isVed ? 'Vedovo/a' : '—'))}</div>
        </div>
        <div>
          <div class="muted small">Data Adesione Comunità</div>
          <div style="font-weight:600; color:#0369a1;">${m.dataAdesione ? formatDate(m.dataAdesione) : '—'}</div>
        </div>

        <div>
          <div class="muted small">Professione</div>
          <div style="font-weight:600;">${escapeHtml(m.professione || '—')}</div>
        </div>
        <div>
          <div class="muted small">Titolo di Studio</div>
          <div style="font-weight:600;">${escapeHtml(m.titoloStudio || '—')}</div>
        </div>

        <div style="grid-column:1 / -1;">
          <div class="muted small">Residenza</div>
          <div style="font-weight:600;">${escapeHtml(m.indirizzo || '—')}, ${escapeHtml(m.comune || '—')} ${m.provincia ? `(${escapeHtml(m.provincia)})` : ''}</div>
        </div>

        <div>
          <div class="muted small">Telefono</div>
          <div>
            ${m.telefono ? `
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="font-weight:600; color:#0f172a;">${escapeHtml(m.telefono)}</span>
                ${formatWaUrl(m.telefono) ? `
                  <a href="${formatWaUrl(m.telefono)}" target="_blank" rel="noopener noreferrer" class="btn small success" style="padding:1px 8px; font-size:11.5px; text-decoration:none;" title="Chat WhatsApp">💬 WhatsApp</a>
                ` : ''}
              </div>
            ` : '—'}
          </div>
        </div>
        <div>
          <div class="muted small">Email</div>
          <div>${m.email ? `<a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a>` : '—'}</div>
        </div>

        <div style="grid-column:1 / -1;">
          <div class="muted small">Nucleo Familiare Associato</div>
          <div style="font-weight:600;">
            ${(() => {
              const f = (state.families || []).find(fam => (fam.memberIds || []).includes(m.id));
              if (!f) return '<span class="muted">Nessun gruppo familiare associato</span>';
              return '🏠 ' + escapeHtml(f.nome) + (f.capofamigliaId === m.id ? ' <span class="family-capo-badge">★ Capofamiglia</span>' : '');
            })()}
          </div>
        </div>
      </div>

      ${(isSost || m.dettaglioSostegno) ? `
        <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:8px 12px; margin-bottom:12px;">
          <div style="font-weight:700; color:#c2410c; margin-bottom:4px; font-size:12px;">Dettaglio Sostegno Pastorale / Carità</div>
          <div>${escapeHtml(m.dettaglioSostegno || 'Incluso nelle visite e supporto di carità della chiesa')}</div>
        </div>
      ` : ''}

      <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:6px; padding:10px 14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Battesimo in Acqua:</span>
          <strong>${m.battesimoAcqua ? (m.dataBA ? `✓ Celebrato (${formatDate(m.dataBA)})` : '✓ Celebrato') : 'Non celebrato'}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span>Battesimo Spirito Santo:</span>
          <strong>${m.battesimoSpiritoSanto ? (m.dataSS ? `✓ Ricevuto (${formatDate(m.dataSS)})` : '✓ Ricevuto') : 'Non ancora ricevuto'}</strong>
        </div>
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:12px;">
        <div style="font-weight:700; color:#475569; margin-bottom:6px; font-size:12px;">Consensi Privacy (GDPR)</div>
        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
          <span>Comunicazioni WhatsApp:</span>
          <strong style="color:#15803d;">${escapeHtml(m.consensoWhatsApp || 'Non specificato')}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span>Foto / Video Ecclesiali:</span>
          <strong style="color:#15803d;">${escapeHtml(m.consensoFotoVideo || 'Non specificato')}</strong>
        </div>
      </div>

      <!-- SEZIONE DOCUMENTI & ALLEGATI -->
      <div style="background:#ffffff; border:1px solid var(--line); border-radius:6px; padding:12px 14px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid var(--line); padding-bottom:6px;">
          <div style="font-weight:700; color:#0f172a; font-size:13px; display:flex; align-items:center; gap:6px;">
            <span>📎</span> Documenti &amp; Fascicolo Membro
            <span class="badge gray" style="font-size:11px;">${(m.allegati || []).length} allegati</span>
          </div>
          <button type="button" class="btn small primary" id="btn-show-add-attachment">+ Allega Documento</button>
        </div>

        <!-- Form caricamento allegato -->
        <div id="add-attachment-panel" style="display:none; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px 12px; margin-bottom:12px;">
          <div style="font-weight:700; font-size:12px; margin-bottom:8px; color:#1e293b;">Carica Nuovo Documento</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:8px;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:3px;">
                <label class="small muted" style="margin:0;">Categoria Documento *</label>
                <a href="#impostazioni" id="link-goto-settings-doccats" class="small" style="color:#0284c7; text-decoration:underline; font-size:11px;" title="Configura o aggiungi nuove tipologie nelle Impostazioni">⚙️ Gestisci tipologie</a>
              </div>
              <select id="att-categoria" style="font-size:12.5px; padding:6px 8px;">
                ${renderDocCategoryOptions()}
              </select>
            </div>
            <div>
              <label class="small muted" style="display:block; margin-bottom:3px;">Descrizione / Titolo</label>
              <input type="text" id="att-titolo" placeholder="es. Battesimo 2024, Carta Identità..." style="font-size:12.5px; padding:6px 8px;">
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <input type="file" id="input-file-doc" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.odt,.txt" style="font-size:12px; max-width:280px;">
            <div style="display:flex; gap:6px;">
              <button type="button" class="btn small" id="btn-cancel-add-attachment">Annulla</button>
              <button type="button" class="btn small success" id="btn-submit-attachment">Carica &amp; Salva</button>
            </div>
          </div>
        </div>

        <!-- Lista Documenti Esistenti -->
        <div id="attachments-list">
          ${(m.allegati || []).length === 0 ? `
            <div class="muted small center" style="padding:12px 0;">
              Nessun documento allegato. Fai clic su "+ Allega Documento" per caricare certificati o scansioni.
            </div>
          ` : `
            <div style="display:flex; flex-direction:column; gap:6px;">
              ${(m.allegati || []).map(att => {
                const isPdf = (att.mimeType || '').includes('pdf') || (att.fileName || '').endsWith('.pdf');
                const isImg = (att.mimeType || '').includes('image');
                const icon = isPdf ? '📄' : (isImg ? '🖼️' : '📝');

                return `
                  <div style="display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; padding:6px 10px; font-size:12px;">
                    <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                      <span style="font-size:16px;">${icon}</span>
                      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <a href="/api/members/${m.id}/attachments/${att.id}" target="_blank" style="font-weight:700; color:#0369a1;" title="Visualizza / Scarica">
                          ${escapeHtml(att.titolo || att.fileName)}
                        </a>
                        <span class="muted small" style="margin-left:6px;">
                          [${escapeHtml(att.categoria || 'Generale')}] · ${escapeHtml(att.fileName)} · ${att.sizeFormatted || ''} · ${formatDate((att.dataCaricamento || '').slice(0, 10))}
                          ${att.driveFileId ? `<span class="badge blue" style="font-size:10px; padding:1px 5px; margin-left:4px;">☁️ Drive</span>` : ''}
                        </span>
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-left:10px;">
                      <a href="/api/members/${m.id}/attachments/${att.id}" target="_blank" class="btn small" style="padding:2px 8px; font-size:11px;" title="Apri documento">
                        👁️ Apri
                      </a>
                      ${att.driveViewLink ? `
                        <a href="${att.driveViewLink}" target="_blank" class="btn small" style="padding:2px 7px; font-size:11px; background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" title="Apri direttamente nella cartella Google Drive">
                          ☁️ Drive
                        </a>
                      ` : ''}
                      <button type="button" class="btn small danger" data-delete-att="${att.id}" style="padding:2px 7px; font-size:11px;" title="Elimina allegato">
                        🗑️
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    </div>
    <div class="dialog-footer">
      <a href="/api/print/member/${m.id}" target="_blank" class="btn btn-print">🖨️ Stampa Scheda Ufficiale A4</a>
      <button class="btn primary" id="btn-profile-edit">✏️ Modifica</button>
      <button class="btn" id="btn-profile-close">Chiudi</button>
    </div>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-profile-close').addEventListener('click', () => dlg.close());
  $('link-goto-settings-doccats')?.addEventListener('click', () => dlg.close());
  $('btn-profile-edit').addEventListener('click', () => {
    dlg.close();
    openMemberModal(m);
  });

  $('btn-toggle-member-status')?.addEventListener('click', async () => {
    const isAttivo = (m.stato || 'Attivo') === 'Attivo';
    const newStatus = isAttivo ? 'Non attivo' : 'Attivo';
    const msg = isAttivo 
      ? `Disattivare il membro ${m.cognome} ${m.nome} impostando lo stato su "Non attivo"?`
      : `Riattivare il membro ${m.cognome} ${m.nome} impostando lo stato su "Attivo"?`;
    if (!confirm(msg)) return;

    try {
      await api(`/api/members/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...m, stato: newStatus })
      });
      toast(`Stato di ${m.cognome} ${m.nome} aggiornato a "${newStatus}"!`);
      dlg.close();
      await loadAllData();
      const fresh = (state.members || []).find(x => x.id === m.id);
      if (fresh) openMemberProfile(fresh);
    } catch (err) {
      toast(`Errore: ${err.message}`, 'err');
    }
  });

  // Gestione pannello allegati
  const addPanel = $('add-attachment-panel');
  $('btn-show-add-attachment')?.addEventListener('click', () => {
    if (addPanel) {
      addPanel.style.display = (addPanel.style.display === 'none' || !addPanel.style.display) ? 'block' : 'none';
    }
  });

  $('btn-cancel-add-attachment')?.addEventListener('click', () => {
    if (addPanel) addPanel.style.display = 'none';
  });

  $('btn-submit-attachment')?.addEventListener('click', async () => {
    const fileInput = $('input-file-doc');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      toast('Seleziona prima un file da allegare', 'err');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      toast('Il file supera la dimensione massima di 30MB', 'err');
      return;
    }

    if (!state.cloudStatus || !state.cloudStatus.connected) {
      toast('Google Drive non è collegato. Per salvare sul Cloud, vai in Impostazioni e accedi a Google Drive.', 'err');
      return;
    }

    const categoria = $('att-categoria').value;
    const titolo = ($('att-titolo').value || '').trim() || file.name;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast('Caricamento documento in corso...');
        const payload = {
          fileName: file.name,
          titolo,
          categoria,
          mimeType: file.type || 'application/octet-stream',
          dataBase64: reader.result
        };
        const resAtt = await api(`/api/members/${m.id}/attachments`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        toast(`Documento "${titolo}" allegato con successo!`);
        m.allegati ||= [];
        m.allegati.push(resAtt);
        const idx = state.members.findIndex(x => x.id === m.id);
        if (idx !== -1) state.members[idx] = m;
        dlg.close();
        openMemberProfile(m);
      } catch (err) {
        toast(`Errore caricamento: ${err.message}`, 'err');
      }
    };
    reader.onerror = () => toast('Errore nella lettura del file', 'err');
    reader.readAsDataURL(file);
  });

  // Handler eliminazione allegati
  dlg.querySelectorAll('button[data-delete-att]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const attId = btn.getAttribute('data-delete-att');
      if (!confirm('Eliminare definitivamente questo documento allegato?')) return;
      try {
        await api(`/api/members/${m.id}/attachments/${attId}`, { method: 'DELETE' });
        toast('Documento eliminato');
        m.allegati = (m.allegati || []).filter(x => x.id !== attId);
        const idx = state.members.findIndex(x => x.id === m.id);
        if (idx !== -1) state.members[idx] = m;
        dlg.close();
        openMemberProfile(m);
      } catch (err) {
        toast(`Errore eliminazione: ${err.message}`, 'err');
      }
    });
  });

  if (!dlg.open) {
    dlg.showModal();
  }
}

// ---------------------------------------------------------------- MODALI: AGGIUNGI / MODIFICA MEMBRO
function openMemberModal(m = null, defaultTipo = null) {
  const isEdit = !!m;
  const dlg = $('dlg');

  const defRuolo = m?.ruolo || (defaultTipo === 'aderenti' ? 'Aderente' : 'Effettivo');
  const defIsVedovo = m ? (m.isVedovo !== undefined ? !!m.isVedovo : (m.statoCivile || '').toLowerCase().includes('vedov')) : (defaultTipo === 'vedove');
  const defIsSostenuto = m ? !!m.isSostenuto : (defaultTipo === 'sostenuti');
  const defStato = m ? (m.stato || 'Attivo') : (defaultTipo === 'non-attivi' ? 'Non attivo' : 'Attivo');

  let rawStato = (m?.statoCivile || '').trim().toLowerCase();
  let defStatoCivile = 'Coniugato/a';
  if (defIsVedovo || rawStato.includes('vedov')) {
    defStatoCivile = 'Vedovo/a';
  } else if (rawStato.includes('celib') || rawStato.includes('nubil')) {
    defStatoCivile = 'Celibe/Nubile';
  } else if (rawStato.includes('separat')) {
    defStatoCivile = 'Separato/a';
  } else if (rawStato.includes('divorz')) {
    defStatoCivile = 'Divorziato/a';
  } else if (rawStato.includes('coniug')) {
    defStatoCivile = 'Coniugato/a';
  } else if (m?.statoCivile) {
    defStatoCivile = m.statoCivile;
  }

  const defDataAdesione = m?.dataAdesione || '';
  const defDettaglioSostegno = m?.dettaglioSostegno || '';

  const maxProt = (state.members || []).reduce((max, x) => Math.max(max, Number(x.protocollo ?? x.id) || 0), 0);
  const currentProt = isEdit ? (m.protocollo ?? m.id) : (maxProt + 1);

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>${isEdit ? `Modifica Membro (Prot. #${currentProt})` : `Nuovo Membro di Chiesa (Prot. Proposto: #${currentProt})`}</h3>
      <button class="close-btn" id="btn-close-dlg" title="Chiudi finestra">✕ Chiudi</button>
    </div>
    <form id="form-member">
      <div class="dialog-body">
        <div style="background:#f0f9ff; border:1.5px solid #0284c7; border-radius:8px; padding:12px 14px; margin-bottom:16px;">
          <label for="m-protocollo" style="font-weight:700; color:#0369a1; font-size:13px; display:block; margin-bottom:6px;">
            📋 PROTOCOLLO *
          </label>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-weight:700; font-size:16px; color:#0369a1;">#</span>
            <input type="number" id="m-protocollo" min="1" step="1" value="${currentProt}" required 
              style="width:130px; font-size:16px; font-weight:700; color:#0f172a; border:2px solid #0284c7; border-radius:6px; padding:6px 10px; background:#fff;">
          </div>
          <div id="m-protocollo-error" style="color:#dc2626; font-size:12px; font-weight:700; margin-top:6px; display:none;"></div>
        </div>

        <h4 style="margin:0 0 12px; font-size:14px; text-transform:uppercase; color:#0284c7;">1. Anagrafica Personale</h4>
        <div class="form-grid">
          <div class="form-group">
            <label>Cognome *</label>
            <input type="text" id="m-cognome" value="${escapeHtml(m?.cognome || '')}" required>
          </div>
          <div class="form-group">
            <label>Nome *</label>
            <input type="text" id="m-nome" value="${escapeHtml(m?.nome || '')}" required>
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Data di Nascita</label>
            <input type="date" id="m-dataNascita" value="${escapeHtml(m?.dataNascita || '')}">
          </div>
          <div class="form-group">
            <label>Luogo di Nascita</label>
            <input type="text" id="m-luogoNascita" value="${escapeHtml(m?.luogoNascita || '')}">
          </div>
          <div class="form-group">
            <label>Provincia Nascita (es. NO, NA)</label>
            <input type="text" id="m-provinciaNascita" maxlength="4" value="${escapeHtml(m?.provinciaNascita || '')}">
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Codice Fiscale</label>
            <input type="text" id="m-codiceFiscale" maxlength="20" value="${escapeHtml(m?.codiceFiscale || '')}">
          </div>
          <div class="form-group">
            <label>Titolo di Studio</label>
            <input type="text" id="m-titoloStudio" value="${escapeHtml(m?.titoloStudio || '')}">
          </div>
          <div class="form-group">
            <label>Professione</label>
            <input type="text" id="m-professione" value="${escapeHtml(m?.professione || '')}">
          </div>
        </div>

        <h4 style="margin:16px 0 12px; font-size:14px; text-transform:uppercase; color:#0284c7;">2. Residenza e Recapiti</h4>
        <div class="form-grid">
          <div class="form-group" style="grid-column: 1 / -1;">
            <label>Indirizzo di Residenza</label>
            <input type="text" id="m-indirizzo" value="${escapeHtml(m?.indirizzo || '')}">
          </div>
          <div class="form-group">
            <label>Comune</label>
            <input type="text" id="m-comune" value="${escapeHtml(m?.comune || '')}">
          </div>
          <div class="form-group">
            <label>Provincia Residenza</label>
            <input type="text" id="m-provincia" maxlength="4" value="${escapeHtml(m?.provincia || '')}">
          </div>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label>Telefono / Cellulare</label>
            <input type="text" id="m-telefono" value="${escapeHtml(m?.telefono || '')}">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="m-email" value="${escapeHtml(m?.email || '')}">
          </div>
        </div>

        <h4 style="margin:16px 0 12px; font-size:14px; text-transform:uppercase; color:#0284c7;">3. Membro, Stato Civile &amp; Registri</h4>
        <div class="form-grid">
          <div class="form-group">
            <label>Membro nel Registro *</label>
            <select id="m-ruolo" required>
              <option value="Effettivo" ${defRuolo === 'Effettivo' ? 'selected' : ''}>Membro Effettivo (Battezzato)</option>
              <option value="Aderente" ${defRuolo === 'Aderente' ? 'selected' : ''}>Membro Aderente / Simpatizzante</option>
            </select>
          </div>
          <div class="form-group">
            <label>Stato Civile *</label>
            <select id="m-statoCivile" required>
              <option value="Coniugato/a" ${defStatoCivile === 'Coniugato/a' ? 'selected' : ''}>Coniugato/a</option>
              <option value="Celibe/Nubile" ${defStatoCivile === 'Celibe/Nubile' ? 'selected' : ''}>Celibe/Nubile</option>
              <option value="Vedovo/a" ${defStatoCivile === 'Vedovo/a' ? 'selected' : ''}>Vedovo/a</option>
              <option value="Separato/a" ${defStatoCivile === 'Separato/a' ? 'selected' : ''}>Separato/a</option>
              <option value="Divorziato/a" ${defStatoCivile === 'Divorziato/a' ? 'selected' : ''}>Divorziato/a</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data Adesione Comunità</label>
            <input type="date" id="m-dataAdesione" value="${escapeHtml(defDataAdesione)}">
          </div>
          <div class="form-group">
            <label>Stato del Membro *</label>
            <select id="m-stato" required>
              <option value="Attivo" ${defStato === 'Attivo' ? 'selected' : ''}>🟢 Attivo</option>
              <option value="Non attivo" ${defStato !== 'Attivo' ? 'selected' : ''}>🔴 Non attivo</option>
            </select>
          </div>
        </div>

        <div class="form-grid" style="margin-top:8px;">
          <label class="checkbox-row">
            <input type="checkbox" id="m-isVedovo" ${defIsVedovo ? 'checked' : ''}>
            <span>🟣 Inserisci nel <strong>Registro Vedove / Vedovi</strong></span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="m-isSostenuto" ${defIsSostenuto ? 'checked' : ''}>
            <span>🟠 Inserisci nel <strong>Registro Sostenuti</strong></span>
          </label>
        </div>

        <div class="form-group" style="margin-top:10px;">
          <label>Dettaglio Sostegno Pastorale / Assistenza Caritativa</label>
          <input type="text" id="m-dettaglioSostegno" placeholder="es. Visite domiciliari periodiche, sussidio caritativo..." value="${escapeHtml(defDettaglioSostegno)}">
        </div>

        <div class="form-grid" style="margin-top:16px;">
          <div>
            <div class="form-group" style="margin-bottom:8px;">
              <label>Battesimo in Acqua *</label>
              <select id="m-battesimoAcqua">
                <option value="true" ${m ? (m.battesimoAcqua ? 'selected' : '') : (defRuolo === 'Effettivo' ? 'selected' : '')}>SI</option>
                <option value="false" ${m ? (!m.battesimoAcqua ? 'selected' : '') : (defRuolo !== 'Effettivo' ? 'selected' : '')}>NO</option>
              </select>
            </div>
            <div class="form-group">
              <label>Data / Anno Battesimo in Acqua</label>
              <input type="text" id="m-dataBA" placeholder="es. 1980 oppure 2024-07-06" value="${escapeHtml(m?.dataBA || '')}">
            </div>
          </div>

          <div>
            <div class="form-group" style="margin-bottom:8px;">
              <label>Battesimo Spirito Santo *</label>
              <select id="m-battesimoSpiritoSanto">
                <option value="true" ${m?.battesimoSpiritoSanto ? 'selected' : ''}>SI</option>
                <option value="false" ${!m?.battesimoSpiritoSanto ? 'selected' : ''}>NO</option>
              </select>
            </div>
            <div class="form-group">
              <label>Data / Anno Spirito Santo</label>
              <input type="text" id="m-dataSS" placeholder="es. 1980 oppure 2022-07-27" value="${escapeHtml(m?.dataSS || '')}">
            </div>
          </div>
        </div>

        <h4 style="margin:16px 0 12px; font-size:14px; text-transform:uppercase; color:#0284c7;">4. Consensi Privacy &amp; Note</h4>
        <div class="form-grid">
          <label class="checkbox-row">
            <input type="checkbox" id="m-consensoWhatsApp" ${m?.consensoWhatsApp === 'Acconsentito' || m?.consensoWhatsApp === true || !isEdit ? 'checked' : ''}>
            <span>Consenso comunicazioni WhatsApp</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" id="m-consensoFotoVideo" ${m?.consensoFotoVideo === 'Acconsentito' || m?.consensoFotoVideo === true || !isEdit ? 'checked' : ''}>
            <span>Consenso riprese Foto e Video</span>
          </label>
        </div>

        <div class="form-group" style="margin-top:12px;">
          <label>Note aggiuntive</label>
          <textarea id="m-note" rows="2">${escapeHtml(m?.note || '')}</textarea>
        </div>

        <h4 style="margin:18px 0 10px; font-size:14px; text-transform:uppercase; color:#0284c7; display:flex; align-items:center; justify-content:space-between;">
          <span>📎 5. Documenti &amp; Certificati Allegati</span>
          <span class="muted" style="font-size:11px; font-weight:normal; text-transform:none;">PDF, scansioni, foto (max 30MB)</span>
        </h4>

        <div style="background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:12px; margin-bottom:8px;">
          <!-- Lista documenti già esistenti o aggiunti -->
          <div id="modal-att-list" style="margin-bottom:10px;">
            ${(m && m.allegati && m.allegati.length > 0) ? `
              <div style="font-size:12px; font-weight:700; color:#334155; margin-bottom:6px;">Documenti già archiviati (${m.allegati.length}):</div>
              <div style="display:flex; flex-direction:column; gap:6px;">
                ${m.allegati.map(att => `
                  <div style="display:flex; align-items:center; justify-content:space-between; background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; font-size:12px;">
                    <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                      <span>📄</span>
                      <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <strong style="color:#0f172a;">${escapeHtml(att.titolo || att.fileName)}</strong>
                        <span class="muted small" style="margin-left:6px;">
                          [${escapeHtml(att.categoria || 'Generale')}] · ${att.sizeFormatted || ''}
                          ${att.driveFileId ? `<span class="badge blue" style="font-size:10px; padding:1px 5px; margin-left:4px;">☁️ Drive</span>` : ''}
                        </span>
                      </div>
                    </div>
                    <div style="display:flex; gap:6px; flex-shrink:0;">
                      <a href="/api/members/${m.id}/attachments/${att.id}" target="_blank" class="btn small" style="padding:2px 7px; font-size:11px;" title="Apri documento">👁️</a>
                      ${att.driveViewLink ? `<a href="${att.driveViewLink}" target="_blank" class="btn small" style="padding:2px 7px; font-size:11px; background:#f0fdf4; color:#15803d; border-color:#bbf7d0;" title="Apri su Drive">☁️</a>` : ''}
                      <button type="button" class="btn small danger" data-del-existing-att="${att.id}" style="padding:2px 7px; font-size:11px;" title="Elimina allegato">🗑️</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div id="modal-no-att-msg" class="muted small" style="font-style:italic;">
                ${isEdit ? 'Nessun documento attualmente allegato a questa scheda.' : 'Nessun file ancora allegato. Puoi selezionarne uno qui sotto prima di salvare!'}
              </div>
            `}
          </div>

          <!-- Lista allegati in coda per NUOVO membro -->
          <div id="modal-staged-list" style="display:none; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; color:#0369a1; margin-bottom:6px;">Nuovi file pronti da salvare:</div>
            <div id="modal-staged-items" style="display:flex; flex-direction:column; gap:6px;"></div>
          </div>

          <!-- Form di aggiunta nuovo allegato -->
          <div style="background:#fff; border:1px dashed #cbd5e1; border-radius:6px; padding:10px;">
            <div style="font-weight:700; font-size:12px; color:#0f172a; margin-bottom:8px;">➕ Allega un documento alla scheda:</div>
            <div style="display:grid; grid-template-columns: 1fr 140px; gap:8px; margin-bottom:8px;">
              <input type="text" id="modal-new-att-title" placeholder="Titolo documento (es. Certificato Battesimo, Carta Identità)" style="font-size:12px; padding:6px 8px;">
              <select id="modal-new-att-cat" style="font-size:12px; padding:6px 8px;">
                ${renderDocCategoryOptions()}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="file" id="modal-new-att-file" style="font-size:12px; flex:1;">
              <button type="button" class="btn small primary" id="modal-btn-stage-att" style="white-space:nowrap; padding:6px 12px; font-size:12px;">
                ${isEdit ? 'Carica subito' : 'Aggiungi alla lista'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" id="btn-cancel-dlg">Annulla</button>
        <button type="submit" class="btn primary">${isEdit ? 'Salva Modifiche' : 'Aggiungi Membro'}</button>
      </div>
    </form>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-cancel-dlg').addEventListener('click', () => dlg.close());

  // Array per memorizzare allegati preparati per NUOVO membro (o prima del salvataggio)
  const stagedAttachments = [];

  const updateStagedUI = () => {
    const box = $('modal-staged-list');
    const items = $('modal-staged-items');
    if (!box || !items) return;
    if (stagedAttachments.length === 0) {
      box.style.display = 'none';
      items.innerHTML = '';
      return;
    }
    box.style.display = 'block';
    items.innerHTML = stagedAttachments.map((att, i) => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:#e0f2fe; border:1px solid #bae6fd; border-radius:6px; padding:5px 8px; font-size:12px;">
        <div style="display:flex; align-items:center; gap:6px; min-width:0;">
          <span>📎</span>
          <div style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <strong>${escapeHtml(att.titolo)}</strong>
            <span class="muted small" style="margin-left:6px;">[${escapeHtml(att.categoria)}] · ${escapeHtml(att.fileName)}</span>
          </div>
        </div>
        <button type="button" class="btn small danger" data-remove-staged="${i}" style="padding:1px 6px; font-size:11px;">✕</button>
      </div>
    `).join('');

    items.querySelectorAll('button[data-remove-staged]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-remove-staged'));
        stagedAttachments.splice(idx, 1);
        updateStagedUI();
      });
    });
  };

  // Handler caricamento documento nel modal
  $('modal-btn-stage-att')?.addEventListener('click', async () => {
    const fileInput = $('modal-new-att-file');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) {
      toast('Seleziona prima un file da allegare', 'err');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toast('Il file supera la dimensione massima di 30MB', 'err');
      return;
    }

    if (!state.cloudStatus || !state.cloudStatus.connected) {
      toast('Google Drive non è collegato. Per salvare i documenti sul Cloud, vai in Impostazioni e accedi con Google Drive.', 'err');
      return;
    }

    const titolo = ($('modal-new-att-title')?.value || '').trim() || file.name;
    const categoria = $('modal-new-att-cat')?.value || (getDocCategories()[0] || 'Altro Documento');

    const reader = new FileReader();
    reader.onload = async () => {
      const attData = {
        fileName: file.name,
        titolo,
        categoria,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: reader.result
      };

      if (isEdit) {
        // Se siamo in modifica di un membro esistente, inviamo subito al server
        try {
          toast('Caricamento allegato in corso...');
          const resAtt = await api(`/api/members/${m.id}/attachments`, {
            method: 'POST',
            body: JSON.stringify(attData)
          });
          toast(`Documento "${titolo}" salvato!`);
          m.allegati ||= [];
          m.allegati.push(resAtt);
          const idx = state.members.findIndex(x => x.id === m.id);
          if (idx !== -1) state.members[idx] = m;
          // Riapri il modal aggiornato per riflettere la lista completa
          openMemberModal(m);
        } catch (err) {
          toast(`Errore caricamento: ${err.message}`, 'err');
        }
      } else {
        // Se siamo nella scheda NUOVO MEMBRO, mettiamo in coda per salvarlo insieme al membro
        stagedAttachments.push(attData);
        updateStagedUI();
        toast(`Documento "${titolo}" aggiunto alla scheda!`);
        // Reset campi input allegato
        fileInput.value = '';
        if ($('modal-new-att-title')) $('modal-new-att-title').value = '';
      }
    };
    reader.onerror = () => toast('Errore lettura file', 'err');
    reader.readAsDataURL(file);
  });

  // Handler eliminazione allegati esistenti (in modalità Modifica)
  dlg.querySelectorAll('button[data-del-existing-att]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const attId = btn.getAttribute('data-del-existing-att');
      if (!confirm('Eliminare definitivamente questo documento allegato?')) return;
      try {
        await api(`/api/members/${m.id}/attachments/${attId}`, { method: 'DELETE' });
        toast('Documento eliminato');
        m.allegati = (m.allegati || []).filter(x => x.id !== attId);
        const idx = state.members.findIndex(x => x.id === m.id);
        if (idx !== -1) state.members[idx] = m;
        openMemberModal(m);
      } catch (err) {
        toast(`Errore eliminazione: ${err.message}`, 'err');
      }
    });
  });

  // Sincronizzazione automatica tra selezione 'Vedovo/a' e checkbox Registro Vedove
  const statoSelect = $('m-statoCivile');
  const vedovoCb = $('m-isVedovo');
  if (statoSelect && vedovoCb) {
    statoSelect.addEventListener('change', () => {
      if (statoSelect.value === 'Vedovo/a') {
        vedovoCb.checked = true;
      }
    });
    vedovoCb.addEventListener('change', () => {
      if (vedovoCb.checked && statoSelect.value !== 'Vedovo/a') {
        statoSelect.value = 'Vedovo/a';
      }
    });
  }

  // Sincronizzazione automatica tra Battesimo in Acqua (SI/NO) e Membro (Effettivo/Aderente)
  const baSelect = $('m-battesimoAcqua');
  const ruoloSelect = $('m-ruolo');
  if (baSelect && ruoloSelect) {
    baSelect.addEventListener('change', () => {
      if (baSelect.value === 'true' && ruoloSelect.value === 'Aderente') {
        ruoloSelect.value = 'Effettivo';
      } else if (baSelect.value === 'false' && ruoloSelect.value === 'Effettivo') {
        ruoloSelect.value = 'Aderente';
      }
    });
  }

  // Controllo dinamico e univocità Numero di Protocollo
  const protInput = $('m-protocollo');
  const protErr = $('m-protocollo-error');
  function validateProtocolloLive() {
    if (!protInput || !protErr) return true;
    const val = Number(protInput.value);
    if (!val || isNaN(val) || val <= 0) {
      protErr.textContent = 'Inserire un numero di protocollo valido maggiore di zero.';
      protErr.style.display = 'block';
      protInput.style.borderColor = '#dc2626';
      return false;
    }
    const dup = (state.members || []).find(x => (!isEdit || x.id !== m.id) && Number(x.protocollo ?? x.id) === val);
    if (dup) {
      protErr.textContent = `⚠️ Attenzione: Il protocollo #${val} è già assegnato a "${dup.cognome} ${dup.nome}" (ID #${dup.id})!`;
      protErr.style.display = 'block';
      protInput.style.borderColor = '#dc2626';
      return false;
    }
    protErr.textContent = '';
    protErr.style.display = 'none';
    protInput.style.borderColor = '#0284c7';
    return true;
  }
  protInput?.addEventListener('input', validateProtocolloLive);
  protInput?.addEventListener('change', validateProtocolloLive);

  $('form-member').addEventListener('submit', async e => {
    e.preventDefault();

    const protVal = Number($('m-protocollo').value);
    if (!protVal || isNaN(protVal) || protVal <= 0) {
      toast('Inserire un numero di protocollo valido maggiore di zero', 'err');
      $('m-protocollo').focus();
      return;
    }
    const dup = (state.members || []).find(x => (!isEdit || x.id !== m.id) && Number(x.protocollo ?? x.id) === protVal);
    if (dup) {
      toast(`Il protocollo #${protVal} è già utilizzato per il membro ${dup.cognome} ${dup.nome}! Scegli un numero non duplicato.`, 'err');
      $('m-protocollo').focus();
      return;
    }

    const payload = {
      protocollo: protVal,
      cognome: $('m-cognome').value.trim(),
      nome: $('m-nome').value.trim(),
      dataNascita: $('m-dataNascita').value.trim(),
      luogoNascita: $('m-luogoNascita').value.trim(),
      provinciaNascita: $('m-provinciaNascita').value.trim().toUpperCase(),
      codiceFiscale: $('m-codiceFiscale').value.trim().toUpperCase(),
      indirizzo: $('m-indirizzo').value.trim(),
      comune: $('m-comune').value.trim(),
      provincia: $('m-provincia').value.trim().toUpperCase(),
      telefono: $('m-telefono').value.trim(),
      email: $('m-email').value.trim(),
      titoloStudio: $('m-titoloStudio').value.trim(),
      professione: $('m-professione').value.trim(),
      ruolo: $('m-ruolo').value,
      statoCivile: $('m-statoCivile').value,
      stato: $('m-stato').value,
      dataAdesione: $('m-dataAdesione').value.trim(),
      isVedovo: $('m-isVedovo').checked,
      isSostenuto: $('m-isSostenuto').checked,
      dettaglioSostegno: $('m-dettaglioSostegno').value.trim(),
      battesimoAcqua: $('m-battesimoAcqua').value === 'true',
      dataBA: $('m-dataBA').value.trim(),
      battesimoSpiritoSanto: $('m-battesimoSpiritoSanto').value === 'true',
      dataSS: $('m-dataSS').value.trim(),
      consensoWhatsApp: $('m-consensoWhatsApp').checked ? 'Acconsentito' : 'Non specificato',
      consensoFotoVideo: $('m-consensoFotoVideo').checked ? 'Acconsentito' : 'Non specificato',
      note: $('m-note').value.trim()
    };

    if (!isEdit && stagedAttachments.length > 0) {
      payload.initialAttachments = stagedAttachments;
    }

    try {
      if (isEdit) {
        await api(`/api/members/${m.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast(`Membro ${payload.cognome} ${payload.nome} (Prot. #${payload.protocollo}) aggiornato!`);
      } else {
        await api('/api/members', { method: 'POST', body: JSON.stringify(payload) });
        toast(`Nuovo membro ${payload.cognome} ${payload.nome} (Prot. #${payload.protocollo}) aggiunto${stagedAttachments.length ? ` con ${stagedAttachments.length} allegati` : ''}!`);
      }
      dlg.close();
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  if (!dlg.open) {
    dlg.showModal();
  }
}

// ---------------------------------------------------------------- ELIMINA MEMBRO
async function confirmDeleteMember(m) {
  if (!confirm(`Sei sicuro di voler eliminare dal registro il membro ${m.cognome} ${m.nome} (Prot. #${m.protocollo ?? m.id})?`)) {
    return;
  }
  try {
    await api(`/api/members/${m.id}`, { method: 'DELETE' });
    toast(`Membro ${m.cognome} ${m.nome} eliminato dal registro`);
    await loadAllData();
  } catch (err) {
    toast(err.message, 'err');
  }
}

// ---------------------------------------------------------------- MODALE CONFIGURAZIONE CLOUD
function openCloudConfigModal() {
  const dlg = $('dlg');
  const cs = state.cloudStatus || {};

  dlg.innerHTML = `
    <div class="dialog-header">
      <h3>Configurazione Google Drive</h3>
      <button class="close-btn" id="btn-close-dlg">✕</button>
    </div>
    <form id="form-cloud-cfg">
      <div class="dialog-body">
        <p class="muted small" style="margin-top:0;">
          Inserisci il Client ID e il Client Secret del tuo progetto Google Cloud Console per abilitare la sincronizzazione automatica bidirezionale.
          <br><strong>I dati inseriti saranno memorizzati e inclusi nell'installer Windows per gli altri PC.</strong>
        </p>

        <div class="form-group" style="margin-bottom:12px;">
          <label>OAuth 2.0 Client ID</label>
          <input type="text" id="cfg-client-id" value="${escapeHtml(cs.clientId || '')}" placeholder="es. 12345...apps.googleusercontent.com">
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label>OAuth 2.0 Client Secret</label>
          <input type="password" id="cfg-client-secret" value="${escapeHtml(cs.clientSecret || '')}">
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label>Nome cartella su Google Drive</label>
          <input type="text" id="cfg-folder-name" value="${escapeHtml(cs.folderName || 'Registro Chiesa')}">
        </div>

        <label class="checkbox-row">
          <input type="checkbox" id="cfg-auto-sync" ${cs.autoSync !== false ? 'checked' : ''}>
          <span>Sincronizzazione automatica a ogni modifica</span>
        </label>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn" id="btn-cancel-dlg">Annulla</button>
        <button type="submit" class="btn primary">Salva e Connetti</button>
      </div>
    </form>
  `;

  $('btn-close-dlg').addEventListener('click', () => dlg.close());
  $('btn-cancel-dlg').addEventListener('click', () => dlg.close());

  $('form-cloud-cfg').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      clientId: $('cfg-client-id').value.trim(),
      clientSecret: $('cfg-client-secret').value.trim(),
      folderName: $('cfg-folder-name').value.trim(),
      autoSync: $('cfg-auto-sync').checked
    };

    try {
      await api('/api/cloud/config', { method: 'POST', body: JSON.stringify(payload) });
      toast('Configurazione salvata');
      dlg.close();

      // Ottieni URL per autorizzazione
      if (payload.clientId && payload.clientSecret) {
        const auth = await api('/api/cloud/auth-url');
        window.open(auth.url, '_blank', 'width=600,height=700');
      }
      await loadAllData();
    } catch (err) {
      toast(err.message, 'err');
    }
  });

  dlg.showModal();
}

// ---------------------------------------------------------------- VISTA: WIKI & GUIDA UTENTE
function renderWiki(container) {
  container.innerHTML = `
    <div class="toolbar" style="margin-bottom:14px;">
      <div>
        <h2 style="font-size:18px; margin:0; display:flex; align-items:center; gap:8px;">
          📖 Manuale d'Uso &amp; Wiki di GestionaleTralci
          <span class="badge effettivo" style="font-size:12px;">v2.1</span>
        </h2>
        <div class="muted small">Guida operativa completa, registri canonici, fascicoli membri, famiglie e cloud sync</div>
      </div>
      <div class="spacer"></div>
      <button class="btn" onclick="window.print()">🖨️ Stampa Guida</button>
      <a href="WIKI.md" download="WIKI.md" class="btn primary">📥 Scarica WIKI.md</a>
    </div>

    <!-- Barra Ricerca Rapida Wiki & Indice Tematico -->
    <div class="card pad" style="margin-bottom:16px; padding:12px 16px; background:#f8fafc; border:1px solid #cbd5e1;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:10px;">
        <div style="font-weight:700; color:#0f172a; font-size:13px; display:flex; align-items:center; gap:6px;">
          <span>🔍</span> Cerca nella Documentazione:
        </div>
        <div class="search-bar" style="max-width:340px; margin:0;">
          <span class="search-icon">🔍</span>
          <input type="text" id="wiki-search-input" placeholder="Cerca argomento (es. battesimi, drive, protocollo)...">
        </div>
      </div>

      <!-- Quick Nav Pills -->
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <a href="#wiki-sec-avvio" class="btn small" style="background:#fff;">🚀 1. Installazione PWA</a>
        <a href="#wiki-sec-registri" class="btn small" style="background:#fff;">🏛️ 2. I 4 Registri Canonici</a>
        <a href="#wiki-sec-fascicolo" class="btn small" style="background:#fff;">📎 3. Fascicolo &amp; Allegati</a>
        <a href="#wiki-sec-famiglie" class="btn small" style="background:#fff;">👨‍👩‍👧‍👦 4. Nuclei Familiari</a>
        <a href="#wiki-sec-cloud" class="btn small" style="background:#fff;">☁️ 5. Google Drive Sync</a>
        <a href="#wiki-sec-backup" class="btn small" style="background:#fff;">💾 6. Backup &amp; Sicurezza</a>
        <a href="#wiki-sec-stampe" class="btn small" style="background:#fff;">🖨️ 7. Stampe Ufficiali A4</a>
        <a href="#wiki-sec-faq" class="btn small" style="background:#fff;">❓ 8. Domande Frequenti (FAQ)</a>
      </div>
    </div>

    <div id="wiki-sections-wrapper" style="display:flex; flex-direction:column; gap:16px;">

      <!-- SEZIONE 1: AVVIO E INSTALLAZIONE -->
      <div class="card pad wiki-item" id="wiki-sec-avvio" style="border-left:4px solid #0284c7;">
        <h3 style="margin-top:0; color:#0284c7; display:flex; align-items:center; gap:8px;">
          <span>🚀</span> 1. Installazione PWA &amp; Avvio Offline
        </h3>
        <p><strong>GestionaleTralci</strong> è una Progressive Web App (PWA) moderna: funziona al 100% offline, archivia i dati in modo sicuro nel browser ed è installabile come app desktop/mobile nativa su qualsiasi dispositivo.</p>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0;">
          <div style="background:#f1f5f9; padding:10px 12px; border-radius:6px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">Metodo 1: Installazione PWA con un clic (Consigliato)</div>
            <div style="font-size:12.5px; line-height:1.4;">
              Apri l'app su Chrome/Edge/Safari e tocca <strong>«📲 Installa GestionaleTralci»</strong>.<br>
              L'applicazione viene aggiunta al menu programmi e si apre a schermo intero come una vera app desktop nativa, funzionando anche in assenza di internet.
            </div>
          </div>
          <div style="background:#f1f5f9; padding:10px 12px; border-radius:6px;">
            <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">Metodo 2: Prova Locale su Windows</div>
            <div style="font-size:12.5px; line-height:1.4;">
              Fai doppio clic sul file <code>Prova PWA in locale.bat</code> per avviare il server web di sviluppo locale sulla porta <code>http://localhost:5210</code>.
            </div>
          </div>
        </div>

        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; padding:8px 12px; font-size:12.5px;">
          <strong>💡 Sincronizzazione Cloud Automatica:</strong> Nelle Impostazioni puoi collegare il tuo account Google Drive per il backup e il ripristino automatico istantaneo tra diversi computer e tablet.
        </div>
      </div>

      <!-- SEZIONE 2: I 4 REGISTRI CANONICI -->
      <div class="card pad wiki-item" id="wiki-sec-registri" style="border-left:4px solid #059669;">
        <h3 style="margin-top:0; color:#059669; display:flex; align-items:center; gap:8px;">
          <span>🏛️</span> 2. I 4 Registri Canonici Ecclesiali &amp; Protocollo (#)
        </h3>
        <p>In conformità ai canoni statutari ed ecclesiastici della comunità, l'assemblea è organizzata in registri rigorosamente distinti:</p>

        <div style="display:flex; flex-direction:column; gap:8px; margin:12px 0;">
          <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 12px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
            <span class="badge" style="background:#64748b; color:#fff; min-width:130px; text-align:center;">👥 Registro Generale</span>
            <div style="font-size:12.5px; flex:1;">
              <strong>Archivio Omnicomprensivo:</strong> Elenco completo di tutti i fedeli censiti con ricerca full-text immediata, filtri per comune, stato civile e sacramenti, e stampa A4 Landscape.
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 12px; background:#ecfdf5; border-radius:6px; border:1px solid #a7f3d0;">
            <span class="badge effettivo" style="min-width:130px; text-align:center;">🟢 Membri Effettivi</span>
            <div style="font-size:12.5px; flex:1;">
              <strong>Battezzati in Acqua:</strong> Fedeli comunicanti che hanno ricevuto il battesimo in acqua per immersione. Hanno voce deliberativa nelle assemblee amministrative della chiesa.
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 12px; background:#eff6ff; border-radius:6px; border:1px solid #bfdbfe;">
            <span class="badge aderente" style="min-width:130px; text-align:center;">🔵 Membri Aderenti</span>
            <div style="font-size:12.5px; flex:1;">
              <strong>Simpatizzanti &amp; Catecumeni:</strong> Fedeli che frequentano regolarmente ma non sono ancora stati battezzati per immersione. Consente il monitoraggio pastorale verso il battesimo.
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 12px; background:#faf5ff; border-radius:6px; border:1px solid #e9d5ff;">
            <span class="badge vedova" style="min-width:130px; text-align:center;">🟣 Registro Vedove/i</span>
            <div style="font-size:12.5px; flex:1;">
              <strong>Cura Diaconale (1 Timoteo 5):</strong> Registro speciale dedicato alla visita domiciliare, conforto spirituale e supporto quotidiano alle persone rimaste vedove nella fratellanza.
            </div>
          </div>

          <div style="display:flex; gap:10px; align-items:flex-start; padding:8px 12px; background:#fff7ed; border-radius:6px; border:1px solid #fed7aa;">
            <span class="badge sostenuto" style="min-width:130px; text-align:center;">🟠 Registro Sostenuti</span>
            <div style="font-size:12.5px; flex:1;">
              <strong>Fondo Carità &amp; Sussidi:</strong> Registro riservato per famiglie e membri che ricevono aiuti alimentari, sussidi economici o sostegno fraterno dalla diaconia.
            </div>
          </div>
        </div>

        <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:8px 12px; font-size:12.5px;">
          <strong>📋 Numero di Protocollo Cartaceo (#):</strong> Ogni membro possiede un protocollo progressivo univoco (#1, #2, ecc.). Quando si inserisce un nuovo membro, il sistema calcola in automatico il prossimo numero libero per facilitare l'allineamento con l'archivio cartaceo.
        </div>
      </div>

      <!-- SEZIONE 3: FASCICOLO DIGITALE E ALLEGATI -->
      <div class="card pad wiki-item" id="wiki-sec-fascicolo" style="border-left:4px solid #8b5cf6;">
        <h3 style="margin-top:0; color:#8b5cf6; display:flex; align-items:center; gap:8px;">
          <span>📎</span> 3. Scheda Anagrafica, Fascicolo Digitale &amp; Allegati
        </h3>
        <p>Cliccando su qualsiasi nominativo o sul pulsante <code>👁️ Scheda</code>, si apre il fascicolo individuale del credente.</p>
        
        <ul style="margin:8px 0 12px 18px; font-size:12.5px; line-height:1.5;">
          <li><strong>Dati Personali &amp; Calcolo Età:</strong> CF, luogo e data di nascita con calcolo in tempo reale degli anni compiuti, professione e data di adesione.</li>
          <li><strong>Sacramenti di Fede:</strong> Date e note relative al Battesimo in Acqua e al Battesimo nello Spirito Santo.</li>
          <li><strong>Privacy GDPR:</strong> Tracciamento esplicito dei consensi per comunicazioni WhatsApp e riprese foto/video per eventi pubblici e culti.</li>
          <li><strong>Caricamento Documenti:</strong> Cliccando su <code>+ Allega Documento</code> è possibile caricare certificati di battesimo, attestati di trasferimento, documenti di identità o moduli firmati in formato PDF, JPG, PNG, DOCX.</li>
          <li><strong>Tipologie Documentali Personalizzabili:</strong> Dalle <em>Impostazioni</em> puoi aggiungere o rimuovere categorie di documenti su misura per le esigenze della chiesa.</li>
          <li><strong>Stampa Scheda Singola (A4):</strong> Layout sobrio in Arial 10pt con intestazione, campi canonici e riquadro firme per il Membro e il Pastore.</li>
        </ul>
      </div>

      <!-- SEZIONE 4: NUCLEI FAMILIARI -->
      <div class="card pad wiki-item" id="wiki-sec-famiglie" style="border-left:4px solid #ea580c;">
        <h3 style="margin-top:0; color:#ea580c; display:flex; align-items:center; gap:8px;">
          <span>👨‍👩‍👧‍👦</span> 4. Gestione Nuclei Familiari &amp; Capofamiglia
        </h3>
        <p>La sezione <strong>Famiglie</strong> raggruppa i membri secondo la loro unità domestica, agevolando visite pastorali e recapiti comuni.</p>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0;">
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:12.5px;">
            <strong>★ Designazione del Capofamiglia:</strong><br>
            Ogni nucleo può avere un Capofamiglia contrassegnato dalla stella dorata, sia a video sia sul ruolino stampato. La designazione si imposta con un clic dal selettore a tendina.
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:12.5px;">
            <strong>Membri Non Assegnati:</strong><br>
            In calce alla sezione famiglie è presente il riquadro che elenca i membri privi di gruppo familiare, con pulsante rapido per assegnarli o creare un nuovo nucleo.
          </div>
        </div>
      </div>

      <!-- SEZIONE 5: GOOGLE DRIVE CLOUD SYNC -->
      <div class="card pad wiki-item" id="wiki-sec-cloud" style="border-left:4px solid #2563eb;">
        <h3 style="margin-top:0; color:#2563eb; display:flex; align-items:center; gap:8px;">
          <span>☁️</span> 5. Sincronizzazione Cloud con Google Drive
        </h3>
        <p>Modulo sicuro basato su <strong>Google OAuth 2.0</strong> e <strong>Drive REST API v3</strong> senza librerie terze, che salva i dati nella cartella remota <em>«Registro Chiesa»</em>.</p>

        <div style="background:#f1f5f9; padding:10px 14px; border-radius:6px; margin:10px 0; font-size:12.5px;">
          <strong>Come connettere Google Drive in 3 passaggi:</strong>
          <ol style="margin:6px 0 0 16px; padding:0; line-height:1.45;">
            <li>Scarica il file <code>client_secret_*.json</code> dalla Google Cloud Console (dopo aver abilitato le Google Drive API).</li>
            <li>In <em>⚙️ Impostazioni > Sincronizzazione Cloud</em>, carica il file tramite il pulsante <em>«Scegli file»</em>.</li>
            <li>Clicca su <em>«🔗 Connetti Account Google Drive»</em> e autorizza l'applicazione. Vedrai la spunta verde di stato <strong>Cloud Sincronizzato</strong>.</li>
          </ol>
        </div>

        <div style="font-size:12.5px;">
          <strong>Ripristino da Cloud:</strong> Se cambi computer o si verifica un guasto, ti basta connettere Google Drive e premere <em>«Ripristina da Cloud»</em> per recuperare all'istante l'ultimo database salvato.
        </div>
      </div>

      <!-- SEZIONE 6: BACKUP E SICUREZZA -->
      <div class="card pad wiki-item" id="wiki-sec-backup" style="border-left:4px solid #475569;">
        <h3 style="margin-top:0; color:#475569; display:flex; align-items:center; gap:8px;">
          <span>💾</span> 6. Backup, Sicurezza &amp; Manutenzione dei Dati
        </h3>
        <p>I tuoi dati sono sempre al sicuro e sotto il tuo diretto controllo:</p>

        <ul style="margin:8px 0 12px 18px; font-size:12.5px; line-height:1.5;">
          <li><strong>Backup Automatici Giornalieri:</strong> Archiviati nella cartella <code>data/backup/db_YYYY-MM-DD.json</code> ad ogni modifica.</li>
          <li><strong>Esportazione e Ripristino JSON:</strong> Dal pannello Impostazioni puoi scaricare il file JSON completo su chiavetta USB o ripristinarlo con richiesta di conferma.</li>
          <li><strong>Conservazione Allegati:</strong> Le scansioni dei documenti risiedono in <code>data/attachments/</code>. Copiando questa cartella salvi tutti i fascicoli digitali.</li>
          <li><strong>Registro di Audit:</strong> Traccia ogni operazione (aggiunta, modifica, eliminazione) con data, ora ed esito per la massima trasparenza.</li>
        </ul>
      </div>

      <!-- SEZIONE 7: STAMPE UFFICIALI -->
      <div class="card pad wiki-item" id="wiki-sec-stampe" style="border-left:4px solid #0d9488;">
        <h3 style="margin-top:0; color:#0d9488; display:flex; align-items:center; gap:8px;">
          <span>🖨️</span> 7. Standard delle Stampe Ufficiali (A4 Arial 10pt)
        </h3>
        <p>Tutti i prospetti cartacei adottano il formato sobrio di cancelleria ecclesiastica:</p>

        <table style="width:100%; border-collapse:collapse; font-size:12px; margin:10px 0;">
          <thead>
            <tr style="background:#f1f5f9; text-align:left;">
              <th style="padding:6px 8px; border:1px solid #cbd5e1;">Modulo di Stampa</th>
              <th style="padding:6px 8px; border:1px solid #cbd5e1;">Formato</th>
              <th style="padding:6px 8px; border:1px solid #cbd5e1;">Destinazione Canonica</th>
              <th style="padding:6px 8px; border:1px solid #cbd5e1;">Firme</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600;">Scheda Singola Membro</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">A4 Verticale</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Fascicolo personale fedele</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Membro / Pastore</td>
            </tr>
            <tr>
              <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600;">Registro Generale / Registri 4</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">A4 Orizzontale</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Archivio canonico storico</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Pastore</td>
            </tr>
            <tr>
              <td style="padding:6px 8px; border:1px solid #e2e8f0; font-weight:600;">Ruolino Nuclei Familiari</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">A4 Verticale</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Elenco famiglie e recapiti</td>
              <td style="padding:6px 8px; border:1px solid #e2e8f0;">Pastore</td>
            </tr>
          </tbody>
        </table>

        <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:6px; padding:8px 12px; font-size:12.5px;">
          <strong>Consiglio di Stampa:</strong> Quando stampi dal browser, attiva la casella <em>«Grafica di sfondo»</em> e disattiva <em>«Intestazioni e piè di pagina del browser»</em> per avere una resa tipografica impeccabile.
        </div>
      </div>

      <!-- SEZIONE 8: FAQ -->
      <div class="card pad wiki-item" id="wiki-sec-faq" style="border-left:4px solid #0369a1;">
        <h3 style="margin-top:0; color:#0369a1; display:flex; align-items:center; gap:8px;">
          <span>❓</span> 8. Domande Frequenti (FAQ)
        </h3>

        <div style="display:flex; flex-direction:column; gap:10px; font-size:12.5px;">
          <div>
            <strong>D: Come modifico il nome della chiesa, del pastore o del tesoriere?</strong><br>
            <span class="muted">R: Vai nella scheda <em>⚙️ Impostazioni</em>, modifica i campi nella sezione <em>«Dati della Chiesa»</em> e clicca su <em>«Salva Impostazioni»</em>. Le modifiche si rifletteranno subito su tutte le stampe ufficiali.</span>
          </div>

          <div>
            <strong>D: Come aggiorno il logo che compare nell'intestazione e sulle stampe?</strong><br>
            <span class="muted">R: Sostituisci semplicemente l'immagine <code>public/logo.png</code> con il nuovo logo della chiesa in formato PNG trasparente.</span>
          </div>

          <div>
            <strong>D: Come trasferisco il gestionale su un nuovo computer senza perdere nulla?</strong><br>
            <span class="muted">R: Apri semplicemente l'URL della PWA sul nuovo computer/tablet e accedi a Google Drive nelle Impostazioni (oppure esporta il backup JSON da Impostazioni e importalo sul nuovo dispositivo).</span>
          </div>
        </div>
      </div>

    </div>
  `;

  // Ricerca live all'interno della Wiki
  const searchInput = $('wiki-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      const items = container.querySelectorAll('.wiki-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = (!q || text.includes(q)) ? '' : 'none';
      });
    });
  }
}

// ---------------------------------------------------------------- AVVIO APPLICAZIONE
window.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  loadAllData();
  document.querySelector('.brand-logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    openLogoLightboxModal();
  });
});
