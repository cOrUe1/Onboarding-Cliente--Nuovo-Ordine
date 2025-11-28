/** ********************************************
 * Gatekeeper Modulo 1 — Nuovo/Esistente + Duplicati (GK_)
 * Schema pipeline: A=ID, C=Nome, D=Cognome, E=Cliente (Nome Cognome), F=Telefono
 * "Sì" (nuovo): avvisi su telefono/nome (mai BLOCK) + conferma.
 * "No" (esistente): risale ID per telefono identico, prefilla ID nel Form.
 ********************************************* */

// ===== CONFIG =====
var GK = (typeof GK !== 'undefined' && GK) || {
  SPREADSHEET_ID: '1W3-Fu98AXd9NjA8FgdyRl5NMWUHIASyPajkp45_f68I', // <— il tuo ID file Sheets

  // Link pubblico del Form (intervistato)
  FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSffV4w0GwFnDg_YzdWSpDV_XtZ_dIIfdgGn7Gh2fJtnjPGeSg/viewform?usp=dialog',

  SHEET_PIPELINE: '02_Pipeline',

  // Prefill: metti gli entry.* del tuo Form
  FORM_PREFILL: {
    firstName:  'entry.2043584573', // già in uso
    lastName:   'entry.252075690',  // già in uso
    phone:      'entry.1449005772', // già in uso
    newCustomer:'entry.1264387969', // <-- Sostituisci con entry.* della domanda "Nuovo cliente?"
    customerId: 'entry.1434715647'  // <-- Sostituisci con entry.* della domanda "ID Cliente"
  }
};

// ===== Utilities =====
function gkNormalizeName_(s){
  if (!s) return '';
  return s.toString()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accenti
    .replace(/[^a-z\s]/g, '')                        // solo lettere/spazi
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '');
}
function gkCanonicalPhone_(s){
  if (!s) return '';
  let d = s.toString().replace(/\D/g, '');
  if (d.startsWith('0039')) d = d.slice(4);
  else if (d.startsWith('39')) d = d.slice(2);
  return d;
}
function gkParsePhones_(s){
  if (!s) return [];
  const digits = s.toString().replace(/[^\d]/g, ' ').trim();
  if (!digits) return [];
  const parts = digits.split(/\s+/).filter(x => x.length >= 7);
  const out = new Set(parts.map(gkCanonicalPhone_));
  return Array.from(out).filter(x => x.length >= 7);
}
function gkPrimaryPhone_(row){
  if (!row) return '';
  if (row.phones && row.phones.length) return row.phones[0];
  return row.rawPhone || '';
}
// Levenshtein (stringhe brevi)
function gkLev_(a, b){
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({length:m+1}, (_,i)=>Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i;
  for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++){
    for (let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}
function gkPhoneDist_(a, b){
  if (!a || !b) return Math.max((a||'').length, (b||'').length);
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i)=>Array(n+1).fill(0));
  for (let i=0;i<=m;i++) dp[i][0]=i;
  for (let j=0;j<=n;j++) dp[0][j]=j;
  for (let i=1;i<=m;i++){
    for (let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

// Helper: calcola distanza di matching elastica (considera substring, prefix, Levenshtein)
function gkFuzzyScore_(query, target){
  if (!query || !target) return { dist: 999, type: 'none' };
  
  query = query.toLowerCase();
  target = target.toLowerCase();
  
  // Match esatto
  if (query === target) return { dist: 0, type: 'exact' };
  
  // Match che inizia con query (prefix)
  if (target.indexOf(query) === 0) return { dist: 0.5, type: 'prefix' };
  
  // Match che contiene query (substring)
  if (target.indexOf(query) >= 0) return { dist: 1, type: 'contains' };
  
  // Levenshtein distance
  const levDist = gkLev_(query, target);
  const maxLen = Math.max(query.length, target.length);
  
  // Normalizza la distanza in base alla lunghezza
  const normalizedDist = maxLen > 0 ? levDist / maxLen : levDist;
  
  // Per query corte, accetta match più distanti
  const threshold = query.length <= 3 ? 0.7 : (query.length <= 5 ? 0.5 : 0.3);
  
  if (normalizedDist <= threshold) {
    return { dist: 1 + levDist, type: 'similar' };
  }
  
  return { dist: 999, type: 'none' };
}

// ===== Data access =====
function gkOpenSS_(){ return SpreadsheetApp.openById(GK.SPREADSHEET_ID); }

/**
 * Legge A..F in UN colpo:
 * A=ID, C=Nome, D=Cognome, E=Cliente (Nome+Congome), F=Telefono
 */
function gkReadPipeline_(){
  const ss = gkOpenSS_();
  const sh = ss.getSheetByName(GK.SHEET_PIPELINE);
  if (!sh) throw new Error('Sheet non trovata: ' + GK.SHEET_PIPELINE);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  // Legge A..K (11 colonne) per avere anche J (descrizione ambienti) e K (nome elemento singolo)
  const vals = sh.getRange(2, 1, lastRow-1, 11).getValues(); // A..K
  const data = [];

  for (let i=0;i<vals.length;i++){
    const A_id      = String(vals[i][0] || '').trim();
    const C_nome    = String(vals[i][2] || '').trim(); // C è index 2
    const D_cognome = String(vals[i][3] || '').trim(); // D è index 3
    const E_cliente = String(vals[i][4] || '').trim(); // E è index 4
    const F_tel     = vals[i][5];                      // F è index 5
    const J_ambienti= String(vals[i][9] || '').trim(); // J è index 9
    const K_elemento= String(vals[i][10]|| '').trim(); // K è index 10

    const fullName  = E_cliente || (C_nome || D_cognome ? (C_nome + ' ' + D_cognome).trim() : '');
    const phones    = gkParsePhones_(F_tel || '');

    if (!A_id && !fullName && (!phones || !phones.length)) continue;

    data.push({
      id: A_id,
      fullName,
      normName: gkNormalizeName_(fullName),
      normFirst: gkNormalizeName_(C_nome),
      normLast: gkNormalizeName_(D_cognome),
      phones,
      rawPhone: String(F_tel || '').trim(),
      orderAreasRaw: J_ambienti,
      singleItemName: K_elemento
    });
  }
  return data;
}

// ===== Server APIs =====

// "Sì" — nuovo cliente: ora gestisce anche il caso EXACT_SAME (nome+cognome+telefono identici)
function gkCheckDuplicateServer(payload){
  const firstName = (payload.firstName||'').trim();
  const lastName  = (payload.lastName ||'').trim();
  const phoneIn   = gkCanonicalPhone_(payload.phone||'');
  const normFirstIn = gkNormalizeName_(firstName);
  const normLastIn  = gkNormalizeName_(lastName);
  const normIn    = gkNormalizeName_([firstName,lastName].join(' '));

  const rows = gkReadPipeline_();

  const phoneExact = [];
  const phoneNear  = [];
  let   exactSame  = null;  // record con nome identico (norm) + telefono identico
  let   phoneExactMinNameDist = null;

  if (phoneIn){
    rows.forEach(r=>{
      (r.phones||[]).forEach(p=>{
        const d = gkPhoneDist_(phoneIn, p);
        if (d === 0){
          const nameDist = gkLev_(normIn, r.normName);
          const rec = {id:r.id, fullName:r.fullName, phone:p, nameDist};
          phoneExact.push(rec);
          if (nameDist === 0 && !exactSame) exactSame = rec;
          if (phoneExactMinNameDist === null || nameDist < phoneExactMinNameDist){
            phoneExactMinNameDist = nameDist;
          }
        } else if (d === 1){
          phoneNear.push({id:r.id, fullName:r.fullName, phone:p, dist:d});
        }
      });
    });
  }

  // Nome simile (fuzzy) su tutto il dataset: avvisa SOLO se coincidono sia Nome sia Cognome
  const nameFuzzy = [];
  if (normFirstIn && normFirstIn.length >= 1 && normLastIn && normLastIn.length >= 1){
    rows.forEach(r=>{
      const scoreFirst = gkFuzzyScore_(normFirstIn, r.normFirst || '');
      const scoreLast  = gkFuzzyScore_(normLastIn,  r.normLast  || '');
      const okFirst = (scoreFirst.type !== 'none') && (scoreFirst.dist < 10);
      const okLast  = (scoreLast.type  !== 'none') && (scoreLast.dist  < 10);
      if (okFirst && okLast){
        // Usa la peggiore tra le due per ordinare (più conservativo)
        const combinedDist = Math.max(scoreFirst.dist, scoreLast.dist);
        const combinedType = (scoreFirst.type === 'exact' && scoreLast.type === 'exact') ? 'exact' :
                             (scoreFirst.type === 'prefix' && scoreLast.type === 'prefix') ? 'prefix' :
                             (scoreFirst.type === 'contains' && scoreLast.type === 'contains') ? 'contains' : 'similar';
        nameFuzzy.push({ 
          id:r.id, 
          fullName:r.fullName, 
          dist: combinedDist,
          scoreType: combinedType
        });
      }
    });
    // Ordina per rilevanza
    const typeOrder = { 'exact': 0, 'prefix': 1, 'contains': 2, 'similar': 3, 'none': 999 };
    nameFuzzy.sort((a, b) => {
      const typeDiff = (typeOrder[a.scoreType] || 999) - (typeOrder[b.scoreType] || 999);
      if (typeDiff !== 0) return typeDiff;
      return a.dist - b.dist;
    });
  }

  // 1) Tutto identico (nome+cognome+telefono)
  if (exactSame){
    return {
      decision: 'EXACT_SAME',
      record: exactSame,           // {id, fullName, phone, nameDist:0}
      matches: phoneExact,         // tutti i “phone identical”
      near: nameFuzzy
    };
  }

  // 2) Telefono identico ma nome diverso ⇒ avviso mirato
  if (phoneExact.length > 0){
    return {
      decision: 'WARN_CONFIRM',
      reason: (phoneExactMinNameDist && phoneExactMinNameDist > 0) ? 'phone_exact_name_diff' : 'phone_exact',
      matches: phoneExact,
      near: nameFuzzy
    };
  }

  // 3) Telefono quasi identico
  if (phoneNear.length > 0){
    return { decision:'WARN_CONFIRM', reason:'phone_near', matches:phoneNear, near:nameFuzzy };
  }

  // 4) Nome simile
  if (nameFuzzy.length > 0){
    return { decision:'WARN_CONFIRM', reason:'name_near', matches:[], near:nameFuzzy };
  }

  // 5) Tutto pulito
  return { decision:'OK', reason:'clear', matches:[], near:[] };
}

// "No" — cliente esistente: ritorna suggerimenti se il numero non è trovato
function gkResolveExistingServer(payload){
  const firstName = (payload.firstName||'').trim();
  const lastName  = (payload.lastName ||'').trim();
  const phoneIn   = gkCanonicalPhone_(payload.phone||'');
  const normIn    = gkNormalizeName_([firstName,lastName].join(' '));
  const rows      = gkReadPipeline_();

  // Ricerca elastica: accetta anche input minimi (1 carattere/numero)
  if (!phoneIn && !normIn && firstName.length === 0 && lastName.length === 0){
    throw new Error('Inserisci almeno un carattere in uno dei campi per effettuare la ricerca.');
  }

  // === Caso con telefono: ricerca elastica ===
  if (phoneIn && phoneIn.length >= 1){
    const exact = [];
    const near  = [];
    const nameNear = [];

    rows.forEach(r=>{
      let bestPhoneMatch = null;
      let bestPhoneScore = 999;
      
      // Cerca il miglior match telefonico
      (r.phones||[]).forEach(p=>{
        // Match esatto
        if (p.indexOf(phoneIn) === 0 || p === phoneIn){
          const score = p === phoneIn ? 0 : 0.5;
          if (score < bestPhoneScore){
            bestPhoneScore = score;
            bestPhoneMatch = p;
          }
        } else {
          // Match parziale (contiene)
          if (p.indexOf(phoneIn) >= 0){
            const score = 1;
            if (score < bestPhoneScore){
              bestPhoneScore = score;
              bestPhoneMatch = p;
            }
          } else {
            // Levenshtein distance per telefoni
            const d = gkPhoneDist_(phoneIn, p);
            if (d <= 2 && d < bestPhoneScore){
              bestPhoneScore = d + 1;
              bestPhoneMatch = p;
            }
          }
        }
      });
      
      // Se abbiamo un match telefonico
      if (bestPhoneMatch && bestPhoneScore < 3){
        const nameScore = normIn ? gkFuzzyScore_(normIn, r.normName) : { dist: 999, type: 'none' };
        
        if (bestPhoneScore === 0 || bestPhoneScore === 0.5){
          exact.push({ 
            id:r.id, 
            fullName:r.fullName, 
            phone:bestPhoneMatch, 
            distName: nameScore.dist,
            nameScore: nameScore.type
          });
        } else {
          near.push({ 
            id:r.id, 
            fullName:r.fullName, 
            phone:bestPhoneMatch, 
            dist: bestPhoneScore 
          });
        }
      }
      
      // Aggiungi match per nome anche senza telefono
      if (normIn && normIn.length >= 1){
        const nameScore = gkFuzzyScore_(normIn, r.normName);
        if (nameScore.dist < 10){
          nameNear.push({ 
            id:r.id, 
            fullName:r.fullName, 
            phone: gkPrimaryPhone_(r) || '',
            dist: nameScore.dist,
            scoreType: nameScore.type
          });
        }
      }
    });

    // Rimuovi duplicati da nameNear
    const nameNearMap = new Map();
    nameNear.forEach(item => {
      if (!nameNearMap.has(item.id) || nameNearMap.get(item.id).dist > item.dist){
        nameNearMap.set(item.id, item);
      }
    });
    const nameNearUnique = Array.from(nameNearMap.values());

    if (exact.length){
      exact.sort((a,b)=>{
        if (a.distName !== b.distName) return a.distName - b.distName;
        return a.nameScore === 'exact' ? -1 : (b.nameScore === 'exact' ? 1 : 0);
      });
      const best = exact[0];
      nameNearUnique.sort((a,b)=>a.dist-b.dist);
      return { found:true, record:best, matches:exact, near, nameNear:nameNearUnique.slice(0, 20) };
    }

    near.sort((a,b)=>a.dist-b.dist);
    nameNearUnique.sort((a,b)=>a.dist-b.dist);
    
    // Limita i risultati per performance
    const maxResults = 50;
    return {
      found:false,
      suggestion: near.length > 0 
        ? 'Numero non esattamente presente ma trovati numeri simili. Verifica la lista.'
        : (nameNearUnique.length > 0 
            ? 'Numero non presente. Trovati clienti con nomi simili.'
            : 'Numero non presente: inseriscilo come nuovo cliente.'),
      matches:[],
      near: near.slice(0, maxResults),
      nameNear: nameNearUnique.slice(0, maxResults)
    };
  }

  // === Caso senza telefono: ricerca per nome elastica ===
  const baseRows = rows.filter(r => !/_/.test(r.id || ''));
  const results = [];

  // Se abbiamo un nome normalizzato, cerca
  if (normIn && normIn.length >= 1){
    baseRows.forEach(r=>{
      const score = gkFuzzyScore_(normIn, r.normName);
      if (score.dist < 10){
        results.push({
          id: r.id,
          fullName: r.fullName,
          phone: gkPrimaryPhone_(r) || '',
          dist: score.dist,
          scoreType: score.type
        });
      }
    });
  } else if (firstName.length >= 1 || lastName.length >= 1){
    // Ricerca separata per nome e cognome se normIn è vuoto
    const searchTerm = firstName.length >= 1 ? firstName.toLowerCase() : lastName.toLowerCase();
    
    baseRows.forEach(r=>{
      const fullNameLower = r.fullName.toLowerCase();
      const score = gkFuzzyScore_(searchTerm, fullNameLower);
      
      if (score.dist < 10){
        results.push({
          id: r.id,
          fullName: r.fullName,
          phone: gkPrimaryPhone_(r) || '',
          dist: score.dist,
          scoreType: score.type
        });
      }
    });
  }

  // Rimuovi duplicati
  const resultsMap = new Map();
  results.forEach(item => {
    if (!resultsMap.has(item.id) || resultsMap.get(item.id).dist > item.dist){
      resultsMap.set(item.id, item);
    }
  });
  const uniqueResults = Array.from(resultsMap.values());

  // Ordina per rilevanza (exact > prefix > contains > similar)
  const typeOrder = { 'exact': 0, 'prefix': 1, 'contains': 2, 'similar': 3, 'none': 999 };
  uniqueResults.sort((a, b) => {
    const typeDiff = (typeOrder[a.scoreType] || 999) - (typeOrder[b.scoreType] || 999);
    if (typeDiff !== 0) return typeDiff;
    return a.dist - b.dist;
  });

  // Separa exact e similar per retrocompatibilità
  const exactNames = uniqueResults.filter(r => r.scoreType === 'exact');
  const similarNames = uniqueResults.filter(r => r.scoreType !== 'exact');

  // Limita i risultati per performance
  const maxResults = 50;
  const limitedResults = uniqueResults.slice(0, maxResults);

  if (exactNames.length === 1 && similarNames.length === 0){
    return {
      found: true,
      record: exactNames[0],
      matches: [],
      near: [],
      nameNear: []
    };
  }

  return {
    found: false,
    suggestion: exactNames.length > 0
      ? 'Esistono già clienti con lo stesso nome. Seleziona quello corretto o completa i campi.'
      : (similarNames.length > 0
          ? 'Sono stati trovati nomi simili. Verifica la lista prima di inserire un nuovo cliente.'
          : 'Nessun nominativo affine trovato. Puoi procedere con un nuovo inserimento.'),
    matches: [],
    near: [],
    nameNear: limitedResults
  };
}


// Prefill URL (accetta anche campi opzionali)
function gkMakePrefillUrl(payload){
  var base = (GK.FORM_URL && GK.FORM_URL.trim())
           ? GK.FORM_URL.trim()
           : ('https://docs.google.com/forms/d/' + (GK.FORM_ID||'') + '/viewform');

  var kv = [];
  function add(k, v){ if (k && v !== undefined && v !== null && String(v).length) kv.push(encodeURIComponent(k) + '=' + encodeURIComponent(v)); }

  add(GK.FORM_PREFILL.firstName,  payload.firstName || '');
  add(GK.FORM_PREFILL.lastName,   payload.lastName  || '');
  add(GK.FORM_PREFILL.phone,      payload.phone     || '');
  add(GK.FORM_PREFILL.newCustomer,payload.newCustomer || ''); // 'Sì'/'No' (testo opzione)
  add(GK.FORM_PREFILL.customerId, payload.customerId || ''); // ID Cliente (A)

  var sep = base.indexOf('?') >= 0 ? '&' : '?';
  return base + (kv.length ? (sep + kv.join('&')) : '');
}

// Recupero ordini per un cliente (customerKey = ID base senza suffisso)
function gkGetOrdersServer(payload){
  const base = (payload && payload.customerKey || '').toString().trim();
  if (!base) {
    return [];
  }
  const rows = gkReadPipeline_();
  // Considera ordini con ID uguale al base o con suffisso _NN
  const re = new RegExp('^' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:_\\d+)?$');
  const orders = rows
    .filter(r => r && r.id && re.test(String(r.id)))
    .map(r => {
      // Costruisci il "nome ordine" partendo dalla colonna J.
      // Se J contiene "Elemento singolo", sostituisci quel token con K.
      const raw = (r.orderAreasRaw || '').toString();
      const kVal = (r.singleItemName || '').toString().trim();
      let parts = raw
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const idx = parts.findIndex(p => p.toLowerCase() === 'elemento singolo');
      if (idx >= 0) {
        if (kVal) {
          parts[idx] = kVal; // sostituisci con il contenuto di K
        } else {
          // se K è vuoto, rimuovi "Elemento singolo"
          parts.splice(idx, 1);
        }
      }

      const orderName = parts.length ? parts.join(', ') : '';
      const title = (r.fullName ? (r.fullName + (orderName ? ' — ' : '')) : '') + orderName;
      return { id: String(r.id), title };
    });
  return orders;
}

// ===== Web App UI =====
function doGet(e){
  const action = e && e.parameter && e.parameter.action;

  if (action){
    try{
      let data;
      if (action === 'checkDuplicate'){
        data = gkCheckDuplicateServer(e.parameter || {});
      } else if (action === 'resolveExisting'){
        data = gkResolveExistingServer(e.parameter || {});
      } else if (action === 'makePrefillUrl'){
        data = gkMakePrefillUrl(e.parameter || {});
      } else if (action === 'getOrders'){
        data = gkGetOrdersServer(e.parameter || {});
      } else {
        throw new Error('Azione non supportata: ' + action);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ data }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err){
      return ContentService
        .createTextOutput(JSON.stringify({ error: err && err.message ? err.message : String(err) }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  return HtmlService.createTemplateFromFile('Gatekeeper')
    .evaluate()
    .setTitle('Inserimento clienti')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function gkInclude_(fn){
  return HtmlService.createHtmlOutputFromFile(fn).getContent();
}

// ===== Log minimale (opzionale) =====
function gkLog_(level, action, note){
  try{
    const ss = gkOpenSS_();
    let sh = ss.getSheetByName('_log');
    if (!sh) sh = ss.insertSheet('_log');
    sh.appendRow([new Date(), level, action, note]);
  } catch(e){}
}
