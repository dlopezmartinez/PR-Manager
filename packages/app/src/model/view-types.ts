import type { PullRequestBasic } from './types';

export type ViewId = string;

export type ViewQueryBuilder = (username: string) => string | string[];

export type ViewFilter = (pr: PullRequestBasic, username: string) => boolean;

export type ViewSorter = (a: PullRequestBasic, b: PullRequestBasic) => number;

export interface ViewConfig {
  id: ViewId;
  name: string;
  icon?: string;
  queryBuilder: ViewQueryBuilder;
  filter?: ViewFilter;
  sorter?: ViewSorter;
  deduplicate?: boolean;
  pageSize?: number;
  readonly?: boolean;
  order?: number;
  applyExplicitReviewerFilter?: boolean;
}

export interface SerializableViewConfig {
  id: ViewId;
  name: string;
  icon?: string;
  queryTemplate: string;
  filterId?: string;
  sorterId?: string;
  /** @deprecated Use filterId instead */
  filterCode?: string;
  /** @deprecated Use sorterId instead */
  sorterCode?: string;
  deduplicate?: boolean;
  pageSize?: number;
  readonly?: boolean;
  order?: number;
  applyExplicitReviewerFilter?: boolean;
}

export interface ViewState {
  prs: PullRequestBasic[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  };
  loading: boolean;
  error: string;
  lastFetched: Date | null;
}

export interface ViewEditorFormData {
  name: string;
  icon?: string;
  customQuery?: string;
  repositories?: string[];
  labels?: string[];
  authors?: string[];
  isDraft?: boolean;
  state?: 'open' | 'closed';
  reviewStatus?: 'pending' | 'approved' | 'changes-requested';
  sortBy?: 'updated' | 'created';
  applyExplicitReviewerFilter?: boolean;
}
