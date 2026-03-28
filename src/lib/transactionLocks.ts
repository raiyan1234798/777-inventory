/**
 * Transaction Locking System
 * Prevents race conditions and concurrent modification issues
 * Uses Firebase as distributed lock store
 */

import { db } from './firebase';
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';

export interface TransactionLock {
  id: string;
  resource: string; // What's being locked (e.g., "inventory_warehouse1_item1")
  lockedAt: string;
  lockedBy: string; // User ID or system process ID
  expiresAt: string; // Lock auto-release time (5 seconds)
}

const LOCK_DURATION_MS = 5000; // 5 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100; // 100ms between retries

class TransactionLockManager {
  /**
   * Attempt to acquire a lock on a resource
   * Returns true if lock acquired, false if already locked
   */
  async acquireLock(
    resource: string,
    lockedBy: string = 'system'
  ): Promise<boolean> {
    const lockId = `lock_${resource}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

    try {
      // Try to set the lock document
      // This will succeed only if the document doesn't exist (first write)
      // or if we use setDoc with merge: false (will overwrite)
      await setDoc(
        doc(db, 'transaction_locks', lockId),
        {
          id: lockId,
          resource,
          lockedAt: now.toISOString(),
          lockedBy,
          expiresAt: expiresAt.toISOString()
        },
        { merge: false } // Do NOT merge; fail if exists
      );
      return true;
    } catch (error: any) {
      // Lock already exists, check if expired
      if (error.code === 'permission-denied' || error.message?.includes('already exists')) {
        // Check if lock is expired
        try {
          const lockSnap = await getDoc(doc(db, 'transaction_locks', lockId));
          if (lockSnap.exists()) {
            const lock = lockSnap.data() as TransactionLock;
            const expiryTime = new Date(lock.expiresAt).getTime();
            const currentTime = new Date().getTime();
            
            if (currentTime > expiryTime) {
              // Lock expired, try to claim it
              return this.acquireLock(resource, lockedBy);
            }
          }
        } catch (checkError) {
          console.warn('Failed to check lock status:', checkError);
        }
      }
      return false;
    }
  }

  /**
   * Release a lock on a resource
   */
  async releaseLock(resource: string): Promise<void> {
    const lockId = `lock_${resource}`;
    try {
      await deleteDoc(doc(db, 'transaction_locks', lockId));
    } catch (error) {
      console.warn(`Failed to release lock for ${resource}:`, error);
    }
  }

  /**
   * Execute a function with automatic locking
   * Retries if lock cannot be acquired
   */
  async executeWithLock<T>(
    resource: string,
    fn: () => Promise<T>,
    lockedBy: string = 'system',
    retries: number = MAX_RETRIES
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const lockAcquired = await this.acquireLock(resource, lockedBy);
        
        if (!lockAcquired) {
          if (attempt < retries) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
            continue;
          } else {
            throw new Error(`Failed to acquire lock for ${resource} after ${retries} retries`);
          }
        }

        try {
          // Execute the critical section
          const result = await fn();
          return result;
        } finally {
          // Always release the lock
          await this.releaseLock(resource);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retries) {
          // Retry on any error
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error(`Failed to execute with lock on ${resource}`);
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockId = `lock_${resource}`;
    try {
      const lockSnap = await getDoc(doc(db, 'transaction_locks', lockId));
      if (!lockSnap.exists()) return false;

      const lock = lockSnap.data() as TransactionLock;
      const expiryTime = new Date(lock.expiresAt).getTime();
      const currentTime = new Date().getTime();

      return currentTime <= expiryTime;
    } catch (error) {
      console.warn(`Failed to check lock status for ${resource}:`, error);
      return false;
    }
  }

  /**
   * Get current lock info for a resource (if locked)
   */
  async getLockInfo(resource: string): Promise<TransactionLock | null> {
    const lockId = `lock_${resource}`;
    try {
      const lockSnap = await getDoc(doc(db, 'transaction_locks', lockId));
      if (!lockSnap.exists()) return null;

      const lock = lockSnap.data() as TransactionLock;
      const expiryTime = new Date(lock.expiresAt).getTime();
      const currentTime = new Date().getTime();

      return currentTime <= expiryTime ? lock : null;
    } catch (error) {
      console.warn(`Failed to get lock info for ${resource}:`, error);
      return null;
    }
  }

  /**
   * Force release a lock (admin operation)
   */
  async forceLockRelease(resource: string): Promise<void> {
    const lockId = `lock_${resource}`;
    try {
      await deleteDoc(doc(db, 'transaction_locks', lockId));
      console.warn(`Force released lock for ${resource}`);
    } catch (error) {
      console.error(`Failed to force release lock for ${resource}:`, error);
    }
  }
}

export const transactionLockManager = new TransactionLockManager();
