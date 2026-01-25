/**
 * Auth utilities for client-side authentication handling
 */

// Whitelist of allowed redirect domains/paths
const ALLOWED_REDIRECT_PATTERNS = [
  /^\/[a-zA-Z0-9\-_/]*$/, // Relative paths only (e.g., /success, /pricing)
];

/**
 * Clear all authentication tokens from localStorage
 */
export function clearAllAuthTokens(): void {
  localStorage.removeItem('pr_manager_token');
  localStorage.removeItem('pr_manager_refresh_token');
  localStorage.removeItem('pr_manager_user');
}

/**
 * Check if a redirect URL is safe (prevents open redirect attacks)
 * Only allows relative paths, not absolute URLs
 */
export function isValidRedirectUrl(url: string | null): boolean {
  if (!url) return false;

  // Block any URL with a protocol (http://, https://, javascript:, etc.)
  if (url.includes(':')) return false;

  // Block URLs starting with // (protocol-relative URLs)
  if (url.startsWith('//')) return false;

  // Check against whitelist patterns
  return ALLOWED_REDIRECT_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Get a safe redirect URL, falling back to default if invalid
 */
export function getSafeRedirectUrl(
  url: string | null,
  defaultUrl: string = '/success'
): string {
  return isValidRedirectUrl(url) ? url! : defaultUrl;
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem('pr_manager_token');
}

/**
 * Redirect authenticated users away from auth pages
 */
export function redirectIfAuthenticated(redirectTo: string = '/success'): void {
  if (isAuthenticated()) {
    window.location.href = redirectTo;
  }
}
