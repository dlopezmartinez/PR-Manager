/**
 * GitHubCommentsManager - Manages comment operations for GitHub
 * Implements ICommentsManager interface
 */

import type { Comment } from '../../../model/types';
import type { ICommentsManager, CommentsStats } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitHubService } from '../GitHubService';
import { PR_COMMENTS_BY_ID_QUERY } from '../queries/pullRequests';
import type { GitHubCommentsResponse } from '../adapters/GitHubResponseAdapter';
import { GitHubResponseAdapter } from '../adapters/GitHubResponseAdapter';

export class GitHubCommentsManager extends CacheableManager<Comment[]> implements ICommentsManager {
  private githubService: GitHubService;

  constructor(githubService: GitHubService) {
    super('GitHubCommentsManager');
    this.githubService = githubService;
  }

  /**
   * Get comments for a specific pull request
   */
  async getComments(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<Comment[]> {
    const cacheKey = `${owner}/${repo}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.githubService.executeQuery<GitHubCommentsResponse>(
          PR_COMMENTS_BY_ID_QUERY,
          { owner, repo, number: prNumber }
        );
        return GitHubResponseAdapter.transformComments(result);
      },
      useCache
    );
  }

  /**
   * Get statistics about comments
   */
  getCommentsStats(comments: Comment[]): CommentsStats {
    const byAuthor = new Map<string, number>();

    comments.forEach((comment) => {
      const count = byAuthor.get(comment.author.login) || 0;
      byAuthor.set(comment.author.login, count + 1);
    });

    // Most recent comments (last 5)
    const recent = [...comments]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      total: comments.length,
      byAuthor,
      recent,
    };
  }

  /**
   * Clear the comments cache
   */
  clearCommentsCache(owner?: string, repo?: string, prNumber?: number): void {
    if (owner && repo && prNumber) {
      this.invalidate(`${owner}/${repo}/${prNumber}`);
    } else {
      this.clearCache();
    }
  }
}
