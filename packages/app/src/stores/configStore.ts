import { reactive, watch, ref } from 'vue';
import type { ProviderType } from '../model/provider-types';
import { getSecureValue, setSecureValue, deleteSecureValue } from '../utils/electron';

export interface AppConfig {
  providerType: ProviderType;
  gitlabUrl?: string;
  username: string;
  showComments: boolean;
  showChecks: boolean;
  allowCommentsExpansion: boolean;
  allowChecksExpansion: boolean;
  theme: 'light' | 'dark' | 'system';
  pollingEnabled: boolean;
  pollingInterval: number;
  backgroundPolling: boolean;
  notificationsEnabled: boolean;
  notifyOnNewPR: boolean;
  notifyOnNewComments: boolean;
  prefetchOnHover: boolean;
  explicitReviewerOnly: boolean;
  followUpEnabled: boolean;
  followUpNotifyOnCommits: boolean;
  followUpNotifyOnComments: boolean;
  followUpNotifyOnReviews: boolean;
  // Write permissions - when false, write actions (merge, approve, comment) are hidden
  hasWritePermissions: boolean;
  // Insecure storage - when true, credentials are stored in localStorage instead of Keychain
  useInsecureStorage: boolean;
}

export interface AppConfigWithApiKey extends AppConfig {
  apiKey: string;
}

const STORAGE_KEY = 'pr-manager-config';
const API_KEY_SECURE_KEY = 'api-key';

const defaultConfig: AppConfig = {
  providerType: 'github',
  gitlabUrl: undefined,
  username: '',
  showComments: true,
  showChecks: true,
  allowCommentsExpansion: true,
  allowChecksExpansion: true,
  theme: 'system',
  pollingEnabled: true,
  pollingInterval: 60,
  backgroundPolling: true,
  notificationsEnabled: true,
  notifyOnNewPR: true,
  notifyOnNewComments: true,
  prefetchOnHover: true,
  explicitReviewerOnly: true,
  followUpEnabled: true,
  followUpNotifyOnCommits: true,
  followUpNotifyOnComments: true,
  followUpNotifyOnReviews: true,
  hasWritePermissions: true, // Default to true, will be updated during token validation
  useInsecureStorage: false, // Default to false, only true if user explicitly chooses localStorage
};

function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      delete parsed.apiKey;
      return { ...defaultConfig, ...parsed };
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return { ...defaultConfig };
}

function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Error saving config:', e);
  }
}

const apiKeyCache = ref<string>('');
const isApiKeyLoaded = ref<boolean>(false);

export async function loadApiKey(): Promise<string> {
  try {
    console.log('[ConfigStore] Loading API key from secure storage...');
    const key = await getSecureValue(API_KEY_SECURE_KEY);
    console.log('[ConfigStore] API key loaded:', key ? `${key.substring(0, 10)}... (length: ${key.length})` : 'null/empty');
    apiKeyCache.value = key || '';
    isApiKeyLoaded.value = true;

    const oldConfig = localStorage.getItem(STORAGE_KEY);
    if (oldConfig) {
      const parsed = JSON.parse(oldConfig);
      if (parsed.apiKey && !key) {
        await setSecureValue(API_KEY_SECURE_KEY, parsed.apiKey);
        apiKeyCache.value = parsed.apiKey;
        delete parsed.apiKey;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        console.log('Migrated API key to secure storage');
      }
    }

    return apiKeyCache.value;
  } catch (e) {
    console.error('Error loading API key:', e);
    isApiKeyLoaded.value = true;
    return '';
  }
}

export async function saveApiKey(apiKey: string): Promise<boolean> {
  try {
    const success = await setSecureValue(API_KEY_SECURE_KEY, apiKey);
    if (success) {
      apiKeyCache.value = apiKey;
    }
    return success;
  } catch (e) {
    console.error('Error saving API key:', e);
    return false;
  }
}

export async function clearApiKey(): Promise<boolean> {
  try {
    const success = await deleteSecureValue(API_KEY_SECURE_KEY);
    if (success) {
      apiKeyCache.value = '';
    }
    return success;
  } catch (e) {
    console.error('Error clearing API key:', e);
    return false;
  }
}

export function getApiKey(): string {
  return apiKeyCache.value;
}

export function isApiKeyReady(): boolean {
  return isApiKeyLoaded.value;
}

export const configStore = reactive<AppConfig>(loadConfig());

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

watch(
  () => ({ ...configStore }),
  (newConfig) => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      saveConfig(newConfig);
      saveTimeout = null;
    }, 300);
  },
  { deep: true }
);

export function updateConfig(partial: Partial<AppConfig>): void {
  Object.assign(configStore, partial);
}

export async function resetConfig(): Promise<void> {
  Object.assign(configStore, defaultConfig);
  localStorage.removeItem(STORAGE_KEY);
  await clearApiKey();
}

export function isConfigured(): boolean {
  return !!apiKeyCache.value;
}

export async function initializeConfig(): Promise<void> {
  await loadApiKey();
}
