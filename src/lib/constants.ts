export const MX = {
  SPREADSHEET_ID: "1W3-Fu98AXd9NjA8FgdyRl5NMWUHIASyPajkp45_f68I", // Questo ID è solo un esempio, verrà sovrascritto dal nuovo Codice.gs
  SHEET_PIPELINE: "02_Pipeline", // Questo nome è solo un esempio, verrà sovrascritto dal nuovo Codice.gs
  FORM_URL: "https://docs.google.com/forms/d/e/1FAIpQLSdy9JvYkBnBpoTvgZgT4OHyw7qwuONrU9MxIwl39YcJWmhTxg/viewform", // Questo URL è solo un esempio, verrà sovrascritto dal nuovo Codice.gs
  FORM_PREFILL: { orderId: "entry.1858163897", customerName: "entry.495643146" }, // Questi ID sono solo un esempio, verranno sovrascritti dal nuovo Codice.gs
  CACHE_SECONDS: 60,
  GAS_ENDPOINT_URL: "INCOLLA_QUI_IL_NUOVO_WEB_APP_URL_COPIATO_DAL_DEPLOYMENT", // <--- INCOLLA QUI IL NUOVO URL DEL TUO NUOVO DEPLOYMENT
};

// Costanti specifiche per il Modulo 1 (Inserimento nuovo cliente o ordine)
export const GK1 = {
  SPREADSHEET_ID: '1W3-Fu98AXd9NjA8FgdyRl5NMWUHIASyPajkp45_f68I', // <— il tuo ID file Sheets per Modulo 1
  FORM_URL: 'https://docs.google.com/forms/d/e/1FAIpQLSffV4w0GwFnDg_YzdWSpDV_XtZ_dIIfdgGn7Gh2fJtnjPGeSg/viewform', // URL del Form per Modulo 1
  SHEET_PIPELINE: '02_Pipeline', // Nome del foglio per Modulo 1
  FORM_PREFILL: {
    firstName:  'entry.2043584573',
    lastName:   'entry.252075690',
    phone:      'entry.1449005772',
    newCustomer:'entry.1264387969', // ID campo "Nuovo cliente?"
    customerId: 'entry.1434715647'  // ID campo "ID Cliente"
  },
  GAS_ENDPOINT_URL: "https://script.google.com/macros/s/AKfycbz_J0STeS34Is07Q2ewS0HgE5Gw1PgsrTCCxQ44I96cTlVo8wOjdXiGVAUIhzY8hoZo/exec", // <--- INCOLLA QUI IL NUOVO URL DEL TUO NUOVO DEPLOYMENT PER MODULO 1
  CACHE_SECONDS: 60,
};
