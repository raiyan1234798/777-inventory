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
  rate: number; // Units of this currency per 1 USD
  lastUpdated: string;
  source?: string; // e.g., "ECB", "OpenExchangeRates", "Manual", "CBR"
}

/**
 * Default exchange rates (fallback values)
 * These are approximate and should be updated regularly
 */
export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
  USD: 1,
  ZMW: 26.5,    // Zambian Kwacha
  INR: 83.5,
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
   * Returns units of this currency per 1 USD
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
export function toUSD(amount: number, currency: string): number {
  const rate = exchangeRateManager.getRate(currency);
  return rate > 0 ? amount / rate : amount;
}

/**
 * Utility function to convert amount from USD to another currency
 */
export function fromUSD(amountUSD: number, currency: string): number {
  const rate = exchangeRateManager.getRate(currency);
  return amountUSD * rate;
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
  
  const amountUSD = toUSD(amount, fromCurrency);
  return fromUSD(amountUSD, toCurrency);
}

// Export the manager class for admin use
export { ExchangeRateManager };
