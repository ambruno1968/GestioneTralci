'use strict';
/**
 * Modulo per la generazione di stampe sobrie ufficiali (A4) in Arial 10pt:
 * - Scheda Singola Membro (Membri Effettivi, Membri Aderenti, Registro Vedove, Registro Sostenuti)
 * - Registro Totale Membri (Registro Generale, Membri Effettivi, Membri Aderenti, Registro Vedove, Registro Sostenuti)
 * - Ruolino Nuclei Familiari
 */
const fs = require('fs');
const path = require('path');

function getLogoDataUri() {
  if (typeof window !== 'undefined') return 'logo.png';
  if (!fs) return 'logo.png';
  try {
    const p1 = path.join(__dirname, '..', 'public', 'logo.png');
    if (fs.existsSync(p1)) {
      return 'data:image/png;base64,' + fs.readFileSync(p1).toString('base64');
    }
    const p2 = path.join(__dirname, '..', 'assets', 'logo.png');
    if (fs.existsSync(p2)) {
      return 'data:image/png;base64,' + fs.readFileSync(p2).toString('base64');
    }
  } catch (_) {}
  return '';
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
  if (!d || !/^\d{4}/.test(d)) return '';
  const birthYear = parseInt(d.slice(0, 4), 10);
  const age = new Date().getFullYear() - birthYear;
  return age > 0 ? ` (${age} anni)` : '';
}

/**
 * Scheda Membro Individuale (A4 Portrait - Arial 10pt - Sobria & Compatta)
 */
function memberCardPage(m, s = {}, families = []) {
  const churchName = s.chiesa || 'Come Tralci Novara';
  const churchAddress = [s.indirizzo, s.cap, s.citta, s.provincia].filter(Boolean).join(', ');
  const pastor = s.pastore || 'Bruno Astemio';
  const logoUri = getLogoDataUri();
  const fam = (families || []).find(f => (f.memberIds || []).includes(m.id));

  const isEffettivo = m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua);
  const ruoloLabel = isEffettivo ? 'MEMBRO EFFETTIVO' : 'MEMBRO ADERENTE';

  const isVedovo = !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov');
  const isSostenuto = !!m.isSostenuto;

  const registriSpeciali = [];
  if (isVedovo) registriSpeciali.push('REGISTRO VEDOVE');
  if (isSostenuto) registriSpeciali.push('REGISTRO SOSTENUTI');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Scheda ${ruoloLabel} - ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 12mm 14mm 10mm 14mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.28;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    .header-table td {
      vertical-align: middle;
      padding: 0;
    }
    .logo-img {
      max-height: 44px;
      max-width: 180px;
      object-fit: contain;
      display: block;
    }
    .church-text {
      text-align: right;
    }
    .church-name {
      font-size: 11pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .church-sub {
      font-size: 8.5pt;
      color: #333;
      margin-top: 2px;
    }
    .title-bar {
      border-top: 1.5px solid #111;
      border-bottom: 1.5px solid #111;
      padding: 4px 0;
      margin: 6px 0 10px 0;
      text-align: center;
      background: #f9f9f9;
    }
    .title-bar h1 {
      margin: 0;
      font-size: 11pt;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .title-bar .sub-tags {
      font-size: 8.5pt;
      font-weight: bold;
      color: #222;
      margin-top: 2px;
    }
    .sec-header {
      font-size: 9pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      background: #f1f1f1;
      border-left: 3px solid #333;
      padding: 3px 6px;
      margin: 8px 0 5px 0;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 6px;
    }
    table.data-table td {
      padding: 3px 6px;
      border: 1px solid #ddd;
      font-size: 9.5pt;
      vertical-align: top;
    }
    table.data-table td.lbl {
      width: 22%;
      background: #fafafa;
      font-weight: bold;
      color: #333;
      font-size: 9pt;
    }
    table.data-table td.val {
      width: 28%;
    }
    .note-box {
      border: 1px solid #ccc;
      padding: 6px 8px;
      background: #fdfdfd;
      font-size: 9.5pt;
      min-height: 28px;
      margin-bottom: 6px;
    }
    .signatures {
      width: 100%;
      border-collapse: collapse;
      margin-top: 16px;
    }
    .signatures td {
      width: 50%;
      padding: 0 16px;
      text-align: center;
      font-size: 9pt;
      vertical-align: bottom;
    }
    .sig-line {
      border-top: 1px solid #222;
      margin-top: 36px;
      padding-top: 3px;
    }
    .footer-doc {
      margin-top: 12px;
      font-size: 8pt;
      color: #666;
      text-align: center;
      border-top: 1px dotted #ccc;
      padding-top: 4px;
    }
    .print-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      background: #1e293b;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 10pt;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Stampa Scheda (A4)</button>

  <table class="header-table">
    <tr>
      <td style="width: 45%;">
        ${logoUri ? `<img src="${logoUri}" alt="Come Tralci Novara" class="logo-img">` : `<span style="font-size:12pt;font-weight:bold;">${escapeHtml(churchName)}</span>`}
      </td>
      <td class="church-text">
        <div class="church-name">${escapeHtml(churchName)}</div>
        <div class="church-sub">${escapeHtml(churchAddress || 'Novara')}</div>
        <div class="church-sub">Pastore Responsabile: <strong>${escapeHtml(pastor)}</strong></div>
      </td>
    </tr>
  </table>

  <div class="title-bar">
    <h1>SCHEDA ANAGRAFICA · ${ruoloLabel}</h1>
    <div class="sub-tags">
      Protocollo: <strong>N. ${m.protocollo ?? m.id}</strong> · Stato: ${escapeHtml(m.stato || 'Attivo')}
      ${registriSpeciali.length ? ` · [ ${registriSpeciali.join(' · ')} ]` : ''}
    </div>
  </div>

  <div class="sec-header">1. Dati Anagrafici e Personali</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Cognome:</td>
      <td class="val"><strong>${escapeHtml(m.cognome)}</strong></td>
      <td class="lbl">Nome:</td>
      <td class="val"><strong>${escapeHtml(m.nome)}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Data di Nascita:</td>
      <td class="val">${formatDate(m.dataNascita)}${calcAge(m.dataNascita)}</td>
      <td class="lbl">Luogo di Nascita:</td>
      <td class="val">${escapeHtml(m.luogoNascita || '—')} ${m.provinciaNascita ? `(${escapeHtml(m.provinciaNascita)})` : ''}</td>
    </tr>
    <tr>
      <td class="lbl">Codice Fiscale:</td>
      <td class="val" style="font-family:monospace; font-weight:bold;">${escapeHtml(m.codiceFiscale || '—')}</td>
      <td class="lbl">Stato Civile:</td>
      <td class="val"><strong>${escapeHtml(m.statoCivile || (isVedovo ? 'Vedovo/a' : 'Coniugato/a'))}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Titolo di Studio:</td>
      <td class="val">${escapeHtml(m.titoloStudio || '—')}</td>
      <td class="lbl">Professione:</td>
      <td class="val">${escapeHtml(m.professione || '—')}</td>
    </tr>
  </table>

  <div class="sec-header">2. Residenza e Recapiti</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Indirizzo:</td>
      <td class="val" colspan="3">${escapeHtml(m.indirizzo || '—')}</td>
    </tr>
    <tr>
      <td class="lbl">Comune e Prov.:</td>
      <td class="val">${escapeHtml(m.comune || '—')} ${m.provincia ? `(${escapeHtml(m.provincia)})` : ''}</td>
      <td class="lbl">Telefono / Cell.:</td>
      <td class="val"><strong>${escapeHtml(m.telefono || '—')}</strong></td>
    </tr>
    <tr>
      <td class="lbl">Email:</td>
      <td class="val">${escapeHtml(m.email || '—')}</td>
      <td class="lbl">Famiglia:</td>
      <td class="val">${fam ? `🏠 <strong>${escapeHtml(fam.nome)}</strong>${fam.capofamigliaId === m.id ? ' (Capofamiglia)' : ''}` : 'Non associato'}</td>
    </tr>
  </table>

  <div class="sec-header">3. Sacramenti e Cammino di Fede</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Membro:</td>
      <td class="val"><strong>${ruoloLabel}</strong></td>
      <td class="lbl">Data Adesione:</td>
      <td class="val">${escapeHtml(m.dataAdesione ? formatDate(m.dataAdesione) : '—')}</td>
    </tr>
    <tr>
      <td class="lbl">Battesimo in Acqua:</td>
      <td class="val">
        ${m.battesimoAcqua ? `<strong>Celebrato</strong> (Data: ${escapeHtml(formatDate(m.dataBA))})` : 'Non celebrato'}
      </td>
      <td class="lbl">Spirito Santo:</td>
      <td class="val">
        ${m.battesimoSpiritoSanto ? `<strong>Ricevuto</strong> (Data: ${escapeHtml(formatDate(m.dataSS))})` : 'Non ancora ricevuto'}
      </td>
    </tr>
  </table>

  ${(isVedovo || isSostenuto || m.dettaglioSostegno) ? `
  <div class="sec-header">4. Condizione Ecclesiale Speciale &amp; Assistenza</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Inclusione Registri:</td>
      <td class="val" colspan="3">
        ${isVedovo ? '✓ Iscritto/a nel <strong>Registro Vedove</strong> (Cura pastorale e visite)' : ''}
        ${isVedovo && isSostenuto ? ' · ' : ''}
        ${isSostenuto ? '✓ Iscritto/a nel <strong>Registro Sostenuti</strong> (Fondo carità e assistenza)' : ''}
      </td>
    </tr>
    ${m.dettaglioSostegno ? `
    <tr>
      <td class="lbl">Note Sostegno / Cura:</td>
      <td class="val" colspan="3">${escapeHtml(m.dettaglioSostegno)}</td>
    </tr>` : ''}
  </table>
  ` : ''}

  <div class="sec-header">${(isVedovo || isSostenuto || m.dettaglioSostegno) ? '5' : '4'}. Consensi e Privacy (GDPR)</div>
  <table class="data-table">
    <tr>
      <td class="lbl">Comunicazioni WhatsApp:</td>
      <td class="val">${m.consensoWhatsApp === 'Acconsentito' || m.consensoWhatsApp === true ? '✓ Acconsentito' : 'Non specificato'}</td>
      <td class="lbl">Foto / Video Ecclesiali:</td>
      <td class="val">${m.consensoFotoVideo === 'Acconsentito' || m.consensoFotoVideo === true ? '✓ Acconsentito' : 'Non specificato'}</td>
    </tr>
  </table>

  ${m.note ? `
  <div class="sec-header">${(isVedovo || isSostenuto || m.dettaglioSostegno) ? '6' : '5'}. Note Pastorali Interne</div>
  <div class="note-box">${escapeHtml(m.note)}</div>
  ` : ''}

  <table class="signatures">
    <tr>
      <td>
        <div class="sig-line">Firma del Membro</div>
      </td>
      <td>
        <div class="sig-line">
          Il Ministro di Culto / Pastore<br>
          <strong>${escapeHtml(pastor)}</strong>
        </div>
      </td>
    </tr>
  </table>

  <div class="footer-doc">
    Documento Ufficiale Registro Ecclesiale · ${escapeHtml(churchName)} · Stampato il ${new Date().toLocaleDateString('it-IT')}
  </div>
</body>
</html>`;
}

/**
 * Registro Totale Membri (A4 Landscape - Arial 10pt - Sobrio & Compatto)
 * Supporta:
 * - 'tutti' -> Registro Generale dei Membri
 * - 'effettivi' -> Registro dei Membri Effettivi
 * - 'aderenti' -> Registro dei Membri Aderenti
 * - 'vedove' -> Registro delle Vedove
 * - 'sostenuti' -> Registro dei Sostenuti
 */
function churchRegisterPage(members, s = {}, filterCode = 'tutti', families = []) {
  const churchName = s.chiesa || 'Come Tralci Novara';
  const pastor = s.pastore || 'Bruno Astemio';
  const logoUri = getLogoDataUri();

  let regTitle = 'REGISTRO GENERALE DEI MEMBRI';
  let regSubtitle = 'Elenco complessivo dei fedeli registrati nella comunità';

  if (filterCode === 'effettivi') {
    regTitle = 'REGISTRO DEI MEMBRI EFFETTIVI';
    regSubtitle = 'Elenco ufficiale dei membri effettivi battezzati e comunicanti';
  } else if (filterCode === 'aderenti') {
    regTitle = 'REGISTRO DEI MEMBRI ADERENTI';
    regSubtitle = 'Elenco dei membri aderenti, simpatizzanti e catecumeni';
  } else if (filterCode === 'vedove') {
    regTitle = 'REGISTRO DELLE VEDOVE E DEI VEDOVI';
    regSubtitle = 'Registro pastorale per la cura, l\'assistenza e le visite fraterne';
  } else if (filterCode === 'sostenuti') {
    regTitle = 'REGISTRO DEI MEMBRI SOSTENUTI';
    regSubtitle = 'Elenco delle persone e delle famiglie assistite dal ministero di carità';
  } else if (filterCode === 'ba') {
    regTitle = 'REGISTRO DEI MEMBRI BATTEZZATI IN ACQUA';
    regSubtitle = 'Elenco dei credenti battezzati per immersione in acqua';
  } else if (filterCode === 'ss') {
    regTitle = 'REGISTRO BATTESIMO NELLO SPIRITO SANTO';
    regSubtitle = 'Elenco dei credenti con attestazione del Battesimo nello Spirito Santo';
  } else if (filterCode === 'non-attivi') {
    regTitle = 'ELENCO DEI MEMBRI NON ATTIVI';
    regSubtitle = 'Registro dei fedeli disattivati o non attivi nella comunità';
  }

  const familyMap = new Map();
  if (Array.isArray(families)) {
    for (const fam of families) {
      if (Array.isArray(fam.memberIds)) {
        for (const mId of fam.memberIds) {
          familyMap.set(mId, fam);
        }
      }
    }
  }

  // Costruzione Riquadri per ogni membro (vista predefinita ricca di dati)
  const boxesHtml = members.map((m, idx) => {
    const isEff = m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua);
    const ruoloText = isEff ? 'Membro Effettivo' : 'Membro Aderente';
    const isVed = !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov');
    const isSost = !!m.isSostenuto;
    const stato = m.stato || 'Attivo';
    const fam = familyMap.get(m.id);
    const isCapo = fam && fam.capofamigliaId === m.id;

    let extraNotes = [];
    if (isVed && filterCode !== 'vedove') extraNotes.push('Registro Vedove/i');
    if (isSost && filterCode !== 'sostenuti') extraNotes.push('Registro Sostenuti');
    if (m.dettaglioSostegno) extraNotes.push(`Sostegno: ${m.dettaglioSostegno}`);
    if (m.note) extraNotes.push(m.note);
    const noteStr = extraNotes.join(' · ');

    const gdprConsensi = [];
    if (m.consensoWhatsApp) gdprConsensi.push(`WhatsApp: ${m.consensoWhatsApp}`);
    if (m.consensoFotoVideo) gdprConsensi.push(`Foto/Video: ${m.consensoFotoVideo}`);
    const gdprStr = gdprConsensi.join(' · ');

    const statoClass = (stato === 'Attivo') ? 'badge-green' : 'badge-danger';

    return `
      <div class="member-box">
        <div class="box-head">
          <div class="box-head-left">
            <span class="prot-badge">Prot. #${m.protocollo ?? m.id}</span>
            <span class="box-name">${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</span>
            <span class="badge ${isEff ? 'badge-effettivo' : 'badge-aderente'}">${ruoloText}</span>
            <span class="badge ${statoClass}">● ${escapeHtml(stato)}</span>
            ${m.dataAdesione ? `<span class="adesione-tag">Adesione: <strong>${formatDate(m.dataAdesione)}</strong></span>` : ''}
          </div>
          <div class="box-head-right">
            ${isVed ? '<span class="tag-badge tag-vedova">Vedovo/a</span>' : ''}
            ${isSost ? '<span class="tag-badge tag-sostenuto">Sostenuto</span>' : ''}
            ${fam ? `<span class="tag-badge tag-famiglia">🏠 ${escapeHtml(fam.nome)}${isCapo ? ' <strong>(Capofamiglia)</strong>' : ''}</span>` : ''}
          </div>
        </div>
        <table class="box-table">
          <tr>
            <td class="lbl" style="width:16%;">Codice Fiscale:</td>
            <td class="val" style="width:34%; font-family:monospace; font-weight:bold; letter-spacing:0.3px;">${escapeHtml(m.codiceFiscale || '—')}</td>
            <td class="lbl" style="width:16%;">Stato Civile:</td>
            <td class="val" style="width:34%;">${escapeHtml(m.statoCivile || (isVed ? 'Vedovo/a' : '—'))}</td>
          </tr>
          <tr>
            <td class="lbl">Nascita:</td>
            <td class="val">${formatDate(m.dataNascita)}${calcAge(m.dataNascita)}${m.luogoNascita ? ` a ${escapeHtml(m.luogoNascita)}` : ''}${m.provinciaNascita ? ` (${escapeHtml(m.provinciaNascita)})` : ''}</td>
            <td class="lbl">Data Adesione:</td>
            <td class="val">${m.dataAdesione ? formatDate(m.dataAdesione) : '—'}</td>
          </tr>
          <tr>
            <td class="lbl">Residenza:</td>
            <td class="val">${escapeHtml(m.indirizzo || '—')}, ${escapeHtml(m.comune || '—')}${m.provincia ? ` (${escapeHtml(m.provincia)})` : ''}</td>
            <td class="lbl">Nucleo Familiare:</td>
            <td class="val">${fam ? `🏠 ${escapeHtml(fam.nome)}${isCapo ? ' <strong>(Capofamiglia)</strong>' : ''}` : '<span style="color:#777;">Non assegnato</span>'}</td>
          </tr>
          <tr>
            <td class="lbl">Professione / Titolo:</td>
            <td class="val">${escapeHtml(m.professione || '—')}${m.titoloStudio ? ` · ${escapeHtml(m.titoloStudio)}` : ''}</td>
            <td class="lbl">Recapiti:</td>
            <td class="val">Tel: <strong>${escapeHtml(m.telefono || '—')}</strong>${m.email ? ` · ${escapeHtml(m.email)}` : ''}</td>
          </tr>
          <tr>
            <td class="lbl">Battesimo Acqua:</td>
            <td class="val">${m.battesimoAcqua ? `✓ Celebrato${m.dataBA ? ' (' + formatDate(m.dataBA) + ')' : ''}` : 'Non celebrato'}</td>
            <td class="lbl">Spirito Santo:</td>
            <td class="val">${m.battesimoSpiritoSanto ? `✓ Ricevuto${m.dataSS ? ' (' + formatDate(m.dataSS) + ')' : ''}` : 'Non ancora ricevuto'}</td>
          </tr>
          ${(noteStr || gdprStr) ? `
          <tr>
            <td class="lbl">Note / Annotazioni:</td>
            <td class="val" colspan="3">
              ${noteStr ? escapeHtml(noteStr) : ''}
              ${noteStr && gdprStr ? ' · ' : ''}
              ${gdprStr ? `<span style="color:#555; font-size:8pt;">[GDPR: ${escapeHtml(gdprStr)}]</span>` : ''}
            </td>
          </tr>` : ''}
        </table>
      </div>
    `;
  }).join('');

  // Costruzione Tabella Sintetica (alternativa tabellare compatta)
  const rowsHtml = members.map((m, idx) => {
    const isEff = m.ruolo === 'Effettivo' || (!m.ruolo && !!m.battesimoAcqua);
    const ruoloText = isEff ? 'Effettivo' : 'Aderente';
    const isVed = !!m.isVedovo || (m.statoCivile || '').toLowerCase().includes('vedov');
    const isSost = !!m.isSostenuto;
    const stato = m.stato || 'Attivo';
    const fam = familyMap.get(m.id);
    const isCapo = fam && fam.capofamigliaId === m.id;

    let extraNote = m.note || '';
    if (isVed && filterCode !== 'vedove') extraNote = (extraNote ? extraNote + ' · ' : '') + 'Vedovo/a';
    if (isSost && filterCode !== 'sostenuti') extraNote = (extraNote ? extraNote + ' · ' : '') + 'Sostenuto';
    if (filterCode === 'sostenuti' && m.dettaglioSostegno) extraNote = m.dettaglioSostegno;

    const contatti = [m.telefono, m.email].filter(Boolean).join('<br>');
    const battesimi = [
      m.battesimoAcqua ? `BA: ${formatDate(m.dataBA) || 'Sì'}` : 'BA: —',
      m.battesimoSpiritoSanto ? `SS: ${formatDate(m.dataSS) || 'Sì'}` : 'SS: —'
    ].join('<br>');

    return `
      <tr>
        <td style="text-align:center; font-weight:bold;">${m.protocollo ?? m.id}</td>
        <td style="font-weight:bold;">${escapeHtml(m.cognome)} ${escapeHtml(m.nome)}</td>
        <td style="font-family:monospace; font-size:8pt; text-align:center;">${escapeHtml(m.codiceFiscale || '—')}</td>
        <td style="text-align:center; font-size:8pt;">${formatDate(m.dataNascita)}${calcAge(m.dataNascita)}</td>
        <td style="font-size:8.5pt;">${escapeHtml(m.indirizzo || '—')}, ${escapeHtml(m.comune || '—')}${m.provincia ? ` (${escapeHtml(m.provincia)})` : ''}</td>
        <td style="font-size:8pt;">${contatti || '—'}</td>
        <td style="text-align:center; font-size:8.5pt;">${escapeHtml(m.statoCivile || (isVed ? 'Vedovo/a' : '—'))}</td>
        <td style="text-align:center; font-size:8pt;">${m.dataAdesione ? formatDate(m.dataAdesione) : '—'}</td>
        <td style="font-size:8pt; text-align:center;">${battesimi}</td>
        <td style="text-align:center; font-size:8.5pt;"><strong>${ruoloText}</strong><br><span style="font-size:7.5pt; color:#555;">● ${escapeHtml(stato)}</span></td>
        <td style="font-size:8pt;">${fam ? `🏠 ${escapeHtml(fam.nome)}${isCapo ? ' (Capo)' : ''}<br>` : ''}${escapeHtml(extraNote || '—')}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(regTitle)} - ${escapeHtml(churchName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm 10mm 12mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.5pt;
      line-height: 1.25;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .print-toolbar {
      position: fixed;
      top: 10px;
      right: 12px;
      display: flex;
      gap: 8px;
      z-index: 1000;
    }
    .tb-btn {
      background: #1e293b;
      color: #fff;
      border: 1px solid #0f172a;
      padding: 7px 13px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 9pt;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 5px rgba(0,0,0,0.25);
    }
    .tb-btn.primary {
      background: #0284c7;
      border-color: #0369a1;
    }
    .tb-btn:hover {
      opacity: 0.92;
    }
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8px;
      border-bottom: 1.5px solid #222;
      padding-bottom: 4px;
    }
    .header-table td {
      vertical-align: middle;
      padding: 0;
    }
    .logo-img {
      max-height: 42px;
      max-width: 170px;
      object-fit: contain;
      display: block;
    }
    .reg-title {
      font-size: 13pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      margin: 0;
    }
    .reg-sub {
      font-size: 8.5pt;
      color: #444;
      margin-top: 2px;
    }
    .meta-box {
      text-align: right;
      font-size: 9pt;
      line-height: 1.3;
    }
    /* Riquadri per ogni membro */
    .view-boxes {
      margin-top: 6px;
    }
    .member-box {
      border: 1px solid #64748b;
      border-radius: 4px;
      margin-bottom: 8px;
      background: #fff;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .box-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1f5f9;
      border-bottom: 1px solid #cbd5e1;
      padding: 3.5px 7px;
      flex-wrap: wrap;
      gap: 4px;
    }
    .box-head-left {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .box-head-right {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .prot-badge {
      background: #0284c7;
      color: #fff;
      font-weight: bold;
      font-size: 8.5pt;
      padding: 1.5px 6px;
      border-radius: 3px;
    }
    .box-name {
      font-size: 10pt;
      font-weight: bold;
      color: #0f172a;
    }
    .badge {
      font-size: 8pt;
      font-weight: bold;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .badge-effettivo {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .badge-aderente {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .badge-green {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .badge-danger {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    .badge-amber {
      background: #fef3c7;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .badge-blue {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .badge-gray {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #cbd5e1;
    }
    .adesione-tag {
      font-size: 8pt;
      color: #0369a1;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 1px 5px;
      border-radius: 3px;
    }
    .tag-badge {
      font-size: 7.5pt;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid #94a3b8;
      background: #fff;
      color: #334155;
    }
    .tag-vedova {
      border-color: #cbd5e1;
      background: #f8fafc;
    }
    .tag-sostenuto {
      border-color: #fed7aa;
      background: #fff7ed;
      color: #c2410c;
    }
    .tag-famiglia {
      border-color: #94a3b8;
      background: #f8fafc;
      font-weight: 500;
    }
    .box-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    .box-table td {
      padding: 2.5px 6px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .box-table td.lbl {
      background: #f8fafc;
      font-weight: bold;
      color: #334155;
      font-size: 8pt;
    }
    .box-table td.val {
      color: #0f172a;
    }
    /* Tabella Sintetica */
    table.reg-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      margin-bottom: 8px;
    }
    table.reg-table th {
      background: #f1f1f1;
      border: 1px solid #666;
      font-size: 8pt;
      font-weight: bold;
      text-transform: uppercase;
      padding: 3.5px 4px;
      text-align: left;
    }
    table.reg-table td {
      border: 1px solid #ccc;
      padding: 3px 4px;
      font-size: 8.5pt;
      vertical-align: middle;
    }
    table.reg-table tr:nth-child(even) td {
      background: #fafafa;
    }
    .footer-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      font-size: 9pt;
      border-top: 1px solid #666;
      padding-top: 6px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .footer-table td {
      vertical-align: top;
      padding-top: 6px;
    }
    @media print {
      .print-toolbar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <button class="tb-btn primary" onclick="window.print()">🖨️ Stampa Registro (A4)</button>
    <button class="tb-btn" id="btn-toggle-view" onclick="toggleView()">📑 Passa a Vista Tabella Sintetica</button>
  </div>

  <table class="header-table">
    <tr>
      <td style="width: 25%;">
        ${logoUri ? `<img src="${logoUri}" alt="Come Tralci Novara" class="logo-img">` : `<span style="font-size:12pt;font-weight:bold;">${escapeHtml(churchName)}</span>`}
      </td>
      <td style="text-align:center;">
        <h1 class="reg-title">${escapeHtml(regTitle)}</h1>
        <div class="reg-sub">${escapeHtml(churchName)} · ${escapeHtml(regSubtitle)}</div>
      </td>
      <td style="width: 25%;" class="meta-box">
        <div>Totale Iscritti: <strong>${members.length}</strong></div>
        <div style="font-size:8pt;color:#555;">Data Stampa: ${new Date().toLocaleDateString('it-IT')}</div>
      </td>
    </tr>
  </table>

  <!-- Vista 1: Riquadri Dettagliati per ogni Membro (Predefinita) -->
  <div id="view-boxes" class="view-boxes">
    ${boxesHtml}
  </div>

  <!-- Vista 2: Tabella Sintetica Compatta (Alternativa) -->
  <div id="view-table" class="view-table" style="display:none;">
    <table class="reg-table">
      <thead>
        <tr>
          <th style="width:42px; text-align:center;">N. Prot.</th>
          <th style="width:145px;">Cognome e Nome</th>
          <th style="width:115px; text-align:center;">Codice Fiscale</th>
          <th style="width:80px; text-align:center;">Nascita</th>
          <th>Indirizzo e Residenza</th>
          <th style="width:105px;">Recapiti</th>
          <th style="width:75px; text-align:center;">Stato Civile</th>
          <th style="width:75px; text-align:center;">Adesione</th>
          <th style="width:90px; text-align:center;">Battesimi</th>
          <th style="width:80px; text-align:center;">Ruolo / Stato</th>
          <th style="width:120px;">Famiglia &amp; Note</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>

  <table class="footer-table">
    <tr>
      <td style="width: 40%;">
        Registro Vidimato il ${new Date().toLocaleDateString('it-IT')}<br>
        <span style="font-size:8pt;color:#666;">Documento ecclesiastico ad uso interno ai sensi del Reg. UE 2016/679 (GDPR).</span>
      </td>
      <td style="text-align:center; width: 30%;">
        Il Segretario di Chiesa<br><br>
        ___________________________
      </td>
      <td style="text-align:right; width: 30%;">
        Il Pastore Responsabile<br>
        <strong>${escapeHtml(pastor)}</strong><br><br>
        ___________________________
      </td>
    </tr>
  </table>

  <script>
    function toggleView() {
      var boxes = document.getElementById('view-boxes');
      var table = document.getElementById('view-table');
      var btn = document.getElementById('btn-toggle-view');
      if (boxes.style.display !== 'none') {
        boxes.style.display = 'none';
        table.style.display = 'block';
        btn.innerHTML = '📋 Passa a Vista Riquadri Completi';
      } else {
        boxes.style.display = 'block';
        table.style.display = 'none';
        btn.innerHTML = '📑 Passa a Vista Tabella Sintetica';
      }
    }
  </script>
</body>
</html>`;
}

/**
 * Ruolino Famiglie (A4 Portrait - Arial 10pt)
 */
function familyRegisterPage(families, s = {}) {
  const churchName = s.chiesa || 'Come Tralci Novara';
  const pastor = s.pastore || 'Bruno Astemio';
  const logoUri = getLogoDataUri();

  const cardsHtml = families.map((f, idx) => `
    <div style="border:1px solid #aaa; padding:8px 10px; margin-bottom:10px; page-break-inside:avoid; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:4px; margin-bottom:6px;">
        <div>
          <span style="font-size:10.5pt; font-weight:bold; color:#111;">${idx + 1}. ${escapeHtml(f.nome)}</span>
          ${f.capofamiglia ? `<span style="font-size:9pt; color:#444; margin-left:8px;">(Capofamiglia: <strong>${escapeHtml(f.capofamiglia.nome)}</strong>)</span>` : ''}
        </div>
        <div style="font-size:9pt; font-weight:bold; background:#eee; padding:1px 6px; border:1px solid #ccc;">
          ${f.membri.length} component${f.membri.length === 1 ? 'e' : 'i'}
        </div>
      </div>
      <div style="font-size:9pt; color:#333; margin-bottom:5px;">
        Residenza: <strong>${escapeHtml(f.indirizzo || '—')}, ${escapeHtml(f.comune || '—')} ${f.provincia ? `(${escapeHtml(f.provincia)})` : ''}</strong>
        ${f.note ? ` · Note: <em>${escapeHtml(f.note)}</em>` : ''}
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:9pt;">
        <thead>
          <tr style="background:#f4f4f4;">
            <th style="padding:3px 5px; border:1px solid #ccc; text-align:left;">Membro</th>
            <th style="padding:3px 5px; border:1px solid #ccc; text-align:center; width:80px;">Nascita</th>
            <th style="padding:3px 5px; border:1px solid #ccc; text-align:left; width:110px;">Telefono</th>
            <th style="padding:3px 5px; border:1px solid #ccc; text-align:center; width:100px;">Battesimo Acqua</th>
            <th style="padding:3px 5px; border:1px solid #ccc; text-align:center; width:90px;">Spirito Santo</th>
          </tr>
        </thead>
        <tbody>
          ${f.membri.map(m => `
            <tr>
              <td style="padding:3px 5px; border:1px solid #ddd; font-weight:bold;">
                ${escapeHtml(m.cognome)} ${escapeHtml(m.nome)} <span style="font-size:8pt; font-weight:normal; color:#555;">(Prot. #${m.protocollo ?? m.id})</span>
                ${f.capofamigliaId === m.id ? '<span style="font-size:8pt; font-weight:normal; color:#444;"> (Capofamiglia)</span>' : ''}
              </td>
              <td style="padding:3px 5px; border:1px solid #ddd; text-align:center;">${formatDate(m.dataNascita)}</td>
              <td style="padding:3px 5px; border:1px solid #ddd;">${escapeHtml(m.telefono || '—')}</td>
              <td style="padding:3px 5px; border:1px solid #ddd; text-align:center;">${m.battesimoAcqua ? 'Sì (' + escapeHtml(m.dataBA || '—') + ')' : '—'}</td>
              <td style="padding:3px 5px; border:1px solid #ddd; text-align:center;">${m.battesimoSpiritoSanto ? 'Sì (' + escapeHtml(m.dataSS || '—') + ')' : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <title>Ruolino Famiglie - ${escapeHtml(churchName)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.25;
      color: #111;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .print-btn {
      position: fixed;
      top: 12px;
      right: 12px;
      background: #1e293b;
      color: #fff;
      border: none;
      padding: 8px 14px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 10pt;
      font-weight: bold;
      cursor: pointer;
    }
    @media print {
      .print-btn { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ Stampa Ruolino Famiglie</button>
  <div style="border-bottom:1.5px solid #222; padding-bottom:6px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
    <div>
      ${logoUri ? `<img src="${logoUri}" alt="Logo" style="max-height:40px; margin-bottom:4px;"><br>` : ''}
      <span style="font-size:12pt; font-weight:bold; text-transform:uppercase;">${escapeHtml(churchName)}</span>
      <div style="font-size:8.5pt; color:#444;">Ruolino Ufficiale Gruppi Familiari · Pastore: ${escapeHtml(pastor)}</div>
    </div>
    <div style="text-align:right; font-size:9pt;">
      Totale Nuclei: <strong>${families.length}</strong><br>
      Data: ${new Date().toLocaleDateString('it-IT')}
    </div>
  </div>
  ${cardsHtml}
  <div style="display:flex; justify-content:space-between; font-size:8.5pt; color:#555; margin-top:16px; border-top:1px solid #aaa; padding-top:4px;">
    <div>Stampato il ${new Date().toLocaleDateString('it-IT')}</div>
    <div>Firma Pastore: _____________________________________</div>
  </div>
</body>
</html>`;
}

module.exports = {
  memberCardPage,
  churchRegisterPage,
  familyRegisterPage
};
