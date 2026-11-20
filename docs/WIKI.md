# 📖 WIKI & MANUALE UFFICIALE DI GESTIONETRALCI

> **Gestionale Ecclesiastico · Registri Canonici · Fascicoli Membri · PWA Offline-First · Cloud Sync**  
> *Chiesa Evangelica Pentecostale e Missionaria «Come Tralci Novara»*  
> *Versione: 2.1 · Autore: Bruno Astemio con Antigravity*

---

## 📑 Indice Generale

1. [Introduzione & Filosofia del Gestionale](#1-introduzione--filosofia-del-gestionale)
2. [Requisiti di Sistema & Architettura](#2-requisiti-di-sistema--architettura)
3. [Guida all'Avvio & Installazione](#3-guida-allavvio--installazione)
   - [3.1 Avvio Rapido con Batch (Consigliato)](#31-avvio-rapido-con-batch-consigliato)
   - [3.2 Avvio come Applicazione Desktop (Electron)](#32-avvio-come-applicazione-desktop-electron)
   - [3.3 Creazione del Pacchetto Installer Windows (.exe)](#33-creazione-del-pacchetto-installer-windows-exe)
   - [3.4 Utilizzo in Rete Locale (LAN Parrocchiale)](#34-utilizzo-in-rete-locale-lan-parrocchiale)
4. [I 4 Registri Canonici Ecclesiali](#4-i-4-registri-canonici-ecclesiali)
   - [4.1 Registro Generale dei Membri](#41-registro-generale-dei-membri)
   - [4.2 Registro Membri Effettivi](#42-registro-membri-effettivi)
   - [4.3 Registro Membri Aderenti](#43-registro-membri-aderenti)
   - [4.4 Registro delle Vedove e dei Vedovi](#44-registro-delle-vedove-e-dei-vedovi)
   - [4.5 Registro dei Membri Sostenuti](#45-registro-dei-membri-sostenuti)
   - [4.6 Il Numero di Protocollo Cartaceo (#)](#46-il-numero-di-protocollo-cartaceo-)
5. [Scheda Anagrafica & Fascicolo Digitale del Membro](#5-scheda-anagrafica--fascicolo-digitale-del-membro)
   - [5.1 Dati Anagrafici e Residenza](#51-dati-anagrafici-e-residenza)
   - [5.2 Sacramenti di Fede (Battesimi)](#52-sacramenti-di-fede-battesimi)
   - [5.3 Consensi Privacy & GDPR](#53-consensi-privacy--gdpr)
   - [5.4 Fascicolo Digitale: Gestione Documenti & Scansioni](#54-fascicolo-digitale-gestione-documenti--scansioni)
   - [5.5 Stampa Scheda Singola Membro (A4)](#55-stampa-scheda-singola-membro-a4)
6. [Gestione dei Nuclei Familiari](#6-gestione-dei-nuclei-familiari)
   - [6.1 Creazione e Modifica Famiglia](#61-creazione-e-modifica-famiglia)
   - [6.2 Designazione del Capofamiglia](#62-designazione-del-capofamiglia)
   - [6.3 Gestione Componenti e Membri Non Assegnati](#63-gestione-componenti-e-membri-non-assegnati)
   - [6.4 Stampa Ruolino Ufficiale dei Nuclei Familiari](#64-stampa-ruolino-ufficiale-dei-nuclei-familiari)
7. [Sincronizzazione Cloud con Google Drive](#7-sincronizzazione-cloud-con-google-drive)
   - [7.1 Come Funziona il Cloud Sync](#71-come-funziona-il-cloud-sync)
   - [7.2 Configurazione Credenziali Google (OAuth 2.0)](#72-configurazione-credenziali-google-oauth-20)
   - [7.3 Importazione Guidata file client_secret](#73-importazione-guidata-file-client_secret)
   - [7.4 Sincronizzazione, Ripristino da Cloud e Disconnessione](#74-sincronizzazione-ripristino-da-cloud-e-disconnessione)
8. [Backup, Manutenzione & Sicurezza](#8-backup-manutenzione--sicurezza)
   - [8.1 Backup Automatici Giornalieri Locali](#81-backup-automatici-giornalieri-locali)
   - [8.2 Esportazione e Importazione Manuale JSON](#82-esportazione-e-importazione-manuale-json)
   - [8.3 Registro di Audit (Tracciamento Operazioni)](#83-registro-di-audit-tracciamento-operazioni)
   - [8.4 Come Trasferire il Gestionale su un Nuovo PC](#84-come-trasferire-il-gestionale-su-un-nuovo-pc)
9. [Standard delle Stampe Ufficiali (A4 Arial 10pt)](#9-standard-delle-stampe-ufficiali-a4-arial-10pt)
10. [Guida alla Risoluzione dei Problemi (Troubleshooting & FAQ)](#10-guida-alla-risoluzione-dei-problemi-troubleshooting--faq)

---

## 1. Introduzione & Filosofia del Gestionale

**Registro di Chiesa** è un software completo, sicuro e leggero ideato specificamente per le esigenze amministrative e pastorali delle comunità cristiane evangeliche.

### Principi Cardine del Progetto
* **Zero Dipendenze Runtime Esterne**: Funziona con il runtime nativo di Node.js senza framework pesanti sul backend.
* **Sobrietà Istituzionale**: Sia l'interfaccia a video sia i documenti stampabili sono progettati secondo gli standard di cancelleria ecclesiale in font **Arial 10pt**, garantendo la massima leggibilità, compattezza e un archivio storico cartaceo ordinato.
* **Separazione Canonica dei Registri**: In linea con la prassi ecclesiale biblica e statutaria, la comunità è organizzata in registri distinti (Membri Effettivi con battesimo in acqua, Membri Aderenti, Registro Vedove/i per la cura diaconale e Registro Sostenuti per il fondo caritativo).
* **Fascicolo Membro Completo**: Possibilità di allegare per ciascun fedele scansioni di certificati di battesimo, attestati di trasferimento, documenti d'identità e moduli privacy firmati.
* **Doppia Anima Desktop / Web**: Può essere usato come applicazione desktop nativa (finestra indipendente con menu di sistema) oppure tramite qualsiasi browser web su PC, tablet o rete locale.

---

## 2. Requisiti di Sistema & Architettura

### Requisiti Minimi
* **Sistema Operativo**: Windows 10, Windows 11 o Windows Server (supportato anche su macOS e Linux se avviato via Node.js).
* **Runtime**: Node.js v18.0 o superiore (scaricabile gratuitamente da [nodejs.org](https://nodejs.org/)).
* **Browser Consigliato**: Microsoft Edge, Google Chrome, Mozilla Firefox o Brave (ottimizzato per risoluzioni minime di 1280×720).
* **Spazio su Disco**: ~50 MB per l'applicazione base + spazio per gli allegati (PDF, immagini).

### Struttura delle Cartelle
```text
Registro di chiesa/
├── assets/                     # Icone e risorse grafiche per l'eseguibile desktop
│   ├── icon.ico
│   └── icon.png
├── data/                       # ARCHIVIO DATI PERSISTENTE
│   ├── db.json                 # Database principale in formato JSON
│   ├── attachments/            # File e scansioni allegati ai fascicoli dei membri
│   ├── backup/                 # Copie di backup giornaliere automatiche
│   ├── google-config.json      # Configurazione credenziali Google Drive
│   └── google-token.json       # Token di autenticazione crittografato Cloud Sync
├── lib/                        # Moduli applicativi del server
│   ├── googleDrive.js          # Client OAuth 2.0 nativo per sincronizzazione Google Drive
│   └── printTemplates.js       # Layout stampe ufficiali A4 (Schede, Registri, Famiglie)
├── public/                     # Frontend Web Single Page Application (SPA)
│   ├── index.html              # Interfaccia grafica principale
│   ├── styles.css              # Stili grafici professionali (Arial 10pt / Responsive)
│   ├── app.js                  # Logica client interattiva
│   └── logo.png                # Logo ufficiale della comunità
├── scripts/
│   └── build-installer.js      # Script automatico di pacchettizzazione installer Windows
├── Avvia gestionale.bat        # Script di avvio rapido per Windows con 1 clic
├── Crea Installer.bat          # Script per generare il file di installazione .exe
├── main.js                     # Entry point per l'applicazione desktop nativa Electron
├── package.json                # Metadati e configurazione di compilazione
├── seed.js                     # Struttura e dati anagrafici iniziali della comunità
├── server.js                   # Server HTTP Node.js e API REST native
└── WIKI.md                     # Questa documentazione ufficiale
```

---

## 3. Guida all'Avvio & Installazione

### 3.1 Avvio Rapido con Batch (Consigliato)
Il metodo più immediato e comodo per utilizzare il programma ogni giorno su Windows:
1. Fai doppio clic sul file:
   ```text
   Avvia gestionale.bat
   ```
2. Lo script esegue automaticamente le seguenti operazioni:
   - Controlla la presenza di Node.js sul computer (anche se non configurato nel PATH di sistema).
   - Libera la porta `3001` qualora fosse rimasta occupata da una sessione precedente.
   - Avvia il server locale di **Registro di Chiesa**.
   - Apre in automatico il browser web predefinito all'indirizzo `http://localhost:3001`.
3. *Nota*: Lascia aperta la finestra nera del prompt dei comandi mentre utilizzi il gestionale. Alla fine della giornata è sufficiente chiudere la finestra o premere `Ctrl + C`.

### 3.2 Avvio come Applicazione Desktop (Electron)
Se preferisci utilizzare il programma come software desktop isolato con finestra dedicata e barra dei menu di Windows:
```bash
npm run electron
```
In questa modalità:
- I dati vengono salvati in `%APPDATA%/RegistroDiChiesa/data` (se pacchettizzato) oppure nella cartella locale `./data`.
- Dalla barra dei menu superiore puoi accedere rapidamente alle stampe, all'esportazione Excel e all'apertura diretta della cartella dati.

### 3.3 Creazione del Pacchetto Installer Windows (.exe)
Per distribuire o installare il programma su altri computer della chiesa senza dover configurare manualmente cartelle o dipendenze:
1. Fai doppio clic sul file:
   ```text
   Crea Installer.bat
   ```
   oppure esegui da terminale:
   ```bash
   node scripts/build-installer.js
   ```
2. Lo script eseguirà `electron-builder` e genererà nella cartella `dist/` il file di installazione:
   ```text
   dist/Registro di Chiesa Setup 1.2.2.exe
   ```
3. L'eseguibile di installazione è in lingua italiana, crea automaticamente il collegamento sul Desktop e nel menu Start e permette la scelta del percorso di installazione.

### 3.4 Utilizzo in Rete Locale (LAN Parrocchiale)
Se la segreteria o il pastore desiderano accedere al gestionale da un altro computer o tablet collegato alla stessa rete Wi-Fi/LAN della chiesa:
1. Sul PC dove è in esecuzione il gestionale, apri il prompt dei comandi e digita `ipconfig` per rilevare l'indirizzo IPv4 (es. `192.168.1.50`).
2. Dal secondo dispositivo, apri il browser e collegati a:
   ```text
   http://192.168.1.50:3001
   ```
3. Il gestionale è pienamente accessibile e fruibile in tempo reale da entrambi i dispositivi.

---

## 4. I 4 Registri Canonici Ecclesiali

Nella barra di navigazione superiore, il programma suddivide l'assemblea dei fedeli secondo la corretta disciplina ecclesiastica:

```
[👥 Registro Generale] [🟢 Membri Effettivi] [🔵 Membri Aderenti] [🟣 Registro Vedove] [🟠 Registro Sostenuti] [👨‍👩‍👧‍👦 Famiglie] [⚙️ Impostazioni]
```

### 4.1 Registro Generale dei Membri (`#tutti`)
* **Scopo**: Vista complessiva dell'intero archivio parrocchiale/comunitario.
* **Funzionalità**:
  - Tabella con visualizzazione rapida di Protocollo, Nominativo, Codice Fiscale, Comune di residenza, Telefono, Stato Civile, Sacramenti e Azioni.
  - Ricerca full-text rapida istantanea su tutti i campi.
  - Filtri a tendina per Comune di residenza, Stato Civile, Battesimo in Acqua (Sì/No), Battesimo nello Spirito Santo (Sì/No).
  - Pulsante `+ Nuovo Membro` con calcolo automatico del prossimo protocollo.
  - Pulsante `🖨️ Stampa Registro Generale (A4)` e `📥 Esporta Excel (CSV)`.

### 4.2 Registro Membri Effettivi (`#effettivi`)
* **Definizione Ecclesiale**: Fedeli che hanno pubblicamente confessato la propria fede mediante il **Battesimo in Acqua per immersione** (ruolo *Effettivo*).
* **Valenza Statutaria**: Costituiscono l'Assemblea Generale dei Membri con diritto di voto deliberativo nelle adunanze amministrative della chiesa.
* **Stampa Ufficiale**: Genera il documento cartaceo A4 con intestazione comunitaria, data odierna e riquadro finale per la firma del Pastore.

### 4.3 Registro Membri Aderenti (`#aderenti`)
* **Definizione Ecclesiale**: Fedeli che frequentano con continuità i culti, simpatizzanti, catecumeni o credenti in cammino verso il battesimo che non sono stati ancora battezzati per immersione (ruolo *Aderente*).
* **Valenza**: Permette alla chiesa di curare i nuovi convertiti e mantenere l'elenco aggiornato per le sessioni di catechesi battesimale.

### 4.4 Registro delle Vedove e dei Vedovi (`#vedove`)
* **Definizione Ecclesiale**: In conformità all'ordinamento apostolico neotestamentario (*1 Timoteo 5:3-10*), raccoglie le persone rimaste vedove all'interno della comunità.
* **Cura Pastorale**: Serve al collegio pastorale e al gruppo di diaconia per monitorare le visite domiciliari, il conforto spirituale e le necessità quotidiane di assistenza fraterna.
* **Come si attiva**: Viene associato al membro selezionando lo stato civile *Vedovo/a* oppure spuntando l'opzione *"Includi nel Registro Vedove/i"*.

### 4.5 Registro dei Membri Sostenuti (`#sostenuti`)
* **Definizione Ecclesiale**: Registro riservato per i fedeli o le famiglie che ricevono supporto economico, borse della spesa o sussidi continuativi dal fondo di carità/diaconia della chiesa.
* **Campo Riservato**: Ciascun membro sostenuto dispone di una scheda con il campo **«Dettaglio Sostegno Pastorale / Carità»** per annotare la natura dell'aiuto prestato garantendo la massima riservatezza.

### 4.6 Il Numero di Protocollo Cartaceo (#)
* Ogni membro possiede un **Numero di Protocollo Cartaceo** progressivo (es. `#1`, `#2`, `#35`), visibile in una comoda etichetta azzurra sia a video che sulle stampe.
* Quando si clicca su `+ Nuovo Membro`, il gestionale interroga automaticamente l'endpoint `/api/members/next-protocollo` e propone il primo numero progressivo libero.
* Il numero di protocollo può comunque essere personalizzato manualmente se si desidera allinearlo a un archivio cartaceo o registro storico preesistente.

---

## 5. Scheda Anagrafica & Fascicolo Digitale del Membro

Cliccando sul nominativo di un fedele o sul pulsante `👁️ Scheda`, si apre il **Fascicolo Completo del Membro**.

### 5.1 Dati Anagrafici e Residenza
* Cognome, Nome, Codice Fiscale, Sesso.
* Data di Nascita con **calcolo automatico dell'età in anni**.
* Luogo e Provincia di Nascita.
* Stato Civile (*Coniugato/a, Celibe/Nubile, Vedovo/a, Separato/a, Divorziato/a*).
* Professione e Data di prima adesione alla comunità.
* Indirizzo, Comune, Provincia, CAP.
* Recapito Telefonico (con funzione *Click-to-Call*) ed Email (con *Click-to-Mail*).
* Nucleo familiare di appartenenza con indicazione del ruolo di Capofamiglia.

### 5.2 Sacramenti di Fede (Battesimi)
* **Battesimo in Acqua**: flag Sì/No, data di celebrazione, chiesa/comunità di provenienza e note ministeriali.
* **Battesimo nello Spirito Santo**: flag Sì/No e data dell'esperienza biblica secondo la testimonianza personale del fedele.

### 5.3 Consensi Privacy & GDPR
Per garantire la piena conformità al Regolamento Generale sulla Protezione dei Dati:
* **Consenso Comunicazioni WhatsApp**: autorizzazione all'invio di messaggi informativi, meditazioni e avvisi comunitari tramite la rubrica WhatsApp della chiesa.
* **Consenso Foto / Video Ecclesiali**: liberatoria per la trasmissione streaming dei culti o per la pubblicazione di foto degli eventi comunitari (battesimi, convegni, agapi).
* Cliccando sul numero telefonico è possibile avviare istantaneamente una chat WhatsApp Web con il membro.

### 5.4 Fascicolo Digitale: Gestione Documenti & Scansioni
Ogni fedele dispone di un proprio **Fascicolo Digitale** integrato:
1. Nel profilo del membro è presente la sezione **«📎 Documenti & Fascicolo Membro»**.
2. Cliccando su `+ Allega Documento`:
   - Seleziona la **Categoria Documento**:
     * *Certificato di Battesimo*
     * *Attestato di Trasferimento*
     * *Documento di Identità / CF*
     * *Modulo Privacy Firmato*
     * *Certificato di Matrimonio*
     * *Altro Documento* (o categorie create su misura)
   - Inserisci una descrizione o titolo (es. *«Battesimo 2024 - Pastore Bianchi»*).
   - Seleziona il file dal computer (supportati PDF, JPG, PNG, DOCX, TXT fino a 20 MB).
   - Clicca su **«Carica & Salva»**.
3. I file vengono archiviati in modo protetto nella cartella `data/attachments/` con identificativo univoco.
4. L'operatore può scaricare il file originale o eliminarlo in qualsiasi momento.

### 5.5 Stampa Scheda Singola Membro (A4)
Dalla scheda del membro o dall'elenco, cliccando su `🖨️ Stampa Scheda`:
* Viene generato un documento ufficiale A4 Portrait conforme ai canoni ecclesiali in font **Arial 10pt**.
* Contiene:
  - Intestazione ufficiale con logo, nome e dati della comunità.
  - Numero di Protocollo e data di stampa.
  - Quadro completo dati anagrafici, residenza e recapiti.
  - Quadro Sacramenti (date e annotazioni battesimali).
  - Quadro Consensi Privacy.
  - **Spazio per la Firma del Membro e la Firma del Pastore**.

---

## 6. Gestione dei Nuclei Familiari

La sezione **👨‍👩‍👧‍👦 Famiglie (`#famiglie`)** organizza i credenti in gruppi familiari.

### 6.1 Creazione e Modifica Famiglia
* Clicca su `+ Nuova Famiglia`.
* Inserisci:
  - **Nome del Nucleo** (es. *«Famiglia Rossi»* o *«Rossi - Bianchi»*).
  - **Indirizzo, Comune e Provincia** della dimora familiare.
  - **Telefono di casa o riferimento principale**.
  - **Note pastorali o familiari**.

### 6.2 Designazione del Capofamiglia
* In ogni nucleo è possibile designare il **Capofamiglia**.
* Il capofamiglia viene contraddistinto dall'icona dorata `★ Capofamiglia` sia a video che sul ruolino stampato.
* La designazione può essere modificata in qualsiasi momento con un semplice selettore a tendina.

### 6.3 Gestione Componenti e Membri Non Assegnati
* All'interno della scheda di ogni famiglia è presente l'elenco dei membri che ne fanno parte.
* **Aggiungi componente**: seleziona dal menu a tendina un membro non ancora associato e premi `Aggiungi`.
* **Rimuovi componente**: premi `✕ Rimuovi` accanto al componente; il membro tornerà nello stato di "non assegnato" senza essere cancellato dal registro anagrafico.
* In fondo alla pagina è sempre visibile il riquadro **«Membri Non Assegnati a un Nucleo»**, con un pulsante rapido per assegnarli a una famiglia esistente o crearne una nuova con un clic.

### 6.4 Stampa Ruolino Ufficiale dei Nuclei Familiari
* Cliccando su `🖨️ Stampa Ruolino Nuclei (A4)` viene prodotto l'elenco ufficiale di tutte le famiglie della comunità con indirizzi, recapiti telefonici e tutti i componenti ordinati.

---

## 7. Sincronizzazione Cloud con Google Drive

Il gestionale include un modulo cloud nativo conforme alle **Google Drive REST API v3** e al protocollo **OAuth 2.0**, sviluppato senza librerie terze per la massima sicurezza e velocità.

### 7.1 Come Funziona il Cloud Sync
* Crea automaticamente nella radice di Google Drive la cartella **«Registro Chiesa»**.
* Carica e aggiorna in sicurezza il file del database `db.json`.
* Crea una sottocartella `backup/` sul Drive dove conserva le copie storiche giornaliere.
* Icona di stato sempre visibile nell'intestazione:
  - 🟢 **Cloud Sincronizzato**: account collegato e dati aggiornati.
  - 🟡 **In Sincronizzazione**: operazione di salvataggio remoto in corso.
  - ⚪ **Cloud Non Collegato**: modalità solo locale.

### 7.2 Configurazione Credenziali Google (OAuth 2.0)
Per abilitare la sincronizzazione sul proprio account Google Workspace o Gmail della chiesa:
1. Accedi alla [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un nuovo progetto (es. *«Registro di Chiesa»*).
3. Vai su **API e servizi > Libreria** e abilita le **Google Drive API**.
4. Vai su **Schermata consenso OAuth**: seleziona *Esterno*, compila il nome applicazione e l'email di supporto.
5. Vai su **Credenziali > Crea credenziali > ID client OAuth**:
   - Tipo applicazione: **Applicazione Web** (oppure Applicazione Desktop).
   - Negli **URI di reindirizzamento autorizzati**, aggiungi:
     ```text
     http://localhost:3001/oauth2callback
     ```
6. Scarica il file JSON delle credenziali appena create (avrà nome del tipo `client_secret_XXXXX.json`).

### 7.3 Importazione Guidata file client_secret
1. Nel gestionale, vai in **⚙️ Impostazioni > Sincronizzazione Cloud con Google Drive**.
2. Nella sezione *«Importa file client_secret.json»*, clicca su **«Scegli file»** e seleziona il file scaricato da Google Cloud Console.
3. Il gestionale estrarrà e salverà automaticamente `Client ID` e `Client Secret` in `data/google-config.json`.
4. Clicca sul pulsante blu **«🔗 Connetti Account Google Drive»**.
5. Si aprirà la schermata ufficiale di login Google: concedi l'accesso per la sola cartella di lavoro del gestionale.
6. Al termine verrai reindirizzato al gestionale e vedrai la spunta verde di connessione avvenuta.

### 7.4 Sincronizzazione, Ripristino da Cloud e Disconnessione
* **Sincronizzazione Automatica**: Ogni volta che salvi un membro, una famiglia o un movimento contabile, il gestionale salva prima localmente e poi trasmette la copia aggiornata a Google Drive in background.
* **Sincronizza Adesso**: Pulsante manuale per forzare il salvataggio immediato sul cloud.
* **Ripristina da Cloud**: In caso di sostituzione del computer o guasto hardware, premi questo pulsante per scaricare l'ultimo database salvato su Google Drive e ripristinare all'istante tutti i dati.
* **Disconnetti Cloud**: Rimuove il token di autorizzazione dal computer locale in tutta sicurezza.

---

## 8. Backup, Manutenzione & Sicurezza

### 8.1 Backup Automatici Giornalieri Locali
Ad ogni prima modifica giornaliera dei dati, il server crea in automatico una copia del database nella cartella:
```text
data/backup/db_YYYY-MM-DD.json
```
I backup locali non vengono mai sovrascritti, consentendo di tornare indietro nel tempo a qualsiasi data precedente.

### 8.2 Esportazione e Importazione Manuale JSON
Nella sezione **⚙️ Impostazioni**:
* **Scarica Backup JSON**: scarica immediatamente sul tuo computer una copia di sicurezza dell'intero database con data e ora (es. `backup_registro_chiesa_2026-10-12.json`).
* **Ripristina da File JSON**: consente di selezionare un file `.json` di backup e ripristinarlo integralmente nel sistema, con richiesta esplicita di conferma per evitare sovrascritture accidentali.

### 8.3 Registro di Audit (Tracciamento Operazioni)
Nella parte inferiore delle Impostazioni è consultabile il **Registro Operazioni (Audit Log)**:
* Registra l'orario esatto, l'azione eseguita (es. *Aggiunta membro, Modifica anagrafica, Rimozione componente famiglia, Registrazione movimento contabile*) e i dettagli associati.
* Garantisce la massima trasparenza e controllo amministrativo.

### 8.4 Come Trasferire il Gestionale su un Nuovo PC
Per trasferire l'intero gestionale su un nuovo computer della chiesa:
1. Copia l'intera cartella **«Registro di chiesa»** su una chiavetta USB.
2. Incollala sul nuovo computer (es. in `C:\Gestionali\Registro di chiesa`).
3. Assicurati che sul nuovo PC sia installato Node.js (oppure installa l'app tramite l'eseguibile `dist/*.exe`).
4. Fai doppio clic su `Avvia gestionale.bat`.
5. Tutti i dati, i membri, le famiglie e tutti i documenti allegati saranno immediatamente disponibili senza alcuna riconfigurazione.

---

## 9. Standard delle Stampe Ufficiali (A4 Arial 10pt)

Tutti i moduli di stampa del programma sono stati meticolosamente studiati per rispondere ai requisiti di **sobrietà, canonicità ed economia cartacea**:

| Modulo di Stampa | Orientamento | Finalità Canonica | Firme Previste |
| :--- | :--- | :--- | :--- |
| **Scheda Singola Membro** | A4 Verticale (Portrait) | Fascicolo anagrafico personale del credente | Membro / Pastore |
| **Registro Generale Membri** | A4 Orizzontale (Landscape) | Ruolino storico completo della comunità | Pastore |
| **Registro Membri Effettivi** | A4 Orizzontale (Landscape) | Elenco aventi diritto assembleari (battezzati in acqua) | Pastore |
| **Registro Membri Aderenti** | A4 Orizzontale (Landscape) | Elenco simpatizzanti e catecumeni | Pastore |
| **Registro delle Vedove/i** | A4 Orizzontale (Landscape) | Registro ministeriale per cura diaconale | Pastore |
| **Registro Membri Sostenuti**| A4 Orizzontale (Landscape) | Registro riservato carità e sussidi | Pastore |
| **Ruolino Nuclei Familiari** | A4 Verticale (Portrait) | Elenco famiglie con capofamiglia e recapiti | Pastore |

### Consigli per la Stampa da Browser
Quando si apre l'anteprima di stampa del browser (`Ctrl + P`):
1. **Margini**: Seleziona **Minimi** o **Predefiniti**.
2. **Grafica di sfondo**: Spunta l'opzione **Attiva** (per consentire la stampa di badge e bordi colorati).
3. **Intestazioni e piè di pagina del browser**: Disattiva la casella (per evitare che il browser stampi URL o date automatiche in cima alla pagina).
4. **Salvataggio in PDF**: Per archiviare le stampe in formato elettronico, seleziona semplicemente *«Salva come PDF»* come destinazione di stampa.

---

## 10. Guida alla Risoluzione dei Problemi (Troubleshooting & FAQ)

### D: Il file batch mostra "Porta 3001 occupata" o la pagina non risponde.
**R:** Lo script `Avvia gestionale.bat` contiene già una routine PowerShell che termina automaticamente i processi rimasti in ascolto sulla porta 3001. Se il problema persiste, riavvia il computer oppure esegui nel terminale PowerShell:
```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### D: Come posso modificare il nome della chiesa o il pastore sulle stampe?
**R:** Vai in **⚙️ Impostazioni > Dati della Chiesa**:
- Modifica la denominazione (es. *«Come Tralci Novara»*).
- Modifica il nome del Pastore (es. *«Bruno Astemio»*) o del Tesoriere.
- Clicca su **«Salva Impostazioni»**. Tutte le future stampe rifletteranno immediatamente i nuovi dati.

### D: Come posso cambiare il logo stampato?
**R:** È sufficiente sostituire il file `public/logo.png` con la nuova immagine del logo comunitario (formato PNG trasparente raccomandato, altezza consigliata ~120px).

### D: I file allegati nel fascicolo membro vengono inclusi nel backup JSON?
**R:** Il file `db.json` memorizza i metadati dei documenti (categoria, data, nome file, dimensione). I file binari veri e propri (PDF, immagini) risiedono all'interno della cartella `data/attachments/`. Per un backup completo al 100%, copia sia il file `db.json` sia la cartella `attachments/` (o fai un backup dell'intera cartella `data/`).

### D: Come posso aggiungere una nuova categoria per i documenti allegati?
**R:** Vai in **⚙️ Impostazioni > Tipologie Documenti Fascicolo**:
- Digita il nome della nuova categoria (es. *«Dichiarazione Battesimale Estera»* o *«Consenso Minori»*) e clicca su **«+ Aggiungi Categoria»**.
- Da quel momento la nuova opzione sarà subito selezionabile nel form di caricamento di ogni membro.

---

*Documentazione redatta per la Comunità Cristiana Evangelica «Come Tralci Novara». Per qualsiasi ulteriore informazione o richiesta di personalizzazione, rivolgersi a Bruno Astemio.*
