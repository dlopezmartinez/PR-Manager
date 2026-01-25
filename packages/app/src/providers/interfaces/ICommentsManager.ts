import type { Comment } from '../../model/types';

export interface CommentsStats {
  total: number;
  byAuthor: Map<string, number>;
  recent: Comment[];
}

export interface ICommentsManager {
  getComments(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<Comment[]>;
  getCommentsStats(comments: Comment[]): CommentsStats;
  clearCommentsCache(owner?: string, repo?: string, prNumber?: number): void;
  clearCache(): void;
}
