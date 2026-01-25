import type {
  ApproveResult,
  RequestChangesResult,
  CommentResult,
  MergeResult,
  MergeMethod,
} from '../../model/mutation-types';

export interface MergeOptions {
  commitHeadline?: string;
  commitBody?: string;
  mergeMethod?: MergeMethod;
}

export interface PRNodeIdResult {
  id: string;
  mergeable: string;
  canMerge: boolean;
}

export interface IActionsManager {
  isActionPending(prId: string): boolean;
  getPRNodeId(owner: string, repo: string, prNumber: number): Promise<PRNodeIdResult>;
  approvePullRequest(pullRequestId: string, body?: string): Promise<ApproveResult>;
  requestChanges(pullRequestId: string, body: string): Promise<RequestChangesResult>;
  addComment(pullRequestId: string, body: string): Promise<CommentResult>;
  mergePullRequest(pullRequestId: string, options?: MergeOptions): Promise<MergeResult>;
  parseRepo(repoString: string): { owner: string; repo: string } | null;
}
