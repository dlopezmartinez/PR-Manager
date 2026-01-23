import type { StatusCheckRollup, CheckContext } from '../../model/types';

export interface ChecksSummary {
  state: string;
  total: number;
  success: number;
  failure: number;
  pending: number;
  neutral: number;
  failedChecks: CheckContext[];
  pendingChecks: CheckContext[];
}

export interface IChecksManager {
  getChecks(
    owner: string,
    repo: string,
    prNumber: number,
    useCache?: boolean
  ): Promise<StatusCheckRollup | null>;
  getChecksSummary(rollup: StatusCheckRollup | null): ChecksSummary;
  areChecksPassing(rollup: StatusCheckRollup | null): boolean;
  clearChecksCache(owner?: string, repo?: string, prNumber?: number): void;
  clearCache(): void;
}
