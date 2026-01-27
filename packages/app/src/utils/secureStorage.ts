import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Lazy load safeStorage to avoid triggering Keychain access on import
let _safeStorage: typeof import('electron').safeStorage | null = null;

function getSafeStorage(): typeof import('electron').safeStorage {
  if (!_safeStorage) {
    // Dynamic import to defer Keychain initialization
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _safeStorage = require('electron').safeStorage;
  }
  return _safeStorage;
}

interface SecureData {
  [key: string]: string;
}

const SECURE_FILE_NAME = 'secure-storage.json';

function getStoragePath(): string {
  return path.join(app.getPath('userData'), SECURE_FILE_NAME);
}

function loadSecureData(): SecureData {
  try {
    const filePath = getStoragePath();
    console.log('[SecureStorage] Loading from:', filePath);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      console.log('[SecureStorage] Loaded data with keys:', Object.keys(data));
      return data;
    }
    console.log('[SecureStorage] File does not exist:', filePath);
  } catch (error) {
    console.error('[SecureStorage] Error loading secure storage:', error);
  }
  return {};
}

function saveSecureData(data: SecureData): void {
  try {
    const filePath = getStoragePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving secure storage:', error);
  }
}

export function isEncryptionAvailable(): boolean {
  return getSafeStorage().isEncryptionAvailable();
}

export function setSecureValue(key: string, value: string): boolean {
  console.log('[SecureStorage] Setting value for key:', key, '(length:', value?.length || 0, ')');

  if (!getSafeStorage().isEncryptionAvailable()) {
    console.error('[SecureStorage] Encryption not available - cannot store sensitive data securely');
    return false;
  }

  try {
    const encrypted = getSafeStorage().encryptString(value);
    const data = loadSecureData();
    data[key] = encrypted.toString('base64');
    saveSecureData(data);
    console.log('[SecureStorage] Successfully saved encrypted value for key:', key);
    return true;
  } catch (error) {
    console.error('[SecureStorage] Error encrypting value for key:', key, error);
    return false;
  }
}

export function getSecureValue(key: string): string | null {
  console.log('[SecureStorage] Getting value for key:', key);
  const data = loadSecureData();
  const encryptedBase64 = data[key];

  if (!encryptedBase64) {
    console.log('[SecureStorage] No encrypted value found for key:', key);
    console.log('[SecureStorage] Available keys:', Object.keys(data));
    return null;
  }

  if (!getSafeStorage().isEncryptionAvailable()) {
    console.error('[SecureStorage] Encryption not available - cannot retrieve sensitive data securely');
    return null;
  }

  try {
    console.log('[SecureStorage] Decrypting value for key:', key);
    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const decrypted = getSafeStorage().decryptString(encrypted);
    console.log('[SecureStorage] Successfully decrypted value for key:', key, '(length:', decrypted?.length || 0, ')');
    return decrypted;
  } catch (error) {
    console.error('[SecureStorage] Error decrypting value for key:', key, error);
    return null;
  }
}

export function deleteSecureValue(key: string): boolean {
  try {
    const data = loadSecureData();
    if (key in data) {
      delete data[key];
      saveSecureData(data);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting secure value:', error);
    return false;
  }
}

export function clearSecureStorage(): boolean {
  try {
    const filePath = getStoragePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  } catch (error) {
    console.error('Error clearing secure storage:', error);
    return false;
  }
}

/**
 * Check if storage file exists and has stored credentials.
 * This does NOT trigger Keychain access - it only checks file existence.
 */
export function hasStoredCredentials(): boolean {
  try {
    const securePath = getStoragePath();
    if (fs.existsSync(securePath)) {
      const content = fs.readFileSync(securePath, 'utf-8');
      const data = JSON.parse(content);
      if (Object.keys(data).length > 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Verify that Keychain access is working by attempting to encrypt/decrypt.
 * This WILL trigger the Keychain prompt if access hasn't been granted.
 * Returns success/failure and any error message.
 */
export function verifyKeychainAccess(): { success: boolean; error?: string } {
  try {
    // First check if encryption is available
    if (!getSafeStorage().isEncryptionAvailable()) {
      return { success: false, error: 'Encryption is not available on this system' };
    }

    // Load the secure data (this doesn't trigger Keychain)
    const data = loadSecureData();

    // If there's no data, try to encrypt/decrypt a test value to verify Keychain works
    if (Object.keys(data).length === 0) {
      const testValue = 'keychain-test';
      const encrypted = getSafeStorage().encryptString(testValue);
      const decrypted = getSafeStorage().decryptString(encrypted);

      if (decrypted !== testValue) {
        return { success: false, error: 'Keychain verification failed: decryption mismatch' };
      }
      return { success: true };
    }

    // Try to decrypt the first stored value to verify Keychain access
    const firstKey = Object.keys(data)[0];
    const encryptedBase64 = data[firstKey];
    const encrypted = Buffer.from(encryptedBase64, 'base64');

    // This will trigger the Keychain prompt if needed
    getSafeStorage().decryptString(encrypted);

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Check for common Keychain error patterns
    if (errorMessage.includes('user denied') || errorMessage.includes('canceled')) {
      return { success: false, error: 'Keychain access was denied by user' };
    }
    if (errorMessage.includes('not found') || errorMessage.includes('no password')) {
      return { success: false, error: 'Keychain item not found or corrupted' };
    }

    return { success: false, error: `Keychain access failed: ${errorMessage}` };
  }
}

/**
 * Migrate credentials from insecure storage to secure Keychain storage.
 * This reads all values from insecure storage, encrypts them with Keychain,
 * saves them to secure storage, and then clears the insecure storage.
 */
export function migrateToSecureStorage(): { success: boolean; error?: string; migrated: number } {
  try {
    // First verify Keychain is available
    if (!getSafeStorage().isEncryptionAvailable()) {
      return { success: false, error: 'Encryption is not available', migrated: 0 };
    }

    // Load insecure data
    const insecureData = loadSecureData(true);
    const keys = Object.keys(insecureData);

    if (keys.length === 0) {
      // Nothing to migrate, just switch mode
      setStorageMode(false);
      return { success: true, migrated: 0 };
    }

    // Migrate each value
    let migrated = 0;
    for (const key of keys) {
      const base64Value = insecureData[key];
      // Decode from base64 (insecure storage format)
      const plainValue = Buffer.from(base64Value, 'base64').toString('utf-8');

      // Encrypt with Keychain
      const encrypted = getSafeStorage().encryptString(plainValue);

      // Save to secure storage
      const secureData = loadSecureData(false);
      secureData[key] = encrypted.toString('base64');
      saveSecureData(secureData, false);

      migrated++;
    }

    // Clear insecure storage
    const insecurePath = getStoragePath(true);
    if (fs.existsSync(insecurePath)) {
      fs.unlinkSync(insecurePath);
    }

    // Switch to secure mode
    setStorageMode(false);

    return { success: true, migrated };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Migration failed: ${errorMessage}`, migrated: 0 };
  }
}
