/**
 * Vitest Setup File
 * Configures the test environment with mocks for Electron APIs and browser globals
 */

import { vi } from 'vitest';

// Mock DOMPurify with comprehensive sanitization for testing
vi.mock('dompurify', () => {
  const mockSanitize = (dirty: string, config?: Record<string, unknown>) => {
    let result = dirty;

    // Check if RETURN_DOM_FRAGMENT or ALLOWED_TAGS is empty (for sanitizeText)
    const allowedTags = config?.ALLOWED_TAGS as string[] | undefined;
    if (allowedTags && allowedTags.length === 0) {
      // Strip ALL HTML tags for sanitizeText
      result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      result = result.replace(/<[^>]+>/g, '');
      return result;
    }

    // Remove dangerous tags completely (including content)
    result = result.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    result = result.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
    result = result.replace(/<iframe[^>]*>/gi, '');
    result = result.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
    result = result.replace(/<meta[^>]*>/gi, '');
    result = result.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
    result = result.replace(/<embed[^>]*>/gi, '');
    result = result.replace(/<link[^>]*>/gi, '');
    result = result.replace(/<base[^>]*>/gi, '');

    // Remove HTML comments (may contain malicious content)
    result = result.replace(/<!--[\s\S]*?-->/g, '');

    // Remove event handlers (onclick, onerror, onload, etc.)
    result = result.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    result = result.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

    // Remove javascript: protocol
    result = result.replace(/javascript:/gi, '');

    // Remove data: protocol for dangerous content
    result = result.replace(/data:text\/html[^"']*/gi, '');

    // Remove data-* attributes (custom data attributes can be used maliciously)
    result = result.replace(/\s*data-[a-z0-9-]+\s*=\s*["'][^"']*["']/gi, '');
    result = result.replace(/\s*data-[a-z0-9-]+\s*=\s*[^\s>]*/gi, '');

    // Clean up href attributes with javascript
    result = result.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href=""');

    // Remove alert and other dangerous function calls from remaining attributes
    result = result.replace(/alert\s*\([^)]*\)/gi, '');
    result = result.replace(/eval\s*\([^)]*\)/gi, '');

    return result;
  };

  return {
    default: {
      sanitize: mockSanitize,
    },
  };
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Electron API
const electronAPIMock = {
  isElectron: true,
  platform: 'darwin',
  ipc: {
    send: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
  secureStorage: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
  },
  zoom: {
    setZoomLevel: vi.fn(),
    getZoomLevel: vi.fn().mockReturnValue(0),
    setZoomFactor: vi.fn(),
    getZoomFactor: vi.fn().mockReturnValue(1),
  },
  auth: {
    getToken: vi.fn().mockResolvedValue(null),
    setToken: vi.fn().mockResolvedValue(undefined),
    clearToken: vi.fn().mockResolvedValue(undefined),
    getRefreshToken: vi.fn().mockResolvedValue(null),
    setRefreshToken: vi.fn().mockResolvedValue(undefined),
    clearRefreshToken: vi.fn().mockResolvedValue(undefined),
    getUser: vi.fn().mockResolvedValue(null),
    setUser: vi.fn().mockResolvedValue(undefined),
  },
  keychain: {
    hasStoredCredentials: vi.fn().mockResolvedValue(false),
    verifyAccess: vi.fn().mockResolvedValue({ success: true }),
    isEncryptionAvailable: vi.fn().mockResolvedValue(true),
    getStorageMode: vi.fn().mockResolvedValue(false),
    setStorageMode: vi.fn().mockResolvedValue(true),
  },
  validateToken: vi.fn().mockResolvedValue({
    valid: true,
    scopes: ['repo', 'read:org'],
    missingScopes: [],
    username: 'testuser',
  }),
};

Object.defineProperty(globalThis, 'window', {
  value: {
    ...globalThis.window,
    electronAPI: electronAPIMock,
    localStorage: localStorageMock,
  },
  writable: true,
});

// Mock fetch for API tests
globalThis.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
});

// Export mocks for use in tests
export { localStorageMock, electronAPIMock };
