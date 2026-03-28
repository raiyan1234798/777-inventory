/**
 * Exchange Rate Management System
 * Provides methods to manage, update, and retrieve exchange rates
 * Rates are stored in Firebase and cached locally
 */

import { db } from './firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';

export interface ExchangeRateRecord {
  id: string;
  currency: string;
  rate: number; // INR per unit of this currency
  lastUpdated: string;
  source?: string; // e.g., "ECB", "OpenExchangeRates", "Manual", "CBR"
}

/**
 * Default exchange rates (fallback values)
 * These are approximate and should be updated regularly
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  INR: 1,
  USD: 83.5,
  EUR: 90.2,
  GBP: 105.8,
  CNY: 11.5,
  PKR: 0.30,
  SAR: 22.2,
  AED: 22.7,
  JPY: 0.55,
  CAD: 61.5,
  AUD: 54.8,
  SGD: 61.9,
  KWD: 271.5,
  OMR: 216.8,
  BHD: 221.4,
  QAR: 22.9,
  MYR: 17.6,
  THB: 2.3,
};

class ExchangeRateManager {
  private cache: Map<string, ExchangeRateRecord> = new Map();
  private lastFetch: number = 0;
  private cacheDuration: number = 3600000; // 1 hour in milliseconds

  /**
   * Initialize the exchange rate manager by loading rates from Firebase
   */
  async initialize(): Promise<void> {
    try {
      const snap = await getDocs(collection(db, 'exchange_rates'));
      snap.forEach(doc => {
        const data = doc.data() as ExchangeRateRecord;
        this.cache.set(data.currency, data);
      });
      this.lastFetch = Date.now();
    } catch (error) {
      console.warn('Failed to load exchange rates from Firebase, using defaults:', error);
      // Fallback to defaults - cache will be populated from defaults
      Object.entries(DEFAULT_EXCHANGE_RATES).forEach(([currency, rate]) => {
        this.cache.set(currency, {
          id: currency,
          currency,
          rate,
          lastUpdated: new Date().toISOString(),
          source: 'Default'
        });
      });
    }
  }

  /**
   * Get the exchange rate for a specific currency
   * Returns INR per unit of the given currency
   */
  getRate(currency: string): number {
    const record = this.cache.get(currency);
    if (record) {
      return record.rate;
    }
    // Fallback to defaults
    return DEFAULT_EXCHANGE_RATES[currency] ?? 1;
  }

  /**
   * Get all cached exchange rates
   */
  getAllRates(): Record<string, number> {
    const rates: Record<string, number> = {};
    this.cache.forEach((record, currency) => {
      rates[currency] = record.rate;
    });
    return rates;
  }

  /**
   * Update a single exchange rate in Firebase and cache
   */
  async updateRate(currency: string, rate: number, source: string = 'Manual'): Promise<void> {
    const record: ExchangeRateRecord = {
      id: currency,
      currency,
      rate,
      lastUpdated: new Date().toISOString(),
      source
    };
    
    try {
      await setDoc(doc(db, 'exchange_rates', currency), record);
      this.cache.set(currency, record);
    } catch (error) {
      console.error(`Failed to update exchange rate for ${currency}:`, error);
      throw new Error(`Failed to update exchange rate for ${currency}`);
    }
  }

  /**
   * Update multiple exchange rates at once
   */
  async updateMultipleRates(rates: Record<string, number>, source: string = 'Manual'): Promise<void> {
    const updates = Object.entries(rates).map(([currency, rate]) =>
      this.updateRate(currency, rate, source)
    );
    
    try {
      await Promise.all(updates);
    } catch (error) {
      console.error('Failed to update multiple exchange rates:', error);
      throw new Error('Failed to update exchange rates');
    }
  }

  /**
   * Check if cache needs refresh (older than 1 hour)
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastFetch > this.cacheDuration;
  }

  /**
   * Refresh rates from Firebase
   */
  async refresh(): Promise<void> {
    if (!this.needsRefresh()) return;
    await this.initialize();
  }

  /**
   * Get rate record with metadata
   */
  getRateRecord(currency: string): ExchangeRateRecord | null {
    return this.cache.get(currency) ?? null;
  }

  /**
   * Get all rate records with metadata
   */
  getAllRateRecords(): ExchangeRateRecord[] {
    return Array.from(this.cache.values());
  }
}

// Export singleton instance
export const exchangeRateManager = new ExchangeRateManager();

/**
 * Utility function to convert amount to INR
 * Uses the exchange rate manager
 */
export function toINR(amount: number, currency: string): number {
  return amount * exchangeRateManager.getRate(currency);
}

/**
 * Utility function to convert amount from INR to another currency
 */
export function fromINR(amountINR: number, currency: string): number {
  const rate = exchangeRateManager.getRate(currency);
  return rate > 0 ? amountINR / rate : 0;
}

/**
 * Utility function to convert between two currencies
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount;
  
  const amountINR = toINR(amount, fromCurrency);
  return fromINR(amountINR, toCurrency);
}
