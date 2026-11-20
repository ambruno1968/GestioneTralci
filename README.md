# ⛪ GestioneTralci – Progressive Web App (PWA)

> **Gestionale Ecclesiastico Ufficiale · Anagrafica & Sacramenti · 4 Registri Canonici · Fascicoli Digitali · Nuclei Familiari · Cloud Sync Google Drive**  
> *Versione PWA: 2.3 · Sviluppato da Bruno Astemio con Antigravity*

---

## 🌟 Panoramica

**GestioneTralci PWA** è la versione Progressive Web App (PWA) moderna, autonoma e multipiattaforma del gestionale ecclesiastico per la Chiesa Evangelica Pentecostale e Missionaria «Come Tralci» di Novara.

### Caratteristiche Principali:
- **100% Autonoma & Offline-First**: Non richiede l'avvio di un server locale (Node.js/Electron) per l'utente finale. Tutti i dati risiedono in sicurezza nel browser (`localStorage`) grazie al motore integrato `localDbEngine.js`.
- **Installabile come App Nativa**: Installabile con un clic su **Chromebook / ChromeOS, Windows, macOS, Android e iOS**.
- **Sincronizzazione Cloud Google Drive**: Backup automatico e ripristino bidirezionale sulla cartella cloud dedicata *«Gestione Tralci»* (compatibile con backup precedenti *«Gestionale Tralci»* e *«Registro Chiesa»*) tramite Google Identity Services (GIS).
- **Stampe Ufficiali Sobrie A4 (Arial 10pt)**: Stampa diretta di schede membro, registri canonici e ruolino famiglie senza blocco di popup.
- **Service Worker & Auto-aggiornamento**: Architettura cache-first/network-first (`sw.js`) per caricamento istantaneo e funzionamento garantito anche in assenza di connessione internet.

---

## 📁 Struttura del Progetto

```text
GestioneTralci/
├── src/                      # Sorgenti PWA modificabili
│   ├── index.html            # Template HTML dell'applicazione
│   ├── styles.css            # Fogli di stile responsive
│   ├── app.js                # Frontend SPA logica anagrafica & registri
│   ├── pwa.js                # Layer PWA (Service Worker, GIS, Bridge nativo, installazione)
│   ├── localDbEngine.js      # Motore dati offline-first locale
│   ├── driveClient.js        # Client REST Google Drive v3
│   ├── printTemplates.js     # Modelli di stampa A4 canonici
│   ├── default-db.json       # Database iniziale di seed
│   ├── manifest.webmanifest  # Manifesto PWA per installazione
│   ├── sw.js                 # Service Worker per caching e offline
│   ├── WIKI.md               # Manuale e guida all'uso
│   ├── icon.png / logo.png   # Risorse grafiche
│   ├── icon-192.png          # Icona PWA 192x192
│   ├── icon-512.png          # Icona PWA 512x512
│   └── .nojekyll             # Compatibilità per GitHub Pages
├── docs/                     # Cartella di output compilata da build-pwa.js (pubblicata su GitHub Pages)
├── build-pwa.js              # Script di compilazione: sincronizza /src in /docs
├── serve.js                  # Server HTTP locale minimale per test
├── Prova PWA in locale.bat   # Avvio rapido con doppio clic su Windows (porta 5210)
├── package.json              # Configurazione e script di comando
├── .gitignore                # Regole Git
└── README.md                 # Questo documento
```

---

## 🚀 1. Prova Locale sul PC

Fai doppio clic sul file:
```text
Prova PWA in locale.bat
```
Oppure da terminale:
```bash
npm run dev
# oppure: node build-pwa.js && node serve.js
```
Il browser si aprirà su: `http://localhost:5210` con l'app pronta e installabile.

---

## 🌐 2. Pubblicazione su GitHub Pages (Gratis & HTTPS)

1. Repository su GitHub: `https://github.com/ambruno1968/GestioneTralci`.
2. Pubblica i commit sul branch `main`.
3. Su GitHub apri: **Settings → Pages**.
4. In **Build and deployment**:
   - **Source**: *Deploy from a branch*
   - **Branch**: `main`
   - **Folder**: `/docs`
5. Salva. In pochi minuti l'app sarà disponibile pubblicamente in HTTPS su:
   `https://ambruno1968.github.io/GestioneTralci/`

---

## 🔑 3. Configurazione Google Drive (Google Cloud Console)

Per consentire l'accesso con Google Drive direttamente dal browser/PWA:
1. Accedi a [Google Cloud Console](https://console.cloud.google.com/).
2. Seleziona il progetto relativo all'app (Client ID: `258159664417-nc6r2krvqu8fvutoa1p9j3b81agrugqs.apps.googleusercontent.com`).
3. Vai in **API e servizi → Credenziali → Client ID OAuth 2.0**.
4. Nella sezione **Origini JavaScript autorizzate** aggiungi:
   - `http://localhost:5210` (per i test in locale)
   - `http://localhost:8080` (se necessario per altri test)
   - `https://ambruno1968.github.io` (URL di produzione su GitHub Pages)
5. Assicurati che l'API **Google Drive API** sia abilitata.

---

## 📲 4. Come Installare la PWA

### Su Chrome / Edge (PC Windows, Mac, Linux, Chromebook):
1. Visita l'indirizzo dell'app.
2. Clicca sull'icona **Installa** nella barra degli indirizzi o sul pulsante galleggiante **📲 Installa GestioneTralci**.
3. L'applicazione apparirà nel menu programmi/applicazioni come app indipendente con finestra dedicata.

### Su Android:
1. Apri la pagina in Google Chrome.
2. Tocca il banner **Installa GestioneTralci** oppure il menu ⋮ → **Aggiungi a schermata Home** / **Installa app**.

### Su iPhone / iPad (iOS Safari):
1. Apri la pagina in Safari.
2. Tocca l'icona di condivisione (quadrato con freccia in su).
3. Tocca **Aggiungi alla schermata Home**.

---

## 🔄 5. Flusso di Lavoro e Aggiornamenti

Quando apporti modifiche ai sorgenti in `/src`:
```bash
node build-pwa.js
git add .
git commit -m "Descrizione modifiche"
git push
```
Lo script `build-pwa.js` aggiorna automaticamente `/docs` e il Service Worker aggiornerà la cache dell'app per tutti gli utenti al riavvio successivo.

