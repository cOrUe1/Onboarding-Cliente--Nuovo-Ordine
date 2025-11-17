import { GK1 } from "@/lib/constants";

interface CustomerRecord {
  id: string;
  fullName: string;
  phone: string;
  nameDist?: number;
  dist?: number;
}

interface CheckDuplicatePayload {
  firstName: string;
  lastName: string;
  phone: string;
}

interface ResolveExistingPayload {
  firstName: string;
  lastName: string;
  phone?: string;
}

interface CheckDuplicateResponse {
  decision: 'EXACT_SAME' | 'WARN_CONFIRM' | 'OK';
  reason?: 'phone_exact_name_diff' | 'phone_exact' | 'phone_near' | 'name_near' | 'clear';
  record?: CustomerRecord; // Solo per EXACT_SAME
  matches: CustomerRecord[]; // Corrispondenze esatte o vicine
  near: CustomerRecord[]; // Corrispondenze per nome simile
}

interface ResolveExistingResponse {
  found: boolean;
  record?: CustomerRecord; // Solo se trovato
  suggestion?: string; // Messaggio se non trovato
  matches: CustomerRecord[]; // Corrispondenze esatte
  near: CustomerRecord[]; // Telefoni quasi identici
  nameNear: CustomerRecord[]; // Nomi simili
}

interface PrefillUrlPayload {
  firstName: string;
  lastName: string;
  phone: string;
  newCustomer: 'Sì' | 'No';
  customerId?: string;
}

/**
 * Funzione generica per chiamare l'endpoint GAS del Modulo 1.
 */
async function callGatekeeper1Api<T>(action: string, params: Record<string, string | undefined>): Promise<T> {
  if (!GK1.GAS_ENDPOINT_URL || GK1.GAS_ENDPOINT_URL === "INCOLLA_QUI_IL_NUOVO_WEB_APP_URL_COPIATO_DAL_DEPLOYMENT_MODULO1") {
    throw new Error("L'URL dell'endpoint di Google Apps Script per il Modulo 1 non è configurato. Aggiorna src/lib/constants.ts");
  }

  const urlParams = new URLSearchParams({ action });

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      urlParams.append(key, value);
    }
  });

  const response = await fetch(`${GK1.GAS_ENDPOINT_URL}?${urlParams.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const responseData = await response.json();
  if (responseData.error) {
    throw new Error(responseData.error);
  }
  return responseData.data as T;
}

/**
 * Controlla i duplicati per un nuovo cliente.
 */
export const checkDuplicate = async (payload: CheckDuplicatePayload): Promise<CheckDuplicateResponse> => {
  return callGatekeeper1Api<CheckDuplicateResponse>("checkDuplicate", {
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone,
  });
};

/**
 * Risolve un cliente esistente.
 */
export const resolveExisting = async (payload: ResolveExistingPayload): Promise<ResolveExistingResponse> => {
  const params: Record<string, string> = {
    firstName: payload.firstName,
    lastName: payload.lastName,
  };

  if (payload.phone && payload.phone.length >= 3) {
    params.phone = payload.phone;
  }

  return callGatekeeper1Api<ResolveExistingResponse>("resolveExisting", params);
};

/**
 * Genera un URL di Google Form precompilato per il Modulo 1.
 */
export const makePrefillUrlGK1 = async (payload: PrefillUrlPayload): Promise<string> => {
  return callGatekeeper1Api<string>("makePrefillUrl", {
    firstName: payload.firstName,
    lastName: payload.lastName,
    phone: payload.phone,
    newCustomer: payload.newCustomer,
    customerId: payload.customerId || '',
  });
};
