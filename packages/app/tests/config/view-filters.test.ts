/**
 * Tests for view-filters.ts
 * Tests predefined filters and sorters for PR views
 */

import { describe, it, expect } from 'vitest';
import {
  FILTERS,
  SORTERS,
  getFilterById,
  getSorterById,
  getAllFilters,
  getAllSorters,
  type FilterId,
  type SorterId,
} from '../../src/config/view-filters';
import type { PullRequestBasic } from '../../src/model/types';

// Mock PR data for testing
const createMockPR = (overrides: Partial<PullRequestBasic> = {}): PullRequestBasic => ({
  id: 'PR_1',
  number: 1,
  title: 'Test PR',
  url: 'https://github.com/test/repo/pull/1',
  state: 'OPEN',
  isDraft: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-02T00:00:00Z',
  author: { login: 'testuser', avatarUrl: '' },
  repository: { nameWithOwner: 'test/repo' },
  headRefName: 'feature-branch',
  baseRefName: 'main',
  reviewDecision: null,
  mergeable: 'MERGEABLE',
  reviewRequests: { nodes: [] },
  reviews: { nodes: [] },
  comments: { totalCount: 0 },
  commits: { nodes: [] },
  ...overrides,
});

describe('view-filters', () => {
  describe('FILTERS', () => {
    it('should have all expected filter IDs', () => {
      const expectedIds: FilterId[] = [
        'none',
        'is-draft',
        'not-draft',
        'has-comments',
        'no-comments',
        'needs-review',
        'approved',
        'changes-requested',
        'my-review-requested',
        'not-my-pr',
      ];

      expectedIds.forEach((id) => {
        expect(FILTERS[id]).toBeDefined();
        expect(FILTERS[id].id).toBe(id);
        expect(FILTERS[id].fn).toBeInstanceOf(Function);
      });
    });

    describe('none filter', () => {
      it('should always return true', () => {
        const pr = createMockPR();
        expect(FILTERS['none'].fn(pr, 'anyuser')).toBe(true);
      });
    });

    describe('is-draft filter', () => {
      it('should return true for draft PRs', () => {
        const pr = createMockPR({ isDraft: true });
        expect(FILTERS['is-draft'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for non-draft PRs', () => {
        const pr = createMockPR({ isDraft: false });
        expect(FILTERS['is-draft'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('not-draft filter', () => {
      it('should return true for non-draft PRs', () => {
        const pr = createMockPR({ isDraft: false });
        expect(FILTERS['not-draft'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for draft PRs', () => {
        const pr = createMockPR({ isDraft: true });
        expect(FILTERS['not-draft'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('has-comments filter', () => {
      it('should return true for PRs with comments', () => {
        const pr = createMockPR({ comments: { totalCount: 5 } });
        expect(FILTERS['has-comments'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for PRs without comments', () => {
        const pr = createMockPR({ comments: { totalCount: 0 } });
        expect(FILTERS['has-comments'].fn(pr, 'testuser')).toBe(false);
      });

      it('should handle undefined comments', () => {
        const pr = createMockPR();
        delete (pr as any).comments;
        expect(FILTERS['has-comments'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('no-comments filter', () => {
      it('should return true for PRs without comments', () => {
        const pr = createMockPR({ comments: { totalCount: 0 } });
        expect(FILTERS['no-comments'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for PRs with comments', () => {
        const pr = createMockPR({ comments: { totalCount: 3 } });
        expect(FILTERS['no-comments'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('needs-review filter', () => {
      it('should return true for PRs with REVIEW_REQUIRED', () => {
        const pr = createMockPR({ reviewDecision: 'REVIEW_REQUIRED' });
        expect(FILTERS['needs-review'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return true for PRs with null reviewDecision', () => {
        const pr = createMockPR({ reviewDecision: null });
        expect(FILTERS['needs-review'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for approved PRs', () => {
        const pr = createMockPR({ reviewDecision: 'APPROVED' });
        expect(FILTERS['needs-review'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('approved filter', () => {
      it('should return true for approved PRs', () => {
        const pr = createMockPR({ reviewDecision: 'APPROVED' });
        expect(FILTERS['approved'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for non-approved PRs', () => {
        const pr = createMockPR({ reviewDecision: 'CHANGES_REQUESTED' });
        expect(FILTERS['approved'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('changes-requested filter', () => {
      it('should return true for PRs with changes requested', () => {
        const pr = createMockPR({ reviewDecision: 'CHANGES_REQUESTED' });
        expect(FILTERS['changes-requested'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for other PRs', () => {
        const pr = createMockPR({ reviewDecision: 'APPROVED' });
        expect(FILTERS['changes-requested'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('my-review-requested filter', () => {
      it('should return true when user is requested as reviewer', () => {
        const pr = createMockPR({
          reviewRequests: {
            nodes: [
              { requestedReviewer: { __typename: 'User', login: 'testuser' } },
            ],
          },
        });
        expect(FILTERS['my-review-requested'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false when user is not requested', () => {
        const pr = createMockPR({
          reviewRequests: {
            nodes: [
              { requestedReviewer: { __typename: 'User', login: 'otheruser' } },
            ],
          },
        });
        expect(FILTERS['my-review-requested'].fn(pr, 'testuser')).toBe(false);
      });

      it('should return false for empty review requests', () => {
        const pr = createMockPR({ reviewRequests: { nodes: [] } });
        expect(FILTERS['my-review-requested'].fn(pr, 'testuser')).toBe(false);
      });
    });

    describe('not-my-pr filter', () => {
      it('should return true for PRs authored by others', () => {
        const pr = createMockPR({ author: { login: 'otheruser', avatarUrl: '' } });
        expect(FILTERS['not-my-pr'].fn(pr, 'testuser')).toBe(true);
      });

      it('should return false for user\'s own PRs', () => {
        const pr = createMockPR({ author: { login: 'testuser', avatarUrl: '' } });
        expect(FILTERS['not-my-pr'].fn(pr, 'testuser')).toBe(false);
      });
    });
  });

  describe('SORTERS', () => {
    it('should have all expected sorter IDs', () => {
      const expectedIds: SorterId[] = [
        'updated-desc',
        'updated-asc',
        'created-desc',
        'created-asc',
        'comments-desc',
        'comments-asc',
        'title-asc',
        'title-desc',
      ];

      expectedIds.forEach((id) => {
        expect(SORTERS[id]).toBeDefined();
        expect(SORTERS[id].id).toBe(id);
        expect(SORTERS[id].fn).toBeInstanceOf(Function);
      });
    });

    describe('updated-desc sorter', () => {
      it('should sort by updatedAt descending', () => {
        const pr1 = createMockPR({ updatedAt: '2024-01-01T00:00:00Z' });
        const pr2 = createMockPR({ updatedAt: '2024-01-02T00:00:00Z' });

        const sorted = [pr1, pr2].sort(SORTERS['updated-desc'].fn);
        expect(sorted[0].updatedAt).toBe('2024-01-02T00:00:00Z');
        expect(sorted[1].updatedAt).toBe('2024-01-01T00:00:00Z');
      });
    });

    describe('updated-asc sorter', () => {
      it('should sort by updatedAt ascending', () => {
        const pr1 = createMockPR({ updatedAt: '2024-01-02T00:00:00Z' });
        const pr2 = createMockPR({ updatedAt: '2024-01-01T00:00:00Z' });

        const sorted = [pr1, pr2].sort(SORTERS['updated-asc'].fn);
        expect(sorted[0].updatedAt).toBe('2024-01-01T00:00:00Z');
        expect(sorted[1].updatedAt).toBe('2024-01-02T00:00:00Z');
      });
    });

    describe('created-desc sorter', () => {
      it('should sort by createdAt descending', () => {
        const pr1 = createMockPR({ createdAt: '2024-01-01T00:00:00Z' });
        const pr2 = createMockPR({ createdAt: '2024-01-02T00:00:00Z' });

        const sorted = [pr1, pr2].sort(SORTERS['created-desc'].fn);
        expect(sorted[0].createdAt).toBe('2024-01-02T00:00:00Z');
      });
    });

    describe('comments-desc sorter', () => {
      it('should sort by comment count descending', () => {
        const pr1 = createMockPR({ comments: { totalCount: 5 } });
        const pr2 = createMockPR({ comments: { totalCount: 10 } });

        const sorted = [pr1, pr2].sort(SORTERS['comments-desc'].fn);
        expect(sorted[0].comments?.totalCount).toBe(10);
        expect(sorted[1].comments?.totalCount).toBe(5);
      });
    });

    describe('title-asc sorter', () => {
      it('should sort by title alphabetically', () => {
        const pr1 = createMockPR({ title: 'Zebra PR' });
        const pr2 = createMockPR({ title: 'Alpha PR' });

        const sorted = [pr1, pr2].sort(SORTERS['title-asc'].fn);
        expect(sorted[0].title).toBe('Alpha PR');
        expect(sorted[1].title).toBe('Zebra PR');
      });
    });
  });

  describe('getFilterById', () => {
    it('should return the correct filter for valid ID', () => {
      const filter = getFilterById('is-draft');
      expect(filter.id).toBe('is-draft');
    });

    it('should return "none" filter for invalid ID', () => {
      const filter = getFilterById('invalid-id');
      expect(filter.id).toBe('none');
    });

    it('should return "none" filter for undefined', () => {
      const filter = getFilterById(undefined);
      expect(filter.id).toBe('none');
    });
  });

  describe('getSorterById', () => {
    it('should return the correct sorter for valid ID', () => {
      const sorter = getSorterById('created-desc');
      expect(sorter.id).toBe('created-desc');
    });

    it('should return "updated-desc" sorter for invalid ID', () => {
      const sorter = getSorterById('invalid-id');
      expect(sorter.id).toBe('updated-desc');
    });

    it('should return "updated-desc" sorter for undefined', () => {
      const sorter = getSorterById(undefined);
      expect(sorter.id).toBe('updated-desc');
    });
  });

  describe('getAllFilters', () => {
    it('should return all filters as array', () => {
      const filters = getAllFilters();
      expect(Array.isArray(filters)).toBe(true);
      expect(filters.length).toBe(Object.keys(FILTERS).length);
    });
  });

  describe('getAllSorters', () => {
    it('should return all sorters as array', () => {
      const sorters = getAllSorters();
      expect(Array.isArray(sorters)).toBe(true);
      expect(sorters.length).toBe(Object.keys(SORTERS).length);
    });
  });
});
