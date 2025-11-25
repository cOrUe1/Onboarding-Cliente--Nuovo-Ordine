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

  const vals = sh.getRange(2, 1, lastRow-1, 6).getValues(); // A..F
  const data = [];

  for (let i=0;i<vals.length;i++){
    const A_id      = String(vals[i][0] || '').trim();
    const C_nome    = String(vals[i][2] || '').trim(); // C è index 2
    const D_cognome = String(vals[i][3] || '').trim(); // D è index 3
    const E_cliente = String(vals[i][4] || '').trim(); // E è index 4
    const F_tel     = vals[i][5];                      // F è index 5

    const fullName  = E_cliente || (C_nome || D_cognome ? (C_nome + ' ' + D_cognome).trim() : '');
    const phones    = gkParsePhones_(F_tel || '');

    if (!A_id && !fullName && (!phones || !phones.length)) continue;

    data.push({
      id: A_id,
      fullName,
      normName: gkNormalizeName_(fullName),
      phones,
      rawPhone: String(F_tel || '').trim()
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

  // Nome simile (<=1) su tutto il dataset
  const nameFuzzy = normIn
    ? rows.map(r=>({ id:r.id, fullName:r.fullName, dist: gkLev_(normIn, r.normName) }))
          .filter(x=>x.dist <= 1)
          .sort((a,b)=>a.dist-b.dist)
    : [];

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

  if (!phoneIn && !normIn){
    throw new Error('Inserisci almeno un nome/cognome o un telefono con 3 cifre.');
  }

  // === Caso con telefono: logica precedente ===
  if (phoneIn){
    const exact = [];
    const near  = [];
    const nameNear = [];

    rows.forEach(r=>{
      (r.phones||[]).forEach(p=>{
        const d = gkPhoneDist_(phoneIn, p);
        if (d === 0){
          const distName = gkLev_(normIn, r.normName);
          exact.push({ id:r.id, fullName:r.fullName, phone:p, distName });
        } else if (d === 1){
          near.push({ id:r.id, fullName:r.fullName, phone:p, dist: d });
        }
      });
      const nd = gkLev_(normIn, r.normName);
      if (normIn && nd <= 1){ nameNear.push({ id:r.id, fullName:r.fullName, dist: nd }); }
    });

    if (exact.length){
      exact.sort((a,b)=>a.distName-b.distName);
      const best = exact[0];
      return { found:true, record:best, matches:exact, near, nameNear };
    }

    near.sort((a,b)=>a.dist-b.dist);
    nameNear.sort((a,b)=>a.dist-b.dist);
    return {
      found:false,
      suggestion:'Numero non presente: inseriscilo come nuovo cliente.',
      matches:[],
      near,
      nameNear
    };
  }

  // === Caso senza telefono: ricerca per nome ===
  const baseRows = rows.filter(r => !/_/.test(r.id || ''));
  const exactNames = [];
  const similarNames = [];

  baseRows.forEach(r=>{
    const d = gkLev_(normIn, r.normName);
    if (d === 0){
      exactNames.push({
        id: r.id,
        fullName: r.fullName,
        phone: gkPrimaryPhone_(r) || '',
        dist: d
      });
    } else if (d === 1){
      similarNames.push({
        id: r.id,
        fullName: r.fullName,
        phone: gkPrimaryPhone_(r) || '',
        dist: d
      });
    }
  });

  if (exactNames.length === 1){
    return {
      found: true,
      record: exactNames[0],
      matches: [],
      near: [],
      nameNear: similarNames
    };
  }

  const combinedSuggestions = exactNames.concat(similarNames).sort((a,b)=>a.dist-b.dist);
  return {
    found: false,
    suggestion: exactNames.length
      ? 'Esistono già clienti con lo stesso nome. Seleziona quello corretto o completa i campi.'
      : (similarNames.length
          ? 'Sono stati trovati nomi simili. Verifica la lista prima di inserire un nuovo cliente.'
          : 'Nessun nominativo affine trovato. Puoi procedere con un nuovo inserimento.'),
    matches: [],
    near: [],
    nameNear: combinedSuggestions
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
