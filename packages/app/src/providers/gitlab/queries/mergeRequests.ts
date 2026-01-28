/**
 * GitLab GraphQL Queries for Merge Requests
 *
 * GitLab terminology:
 * - Pull Request → Merge Request
 * - Checks → Pipelines
 * - number → iid (internal ID)
 */

// Query for listing merge requests assigned for review
export const MERGE_REQUESTS_LIST_QUERY = `
  query MergeRequestsList($state: MergeRequestState, $first: Int!, $after: String) {
    currentUser {
      reviewRequestedMergeRequests(state: $state, first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          iid
          title
          webUrl
          state
          draft
          createdAt
          updatedAt
          diffStatsSummary {
            additions
            deletions
            fileCount
          }
          sourceBranch
          targetBranch
          project {
            id
            fullPath
            webUrl
          }
          author {
            id
            username
            name
            avatarUrl
          }
          reviewers {
            nodes {
              id
              username
              name
            }
          }
          approvedBy {
            nodes {
              id
              username
              name
            }
          }
          userDiscussionsCount
          headPipeline {
            id
            status
            detailedStatus {
              label
              group
            }
          }
        }
      }
    }
  }
`;

// Query for user's authored merge requests
export const MY_MERGE_REQUESTS_QUERY = `
  query MyMergeRequests($state: MergeRequestState, $first: Int!, $after: String) {
    currentUser {
      authoredMergeRequests(state: $state, first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          iid
          title
          webUrl
          state
          draft
          createdAt
          updatedAt
          diffStatsSummary {
            additions
            deletions
            fileCount
          }
          sourceBranch
          targetBranch
          project {
            id
            fullPath
            webUrl
          }
          author {
            id
            username
            name
            avatarUrl
          }
          reviewers {
            nodes {
              id
              username
              name
            }
          }
          approvedBy {
            nodes {
              id
              username
              name
            }
          }
          userDiscussionsCount
          headPipeline {
            id
            status
            detailedStatus {
              label
              group
            }
          }
        }
      }
    }
  }
`;

// Query for merge request details
// Includes merge status fields for determining if MR is ready to merge
export const MR_DETAILS_QUERY = `
  query MergeRequestDetails($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id
        iid
        title
        webUrl
        state
        draft
        createdAt
        updatedAt
        mergedAt
        # Merge status fields
        mergeable
        mergeableDiscussionsState
        conflicts
        detailedMergeStatus
        # Approval fields
        approved
        approvalsRequired
        approvalsLeft
        # Commit count for change detection
        commitCount
        diffStatsSummary {
          additions
          deletions
          fileCount
        }
        sourceBranch
        targetBranch
        project {
          id
          fullPath
          webUrl
        }
        author {
          id
          username
          name
          avatarUrl
        }
        labels {
          nodes {
            id
            title
            color
          }
        }
        reviewers {
          nodes {
            id
            username
            name
            avatarUrl
            mergeRequestInteraction {
              reviewState
            }
          }
        }
        approvedBy {
          nodes {
            id
            username
            name
          }
        }
        headPipeline {
          id
          status
          detailedStatus {
            label
            group
          }
        }
      }
    }
  }
`;

// Query for merge request discussions (comments/reviews)
export const MR_DISCUSSIONS_QUERY = `
  query MergeRequestDiscussions($projectPath: ID!, $iid: String!, $first: Int!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id
        discussions(first: $first) {
          nodes {
            id
            createdAt
            resolved
            resolvable
            notes {
              nodes {
                id
                body
                createdAt
                updatedAt
                system
                resolvable
                resolved
                position {
                  filePath
                  newLine
                  oldLine
                }
                author {
                  id
                  username
                  name
                  avatarUrl
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Query for merge request pipeline (CI/CD checks)
export const MR_PIPELINE_QUERY = `
  query MergeRequestPipeline($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id
        headPipeline {
          id
          iid
          status
          detailedStatus {
            label
            group
            icon
            text
          }
          stages {
            nodes {
              id
              name
              status
              detailedStatus {
                label
                group
              }
              jobs {
                nodes {
                  id
                  name
                  status
                  detailedStatus {
                    label
                    group
                    action {
                      path
                    }
                  }
                  webPath
                  startedAt
                  finishedAt
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Query for merge request approvals
export const MR_APPROVALS_QUERY = `
  query MergeRequestApprovals($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id
        approved
        approvalsRequired
        approvalsLeft
        approvedBy {
          nodes {
            id
            username
            name
            avatarUrl
          }
        }
        reviewers {
          nodes {
            id
            username
            name
            avatarUrl
            mergeRequestInteraction {
              reviewState
            }
          }
        }
      }
    }
  }
`;

// Query for merge request merge status (used for pre-merge verification)
// This query fetches all fields needed to determine if a MR can be merged
export const MR_MERGE_STATUS_QUERY = `
  query MergeRequestMergeStatus($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      mergeRequest(iid: $iid) {
        id
        iid
        state
        draft
        mergeable
        conflicts
        mergeableDiscussionsState
        detailedMergeStatus
        approvalsRequired
        approvalsLeft
        approved
        headPipeline {
          id
          status
          active
          complete
        }
        diffHeadSha
        targetBranch
        sourceBranch
        commitCount
      }
    }
  }
`;

// Query to get current user
export const CURRENT_USER_QUERY = `
  query CurrentUser {
    currentUser {
      id
      username
      name
      avatarUrl
    }
  }
`;

// Query to get user's projects (repositories)
export const USER_PROJECTS_QUERY = `
  query UserProjects($first: Int!, $after: String, $search: String) {
    projects(
      membership: true
      first: $first
      after: $after
      search: $search
      sort: "latest_activity_desc"
    ) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        fullPath
        name
        namespace {
          fullPath
        }
        description
        visibility
        forkedFrom {
          id
        }
        archived
        starCount
        lastActivityAt
      }
    }
  }
`;
