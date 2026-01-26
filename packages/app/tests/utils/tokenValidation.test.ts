/**
 * Tests for tokenValidation.ts
 * Tests token validation and scope detection for GitHub and GitLab
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the http utility
vi.mock('../../src/utils/http', () => ({
  fetchWithRetry: vi.fn(),
  HttpError: class HttpError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
    static fromResponse(response: Response) {
      return new HttpError(`HTTP ${response.status}`, response.status);
    }
  },
}));

import { fetchWithRetry } from '../../src/utils/http';
import {
  validateGitHubToken,
  validateGitLabToken,
  validateToken,
  GITHUB_REQUIRED_SCOPES,
  GITLAB_REQUIRED_SCOPES,
} from '../../src/utils/tokenValidation';

const mockFetchWithRetry = vi.mocked(fetchWithRetry);

describe('tokenValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateGitHubToken', () => {
    it('should return valid for token with required scopes', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-OAuth-Scopes': 'repo, read:org' }),
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateGitHubToken('ghp_validtoken');

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('repo');
      expect(result.scopes).toContain('read:org');
      expect(result.missingScopes).toHaveLength(0);
      expect(result.username).toBe('testuser');
    });

    it('should detect fine-grained tokens (no scopes header)', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({}), // No X-OAuth-Scopes header
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateGitHubToken('github_pat_finetoken');

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('fine-grained-token');
      expect(result.missingScopes).toHaveLength(0);
    });

    it('should return missing scopes when token lacks repo scope', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-OAuth-Scopes': 'read:user' }),
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateGitHubToken('ghp_limitedtoken');

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('repo');
      expect(result.error).toContain('Missing required scopes');
    });

    it('should return invalid for 401 response', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({}),
      } as Response);

      const result = await validateGitHubToken('ghp_invalidtoken');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
      expect(result.missingScopes).toEqual(GITHUB_REQUIRED_SCOPES);
    });

    it('should return invalid for 403 response', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({}),
      } as Response);

      const result = await validateGitHubToken('ghp_forbiddentoken');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Access forbidden');
    });
  });

  describe('validateGitLabToken', () => {
    it('should return valid for token with api scope', async () => {
      // First call: token endpoint
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ scopes: ['api'] }),
        } as Response)
        // Second call: user endpoint
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: 'testuser' }),
        } as Response);

      const result = await validateGitLabToken('glpat_validtoken');

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('api');
      expect(result.missingScopes).toHaveLength(0);
      expect(result.username).toBe('testuser');
    });

    it('should return missing scopes for read-only token', async () => {
      mockFetchWithRetry.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ scopes: ['read_api', 'read_user'] }),
      } as Response);

      const result = await validateGitLabToken('glpat_readonlytoken');

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('api');
      expect(result.error).toContain('Missing required scopes');
    });

    it('should return invalid for 401 response', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateGitLabToken('glpat_invalidtoken');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid token');
      expect(result.missingScopes).toEqual(GITLAB_REQUIRED_SCOPES);
    });

    it('should use fallback for self-hosted instances without token endpoint', async () => {
      // First call returns 404 (old GitLab version)
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as Response)
        // Fallback to user endpoint
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: 'testuser' }),
        } as Response);

      const result = await validateGitLabToken('glpat_selfhosted', 'https://gitlab.company.com');

      expect(result.valid).toBe(true);
      expect(result.username).toBe('testuser');
    });
  });

  describe('validateToken', () => {
    it('should return error for empty token', async () => {
      const result = await validateToken('github', '');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is empty');
    });

    it('should return error for whitespace-only token', async () => {
      const result = await validateToken('github', '   ');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Token is empty');
    });

    it('should call validateGitHubToken for github provider', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-OAuth-Scopes': 'repo, read:org' }),
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateToken('github', 'ghp_token');

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'https://api.github.com/user',
        expect.any(Object),
        expect.any(Object)
      );
      expect(result.valid).toBe(true);
    });

    it('should call validateGitLabToken for gitlab provider', async () => {
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ scopes: ['api'] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: 'testuser' }),
        } as Response);

      const result = await validateToken('gitlab', 'glpat_token');

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/personal_access_tokens/self',
        expect.any(Object),
        expect.any(Object)
      );
      expect(result.valid).toBe(true);
    });

    it('should use custom baseUrl for GitLab self-hosted', async () => {
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ scopes: ['api'] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: 'testuser' }),
        } as Response);

      await validateToken('gitlab', 'glpat_token', 'https://gitlab.company.com');

      expect(mockFetchWithRetry).toHaveBeenCalledWith(
        'https://gitlab.company.com/api/v4/personal_access_tokens/self',
        expect.any(Object),
        expect.any(Object)
      );
    });
  });

  describe('write permission detection', () => {
    it('should detect write permissions with repo scope on GitHub', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-OAuth-Scopes': 'repo, read:org' }),
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateGitHubToken('ghp_writetoken');

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('repo');
      // Token with repo scope has write permissions
    });

    it('should detect read-only token without repo scope on GitHub', async () => {
      mockFetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'X-OAuth-Scopes': 'public_repo' }),
        json: () => Promise.resolve({ login: 'testuser' }),
      } as Response);

      const result = await validateGitHubToken('ghp_publiconly');

      // public_repo gives read access to public repos but limited write
      expect(result.missingScopes).toContain('repo');
    });

    it('should detect write permissions with api scope on GitLab', async () => {
      mockFetchWithRetry
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ scopes: ['api'] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ username: 'testuser' }),
        } as Response);

      const result = await validateGitLabToken('glpat_apitoken');

      expect(result.valid).toBe(true);
      expect(result.scopes).toContain('api');
      // Token with api scope has full write permissions
    });

    it('should detect read-only token on GitLab', async () => {
      mockFetchWithRetry.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ scopes: ['read_api'] }),
      } as Response);

      const result = await validateGitLabToken('glpat_readonly');

      expect(result.valid).toBe(false);
      expect(result.missingScopes).toContain('api');
      // Token with only read_api doesn't have write permissions
    });
  });
});
