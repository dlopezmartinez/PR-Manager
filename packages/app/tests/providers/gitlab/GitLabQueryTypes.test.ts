import { describe, it, expect } from 'vitest';
import {
  isGitLabStructuredQuery,
  parseGitLabQuery,
  serializeGitLabQuery,
  buildGitLabQueryFilter,
  convertLegacyQueryToGitLabFilter,
  type GitLabQueryFilter,
} from '../../../src/providers/gitlab/types/GitLabQueryTypes';

describe('GitLabQueryTypes', () => {
  describe('isGitLabStructuredQuery', () => {
    it('should return true for JSON queries', () => {
      expect(isGitLabStructuredQuery('{"type":"authored"}')).toBe(true);
      expect(isGitLabStructuredQuery('  {"type":"all"}')).toBe(true);
    });

    it('should return false for legacy queries', () => {
      expect(isGitLabStructuredQuery('is:pr is:open')).toBe(false);
      expect(isGitLabStructuredQuery('author:username')).toBe(false);
      expect(isGitLabStructuredQuery('')).toBe(false);
    });
  });

  describe('parseGitLabQuery', () => {
    it('should parse valid JSON queries', () => {
      const query = '{"type":"authored","state":"opened"}';
      const result = parseGitLabQuery(query);

      expect(result).toEqual({
        type: 'authored',
        state: 'opened',
      });
    });

    it('should parse queries with all fields', () => {
      const query = JSON.stringify({
        type: 'all',
        state: 'merged',
        authorUsername: 'john',
        reviewerUsername: 'jane',
        labels: ['bug', 'urgent'],
        projectPaths: ['group/project'],
        draft: false,
        orderBy: 'updated_desc',
      });

      const result = parseGitLabQuery(query);

      expect(result).toEqual({
        type: 'all',
        state: 'merged',
        authorUsername: 'john',
        reviewerUsername: 'jane',
        labels: ['bug', 'urgent'],
        projectPaths: ['group/project'],
        draft: false,
        orderBy: 'updated_desc',
      });
    });

    it('should return null for non-JSON queries', () => {
      expect(parseGitLabQuery('is:pr author:user')).toBe(null);
    });

    it('should return null for invalid JSON', () => {
      expect(parseGitLabQuery('{invalid json}')).toBe(null);
    });
  });

  describe('serializeGitLabQuery', () => {
    it('should serialize a query filter to JSON', () => {
      const filter: GitLabQueryFilter = {
        type: 'review-requested',
        state: 'opened',
        reviewerUsername: '{{username}}',
      };

      const result = serializeGitLabQuery(filter);
      expect(JSON.parse(result)).toEqual(filter);
    });
  });

  describe('buildGitLabQueryFilter', () => {
    it('should build a basic authored query', () => {
      const result = buildGitLabQueryFilter({
        type: 'authored',
      });

      expect(result).toEqual({
        type: 'authored',
        state: 'opened',
      });
    });

    it('should build a query with all options', () => {
      const result = buildGitLabQueryFilter({
        type: 'all',
        state: 'merged',
        authorUsername: 'john',
        reviewerUsername: 'jane',
        labels: ['bug'],
        projectPaths: ['group/repo'],
        draft: false,
        orderBy: 'created_desc',
      });

      expect(result).toEqual({
        type: 'all',
        state: 'merged',
        authorUsername: 'john',
        reviewerUsername: 'jane',
        labels: ['bug'],
        projectPaths: ['group/repo'],
        draft: false,
        orderBy: 'created_desc',
      });
    });

    it('should not include empty arrays', () => {
      const result = buildGitLabQueryFilter({
        type: 'authored',
        labels: [],
        projectPaths: [],
      });

      expect(result.labels).toBeUndefined();
      expect(result.projectPaths).toBeUndefined();
    });
  });

  describe('convertLegacyQueryToGitLabFilter', () => {
    it('should convert author query', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr author:john');

      expect(result.type).toBe('authored');
      expect(result.authorUsername).toBe('john');
    });

    it('should convert review-requested query', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr review-requested:jane');

      expect(result.type).toBe('review-requested');
      expect(result.reviewerUsername).toBe('jane');
    });

    it('should convert reviewer query', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr reviewer:jane');

      expect(result.type).toBe('review-requested');
      expect(result.reviewerUsername).toBe('jane');
    });

    it('should handle @me placeholder', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr author:@me');

      expect(result.type).toBe('authored');
      // @me is replaced with {{username}} placeholder
      expect(result.authorUsername).toBeUndefined(); // @me is stripped
    });

    it('should convert state filters', () => {
      expect(convertLegacyQueryToGitLabFilter('is:open').state).toBe('opened');
      expect(convertLegacyQueryToGitLabFilter('is:closed').state).toBe('closed');
      expect(convertLegacyQueryToGitLabFilter('is:merged').state).toBe('merged');
      expect(convertLegacyQueryToGitLabFilter('state:opened').state).toBe('opened');
    });

    it('should convert draft filter', () => {
      expect(convertLegacyQueryToGitLabFilter('is:pr -is:draft').draft).toBe(false);
      expect(convertLegacyQueryToGitLabFilter('is:pr is:draft').draft).toBe(true);
      expect(convertLegacyQueryToGitLabFilter('is:pr').draft).toBeUndefined();
    });

    it('should convert labels', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr label:bug label:urgent');

      expect(result.labels).toEqual(['bug', 'urgent']);
    });

    it('should convert repo filters to project paths', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr repo:group/project repo:other/repo');

      expect(result.projectPaths).toEqual(['group/project', 'other/repo']);
    });

    it('should handle complex query with multiple filters', () => {
      const query = 'is:pr is:open author:john label:bug repo:mygroup/myrepo -is:draft';
      const result = convertLegacyQueryToGitLabFilter(query);

      expect(result).toEqual({
        type: 'authored',
        state: 'opened',
        authorUsername: 'john',
        labels: ['bug'],
        projectPaths: ['mygroup/myrepo'],
        draft: false,
      });
    });

    it('should default to all type when no author/reviewer specified', () => {
      const result = convertLegacyQueryToGitLabFilter('is:pr is:open');

      expect(result.type).toBe('all');
    });
  });
});
