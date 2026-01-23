/**
 * GitLabCommentsManager - Manages comment operations for GitLab
 * Implements ICommentsManager interface
 *
 * In GitLab, comments are represented as "notes" within "discussions"
 */

import type { Comment } from '../../../model/types';
import type { ICommentsManager, CommentsStats } from '../../interfaces';
import { CacheableManager } from '../../base/CacheableManager';
import { GitLabService } from '../GitLabService';
import { MR_DISCUSSIONS_QUERY } from '../queries/mergeRequests';
import type { GitLabDiscussionsResponse } from '../adapters/GitLabResponseAdapter';
import { GitLabResponseAdapter } from '../adapters/GitLabResponseAdapter';

export class GitLabCommentsManager extends CacheableManager<Comment[]> implements ICommentsManager {
  private gitlabService: GitLabService;

  constructor(gitlabService: GitLabService) {
    super('GitLabCommentsManager');
    this.gitlabService = gitlabService;
  }

  /**
   * Get comments for a specific merge request
   */
  async getComments(
    owner: string,
    repo: string,
    prNumber: number,
    useCache = true
  ): Promise<Comment[]> {
    const projectPath = `${owner}/${repo}`;
    const cacheKey = `${projectPath}/${prNumber}`;

    return this.getOrFetch(
      cacheKey,
      async () => {
        const result = await this.gitlabService.executeQuery<GitLabDiscussionsResponse>(
          MR_DISCUSSIONS_QUERY,
          { projectPath, iid: String(prNumber), first: 100 }
        );

        const discussions = result.data.project.mergeRequest.discussions.nodes;
        return GitLabResponseAdapter.transformDiscussionsToComments(discussions);
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
