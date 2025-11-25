import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Calcola la distanza di Levenshtein tra due stringhe.
 * Utilizzata per il matching "severo" di nomi/cognomi.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein_(a: string, b: string): number {
  a = a || '';
  b = b || '';
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * Normalizza un nome o cognome: mantiene spazi tra parole, rimuove caratteri non validi e capitalizza ogni parola.
 * @param {string} name - Il nome o cognome da normalizzare
 * @returns {string} - Il nome normalizzato (ogni parola con prima lettera maiuscola, resto minuscolo)
 */
export function normalizeName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  // Rimuove caratteri non validi (mantiene lettere, spazi e caratteri accentati)
  // Sostituisce spazi multipli con un singolo spazio
  let cleaned = name
    .replace(/[^a-zA-ZÀ-ÿ\s]/g, '') // Rimuove tutto tranne lettere e spazi
    .replace(/\s+/g, ' ') // Sostituisce spazi multipli con uno solo
    .trim(); // Rimuove spazi iniziali e finali
  
  if (cleaned.length === 0) return '';
  
  // Capitalizza la prima lettera di ogni parola
  return cleaned
    .split(' ')
    .map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter(word => word.length > 0) // Rimuove parole vuote (dovute a spazi multipli già gestiti)
    .join(' ');
}

/**
 * Normalizza un numero di telefono: rimuove tutti i caratteri non numerici.
 * @param {string} phone - Il numero di telefono da normalizzare
 * @returns {string} - Il numero normalizzato (solo cifre)
 */
export function normalizePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  
  // Rimuove tutti i caratteri che non sono numeri
  return phone.replace(/\D/g, '');
}
