import type { PullRequestBasic } from '../model/types';

export type FilterId =
  | 'none'
  | 'is-draft'
  | 'not-draft'
  | 'has-comments'
  | 'no-comments'
  | 'needs-review'
  | 'approved'
  | 'changes-requested'
  | 'my-review-requested'
  | 'not-my-pr';

export interface FilterDefinition {
  id: FilterId;
  name: string;
  description: string;
  fn: (pr: PullRequestBasic, username: string) => boolean;
}

export const FILTERS: Record<FilterId, FilterDefinition> = {
  'none': {
    id: 'none',
    name: 'No filter',
    description: 'Show all PRs',
    fn: () => true,
  },

  'is-draft': {
    id: 'is-draft',
    name: 'Draft PRs',
    description: 'Only show draft PRs',
    fn: (pr) => pr.isDraft === true,
  },

  'not-draft': {
    id: 'not-draft',
    name: 'Non-draft PRs',
    description: 'Exclude draft PRs',
    fn: (pr) => pr.isDraft !== true,
  },

  'has-comments': {
    id: 'has-comments',
    name: 'Has comments',
    description: 'PRs with at least one comment',
    fn: (pr) => (pr.comments?.totalCount ?? 0) > 0,
  },

  'no-comments': {
    id: 'no-comments',
    name: 'No comments',
    description: 'PRs without any comments',
    fn: (pr) => (pr.comments?.totalCount ?? 0) === 0,
  },

  'needs-review': {
    id: 'needs-review',
    name: 'Needs review',
    description: 'PRs pending review',
    fn: (pr) => pr.reviewDecision === 'REVIEW_REQUIRED' || pr.reviewDecision === null,
  },

  'approved': {
    id: 'approved',
    name: 'Approved',
    description: 'PRs that have been approved',
    fn: (pr) => pr.reviewDecision === 'APPROVED',
  },

  'changes-requested': {
    id: 'changes-requested',
    name: 'Changes requested',
    description: 'PRs with requested changes',
    fn: (pr) => pr.reviewDecision === 'CHANGES_REQUESTED',
  },

  'my-review-requested': {
    id: 'my-review-requested',
    name: 'My review requested',
    description: 'PRs where your review is requested',
    fn: (pr, username) => {
      const reviewers = pr.reviewRequests?.nodes || [];
      return reviewers.some((r) => {
        if ('login' in r.requestedReviewer) {
          return r.requestedReviewer.login === username;
        }
        return false;
      });
    },
  },

  'not-my-pr': {
    id: 'not-my-pr',
    name: 'Not my PRs',
    description: 'Exclude PRs authored by you',
    fn: (pr, username) => pr.author?.login !== username,
  },
};

export type SorterId =
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'created-asc'
  | 'comments-desc'
  | 'comments-asc'
  | 'title-asc'
  | 'title-desc';

export interface SorterDefinition {
  id: SorterId;
  name: string;
  description: string;
  fn: (a: PullRequestBasic, b: PullRequestBasic) => number;
}

export const SORTERS: Record<SorterId, SorterDefinition> = {
  'updated-desc': {
    id: 'updated-desc',
    name: 'Recently updated',
    description: 'Most recently updated first',
    fn: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  },

  'updated-asc': {
    id: 'updated-asc',
    name: 'Least recently updated',
    description: 'Least recently updated first',
    fn: (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  },

  'created-desc': {
    id: 'created-desc',
    name: 'Newest first',
    description: 'Most recently created first',
    fn: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  },

  'created-asc': {
    id: 'created-asc',
    name: 'Oldest first',
    description: 'Oldest PRs first',
    fn: (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  },

  'comments-desc': {
    id: 'comments-desc',
    name: 'Most comments',
    description: 'PRs with most comments first',
    fn: (a, b) => (b.comments?.totalCount ?? 0) - (a.comments?.totalCount ?? 0),
  },

  'comments-asc': {
    id: 'comments-asc',
    name: 'Fewest comments',
    description: 'PRs with fewest comments first',
    fn: (a, b) => (a.comments?.totalCount ?? 0) - (b.comments?.totalCount ?? 0),
  },

  'title-asc': {
    id: 'title-asc',
    name: 'Title A-Z',
    description: 'Alphabetical by title',
    fn: (a, b) => a.title.localeCompare(b.title),
  },

  'title-desc': {
    id: 'title-desc',
    name: 'Title Z-A',
    description: 'Reverse alphabetical by title',
    fn: (a, b) => b.title.localeCompare(a.title),
  },
};

export function getFilterById(filterId: FilterId | string | undefined): FilterDefinition {
  if (!filterId || !(filterId in FILTERS)) {
    return FILTERS['none'];
  }
  return FILTERS[filterId as FilterId];
}

export function getSorterById(sorterId: SorterId | string | undefined): SorterDefinition {
  if (!sorterId || !(sorterId in SORTERS)) {
    return SORTERS['updated-desc'];
  }
  return SORTERS[sorterId as SorterId];
}

export function getAllFilters(): FilterDefinition[] {
  return Object.values(FILTERS);
}

export function getAllSorters(): SorterDefinition[] {
  return Object.values(SORTERS);
}
