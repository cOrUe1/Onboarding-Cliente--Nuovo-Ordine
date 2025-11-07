import { MX } from "@/lib/constants";

/**
 * Cerca clienti tramite l'endpoint Google Apps Script.
 * @param query - Oggetto contenente firstName, lastName e/o phone.
 * @returns Una promise che risolve in un array di oggetti cliente.
 */
export const searchCustomers = async (query: { firstName?: string; lastName?: string; phone?: string }) => {
  const params = new URLSearchParams({
    action: "searchCustomers",
    ...query,
  });
  const response = await fetch(`${MX.GAS_ENDPOINT_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const responseData = await response.json(); // Ottieni l'intero oggetto di risposta
  if (responseData.error) {
    throw new Error(responseData.error);
  }
  // Estrai i dati effettivi dal campo 'data' dell'oggetto di risposta
  return responseData.data;
};

/**
 * Recupera gli ordini per una data chiave cliente tramite l'endpoint Google Apps Script.
 * @param customerKey - La chiave unica per il cliente.
 * @returns Una promise che risolve in un array di oggetti ordine.
 */
export const getOrders = async (customerKey: string) => {
  const params = new URLSearchParams({
    action: "getOrders",
    customerKey: customerKey,
  });
  const response = await fetch(`${MX.GAS_ENDPOINT_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const responseData = await response.json(); // Ottieni l'intero oggetto di risposta
  if (responseData.error) {
    throw new Error(responseData.error);
  }
  // Estrai i dati effettivi dal campo 'data' dell'oggetto di risposta
  return responseData.data;
};

/**
 * Genera un URL di Google Form precompilato tramite l'endpoint Google Apps Script.
 * @param data - Oggetto contenente orderId e customerName.
 * @returns Una promise che risolve nell'URL del modulo precompilato.
 */
export const makePrefillUrl = async (data: { orderId: string; customerName: string }) => {
  const params = new URLSearchParams({
    action: "makePrefillUrl",
    orderId: data.orderId,
    customerName: data.customerName,
  });
  const response = await fetch(`${MX.GAS_ENDPOINT_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const responseData = await response.json(); // Ottieni l'intero oggetto di risposta
  if (responseData.error) {
    throw new Error(responseData.error);
  }
  // Estrai l'URL effettivo dal campo 'data' dell'oggetto di risposta
  return responseData.data;
};
