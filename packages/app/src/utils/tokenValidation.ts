import { fetchWithRetry, HttpError } from './http';

export interface TokenValidationResult {
  valid: boolean;
  scopes: string[];
  missingScopes: string[];
  username?: string;
  error?: string;
}

export const GITHUB_REQUIRED_SCOPES = ['repo', 'read:org'];
export const GITLAB_REQUIRED_SCOPES = ['api'];

function checkScopes(actualScopes: string[], requiredScopes: string[]): string[] {
  const missing: string[] = [];

  for (const required of requiredScopes) {
    const hasScope = actualScopes.some(scope => {
      if (scope === required) return true;
      if (required.startsWith(scope + ':')) return true;
      if (scope.startsWith(required.split(':')[0]) && !required.includes(':')) return true;
      return false;
    });

    if (!hasScope) {
      missing.push(required);
    }
  }

  return missing;
}

export async function validateGitHubToken(token: string): Promise<TokenValidationResult> {
  const endpoint = 'https://api.github.com/user';

  try {
    const response = await fetchWithRetry(
      endpoint,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PR-Manager-App',
        },
      },
      { maxRetries: 0, timeout: 15000 }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return {
          valid: false,
          scopes: [],
          missingScopes: GITHUB_REQUIRED_SCOPES,
          error: 'Invalid token or token has expired',
        };
      }
      if (response.status === 403) {
        return {
          valid: false,
          scopes: [],
          missingScopes: GITHUB_REQUIRED_SCOPES,
          error: 'Access forbidden. Token may lack required permissions.',
        };
      }
      throw HttpError.fromResponse(response, endpoint);
    }

    const scopesHeader = response.headers.get('X-OAuth-Scopes') || '';
    const scopes = scopesHeader
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const userData = await response.json();
    const username = userData.login;

    const missingScopes = checkScopes(scopes, GITHUB_REQUIRED_SCOPES);

    const isFineGrained = scopes.length === 0 && response.ok;

    if (isFineGrained) {
      return {
        valid: true,
        scopes: ['fine-grained-token'],
        missingScopes: [],
        username,
        error: undefined,
      };
    }

    return {
      valid: missingScopes.length === 0,
      scopes,
      missingScopes,
      username,
      error: missingScopes.length > 0
        ? `Missing required scopes: ${missingScopes.join(', ')}`
        : undefined,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      return {
        valid: false,
        scopes: [],
        missingScopes: GITHUB_REQUIRED_SCOPES,
        error: error.message,
      };
    }

    return {
      valid: false,
      scopes: [],
      missingScopes: GITHUB_REQUIRED_SCOPES,
      error: error instanceof Error ? error.message : 'Unknown error validating token',
    };
  }
}

export async function validateGitLabToken(
  token: string,
  baseUrl = 'https://gitlab.com'
): Promise<TokenValidationResult> {
  const tokenEndpoint = `${baseUrl}/api/v4/personal_access_tokens/self`;

  try {
    const tokenResponse = await fetchWithRetry(
      tokenEndpoint,
      {
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': token,
        },
      },
      { maxRetries: 0, timeout: 15000 }
    );

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      const scopes: string[] = tokenData.scopes || [];
      const missingScopes = checkScopes(scopes, GITLAB_REQUIRED_SCOPES);

      const userEndpoint = `${baseUrl}/api/v4/user`;
      let username: string | undefined;

      try {
        const userResponse = await fetchWithRetry(
          userEndpoint,
          {
            method: 'GET',
            headers: { 'PRIVATE-TOKEN': token },
          },
          { maxRetries: 0, timeout: 10000 }
        );

        if (userResponse.ok) {
          const userData = await userResponse.json();
          username = userData.username;
        }
      } catch {
        // Ignore user fetch errors, we already have token info
      }

      return {
        valid: missingScopes.length === 0,
        scopes,
        missingScopes,
        username,
        error: missingScopes.length > 0
          ? `Missing required scopes: ${missingScopes.join(', ')}`
          : undefined,
      };
    }

    if (tokenResponse.status === 404) {
      return validateGitLabTokenFallback(token, baseUrl);
    }

    if (tokenResponse.status === 401) {
      return {
        valid: false,
        scopes: [],
        missingScopes: GITLAB_REQUIRED_SCOPES,
        error: 'Invalid token or token has expired',
      };
    }

    if (tokenResponse.status === 403) {
      return {
        valid: false,
        scopes: [],
        missingScopes: GITLAB_REQUIRED_SCOPES,
        error: 'Access forbidden. Token may lack required permissions.',
      };
    }

    throw HttpError.fromResponse(tokenResponse, tokenEndpoint);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      return validateGitLabTokenFallback(token, baseUrl);
    }

    if (error instanceof HttpError) {
      return {
        valid: false,
        scopes: [],
        missingScopes: GITLAB_REQUIRED_SCOPES,
        error: error.message,
      };
    }

    return {
      valid: false,
      scopes: [],
      missingScopes: GITLAB_REQUIRED_SCOPES,
      error: error instanceof Error ? error.message : 'Unknown error validating token',
    };
  }
}

async function validateGitLabTokenFallback(
  token: string,
  baseUrl: string
): Promise<TokenValidationResult> {
  const userEndpoint = `${baseUrl}/api/v4/user`;

  try {
    const response = await fetchWithRetry(
      userEndpoint,
      {
        method: 'GET',
        headers: {
          'PRIVATE-TOKEN': token,
        },
      },
      { maxRetries: 0, timeout: 15000 }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return {
          valid: false,
          scopes: [],
          missingScopes: GITLAB_REQUIRED_SCOPES,
          error: 'Invalid token or token has expired',
        };
      }
      throw HttpError.fromResponse(response, userEndpoint);
    }

    const userData = await response.json();

    return {
      valid: true,
      scopes: ['unknown'],
      missingScopes: [],
      username: userData.username,
      error: undefined,
    };
  } catch (error) {
    return {
      valid: false,
      scopes: [],
      missingScopes: GITLAB_REQUIRED_SCOPES,
      error: error instanceof Error ? error.message : 'Unknown error validating token',
    };
  }
}

export async function validateToken(
  provider: 'github' | 'gitlab',
  token: string,
  baseUrl?: string
): Promise<TokenValidationResult> {
  if (!token || token.trim().length === 0) {
    return {
      valid: false,
      scopes: [],
      missingScopes: provider === 'github' ? GITHUB_REQUIRED_SCOPES : GITLAB_REQUIRED_SCOPES,
      error: 'Token is empty',
    };
  }

  if (provider === 'github') {
    return validateGitHubToken(token);
  }

  return validateGitLabToken(token, baseUrl);
}

export function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'repo': 'Full control of private repositories',
    'repo:status': 'Access commit status',
    'repo_deployment': 'Access deployment status',
    'public_repo': 'Access public repositories',
    'repo:invite': 'Access repository invitations',
    'read:org': 'Read organization membership',
    'write:org': 'Read and write organization membership',
    'read:user': 'Read user profile data',
    'user:email': 'Access user email addresses',
    'notifications': 'Access notifications',
    'api': 'Full API access (read/write)',
    'read_api': 'Read-only API access',
    'read_user': 'Read user information',
    'read_repository': 'Read repository',
    'write_repository': 'Write to repository',
    'read_registry': 'Read container registry',
    'write_registry': 'Write to container registry',
  };

  return descriptions[scope] || scope;
}
