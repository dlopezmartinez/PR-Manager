/**
 * GitLab GraphQL Queries for Merge Requests
 */

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
        mergeable
        mergeableDiscussionsState
        conflicts
        detailedMergeStatus
        approved
        approvalsRequired
        approvalsLeft
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

export const MR_MERGE_STATUS_QUERY = `
  query MergeRequestMergeStatus($projectPath: ID!, $iid: String!) {
    project(fullPath: $projectPath) {
      squashOption
      mergeMethod
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
