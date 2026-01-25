export type ProviderType = 'github' | 'gitlab' | 'bitbucket';

export interface ProviderConfig {
  type: ProviderType;
  apiKey: string;
  endpoint?: string;
}

export interface ProviderCapabilities {
  graphql: boolean;
  rest: boolean;
  cicd: boolean;
  codeReview: boolean;
  mergeRequest: boolean;
  draft: boolean;
}

export const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> = {
  github: {
    graphql: true,
    rest: true,
    cicd: true,
    codeReview: true,
    mergeRequest: true,
    draft: true,
  },
  gitlab: {
    graphql: true,
    rest: true,
    cicd: true,
    codeReview: true,
    mergeRequest: true,
    draft: true,
  },
  bitbucket: {
    graphql: false,
    rest: true,
    cicd: true,
    codeReview: true,
    mergeRequest: true,
    draft: false,
  },
};

export interface ProviderInfo {
  name: string;
  icon: string;
  apiDocsUrl: string;
}

export const PROVIDER_INFO: Record<ProviderType, ProviderInfo> = {
  github: {
    name: 'GitHub',
    icon: 'github',
    apiDocsUrl: 'https://docs.github.com/en/graphql',
  },
  gitlab: {
    name: 'GitLab',
    icon: 'gitlab',
    apiDocsUrl: 'https://docs.gitlab.com/ee/api/graphql/',
  },
  bitbucket: {
    name: 'Bitbucket',
    icon: 'bitbucket',
    apiDocsUrl: 'https://developer.atlassian.com/cloud/bitbucket/rest/',
  },
};
