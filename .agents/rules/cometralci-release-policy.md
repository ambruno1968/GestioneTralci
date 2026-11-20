---
trigger: always_on
description: Regola di versionamento standard e pubblicazione su richiesta esplicita per l'ecosistema ComeTralci (GestioneTralci, MemoTralci, TralcidiNote).
---

# Regole di Pubblicazione e Versionamento – Ecosistema ComeTralci

Queste regole si applicano a tutti i progetti dell'ecosistema **ComeTralci** (`GestioneTralci`, `MemoTralci`, `TralcidiNote`).

## 1. Pubblicazione solo su richiesta esplicita
- **NON pubblicare mai automaticamente** (`git push`, deploy su GitHub Pages, pubblicazione di build o distribuzioni) al termine di una modifica.
- La pubblicazione della distribuzione deve avvenire **esclusivamente su richiesta esplicita dell'utente** (es. *"pubblica"*, *"rilascia"*, *"pusha"*).
- In assenza di richiesta esplicita, limitarsi a modificare i sorgenti, verificare/compilare in locale e attendere istruzioni.

## 2. Aggiornamento obbligatorio della versione per ogni pubblicazione
Ogni volta che viene richiesta la pubblicazione di una nuova distribuzione, **prima di compilare e pubblicare**, è obbligatorio aggiornare in modo coerente la versione secondo lo standard **Semantic Versioning (`MAJOR.MINOR.PATCH`)**:
- **`PATCH`** (`x.y.Z`): correzioni di bug, fix minori o aggiornamenti di configurazione/asset.
- **`MINOR`** (`x.Y.0`): nuove funzionalità retrocompatibili o miglioramenti significativi.
- **`MAJOR`** (`X.0.0`): modifiche architetturali importanti o incompatibili.

### Checklist di allineamento versione prima della build/pubblicazione
1. **File di progetto e configurazione**: aggiornare la versione in `package.json` (se presente) e nei file di configurazione versione (es. `src/config/version.ts` in MemoTralci).
2. **Interfaccia utente (UI)**: aggiornare tutti i badge/etichette di versione visibili (es. header, footer, modali About/Info, sezione Wiki in `index.html` / `app.js`).
3. **Cache PWA e Service Worker**: incrementare il nome della cache in `sw.js` e i parametri `?v=...` degli asset in `index.html` (se presenti) per forzare l'aggiornamento sui dispositivi installati.
4. **Documentazione**: aggiornare la versione in `README.md` e `WIKI.md` (se presente).
5. **Build di distribuzione**: eseguire lo script di build del progetto (es. `npm run build`) in modo che `/docs` (o `/dist`) contenga gli artefatti aggiornati alla nuova versione prima di eseguire il commit e il push.
