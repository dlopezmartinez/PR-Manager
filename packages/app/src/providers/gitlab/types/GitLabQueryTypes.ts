/**
 * GitLab Query Types
 *
 * GitLab doesn't support arbitrary search queries like GitHub.
 * Instead, we use a structured filter format that maps to GitLab's REST API parameters.
 *
 * The query format is a JSON object that gets serialized to a string for storage.
 * When listPullRequests receives a query starting with '{', it parses it as GitLabQueryFilter.
 */

import { gitlabLogger } from '../../../utils/logger';

/**
 * Structured filter for GitLab merge request queries.
 * Maps directly to GitLab REST API /merge_requests parameters.
 */
export interface GitLabQueryFilter {
  /**
   * Query type determines the base scope:
   * - 'authored': MRs authored by the user (scope=created_by_me)
   * - 'review-requested': MRs assigned for review (scope=assigned_to_me as reviewer)
   * - 'all': All MRs the user has access to (scope=all)
   */
  type: 'authored' | 'review-requested' | 'all';

  /**
   * MR state filter
   * - 'opened': Only open MRs (default)
   * - 'closed': Only closed MRs
   * - 'merged': Only merged MRs
   * - 'all': All states
   */
  state?: 'opened' | 'closed' | 'merged' | 'all';

  /**
   * Filter by specific author username (without @)
   * Use '{{username}}' as placeholder for current user
   */
  authorUsername?: string;

  /**
   * Filter by specific reviewer username (without @)
   * Use '{{username}}' as placeholder for current user
   */
  reviewerUsername?: string;

  /**
   * Filter by labels (comma-separated or array)
   * Matches MRs with ALL specified labels
   */
  labels?: string[];

  /**
   * Filter by project full paths (e.g., "namespace/project")
   * If specified, queries each project separately and combines results
   */
  projectPaths?: string[];

  /**
   * Filter by draft status
   * - true: Only draft MRs
   * - false: Only non-draft MRs
   * - undefined: Include all
   */
  draft?: boolean;

  /**
   * Sort order
   * - 'updated_desc': Most recently updated first (default)
   * - 'created_desc': Most recently created first
   * - 'updated_asc': Oldest updated first
   * - 'created_asc': Oldest created first
   */
  orderBy?: 'updated_desc' | 'created_desc' | 'updated_asc' | 'created_asc';

  /**
   * Search in title and description
   */
  search?: string;
}

/**
 * Check if a query string is a GitLab structured query (JSON format)
 */
export function isGitLabStructuredQuery(query: string): boolean {
  return query.trim().startsWith('{');
}

/**
 * Parse a GitLab structured query from JSON string
 */
export function parseGitLabQuery(query: string): GitLabQueryFilter | null {
  if (!isGitLabStructuredQuery(query)) {
    return null;
  }

  try {
    return JSON.parse(query) as GitLabQueryFilter;
  } catch {
    gitlabLogger.error('Failed to parse GitLab query', { query });
    return null;
  }
}

/**
 * Serialize a GitLab query filter to a JSON string
 */
export function serializeGitLabQuery(filter: GitLabQueryFilter): string {
  return JSON.stringify(filter);
}

/**
 * Build a GitLab query filter from template type and options
 */
export function buildGitLabQueryFilter(options: {
  type: GitLabQueryFilter['type'];
  state?: GitLabQueryFilter['state'];
  authorUsername?: string;
  reviewerUsername?: string;
  labels?: string[];
  projectPaths?: string[];
  draft?: boolean;
  orderBy?: GitLabQueryFilter['orderBy'];
}): GitLabQueryFilter {
  const filter: GitLabQueryFilter = {
    type: options.type,
    state: options.state || 'opened',
  };

  if (options.authorUsername) {
    filter.authorUsername = options.authorUsername;
  }

  if (options.reviewerUsername) {
    filter.reviewerUsername = options.reviewerUsername;
  }

  if (options.labels && options.labels.length > 0) {
    filter.labels = options.labels;
  }

  if (options.projectPaths && options.projectPaths.length > 0) {
    filter.projectPaths = options.projectPaths;
  }

  if (options.draft !== undefined) {
    filter.draft = options.draft;
  }

  if (options.orderBy) {
    filter.orderBy = options.orderBy;
  }

  return filter;
}

/**
 * Convert legacy GitHub-style query to GitLab filter (best effort)
 * This handles backwards compatibility with old saved views
 */
export function convertLegacyQueryToGitLabFilter(query: string): GitLabQueryFilter {
  const filter: GitLabQueryFilter = {
    type: 'all',
    state: 'opened',
  };

  // Check for author pattern
  const authorMatch = query.match(/author:(\S+)/);
  if (authorMatch) {
    filter.type = 'authored';
    const author = authorMatch[1].replace('@me', '{{username}}');
    if (author !== '{{username}}') {
      filter.authorUsername = author;
    }
  }

  // Check for review-requested pattern
  const reviewerMatch = query.match(/(?:review-requested:|reviewer:)(\S+)/);
  if (reviewerMatch) {
    filter.type = 'review-requested';
    const reviewer = reviewerMatch[1].replace('@me', '{{username}}');
    if (reviewer !== '{{username}}') {
      filter.reviewerUsername = reviewer;
    }
  }

  // Check for state
  if (query.includes('is:closed') || query.includes('state:closed')) {
    filter.state = 'closed';
  } else if (query.includes('is:merged') || query.includes('state:merged')) {
    filter.state = 'merged';
  } else if (query.includes('is:open') || query.includes('state:opened')) {
    filter.state = 'opened';
  }

  // Check for draft filter
  if (query.includes('-is:draft')) {
    filter.draft = false;
  } else if (query.includes('is:draft')) {
    filter.draft = true;
  }

  // Extract labels
  const labelMatches = query.matchAll(/label:(\S+)/g);
  const labels: string[] = [];
  for (const match of labelMatches) {
    labels.push(match[1]);
  }
  if (labels.length > 0) {
    filter.labels = labels;
  }

  // Extract repos/projects
  const repoMatches = query.matchAll(/repo:(\S+)/g);
  const projectPaths: string[] = [];
  for (const match of repoMatches) {
    projectPaths.push(match[1]);
  }
  if (projectPaths.length > 0) {
    filter.projectPaths = projectPaths;
  }

  return filter;
}
