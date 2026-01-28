/**
 * GitHub GraphQL Mutations for Quick Actions
 * Allows approve, request changes, comment, and merge operations
 */

// Approve PR or Request Changes mutation
export const ADD_PULL_REQUEST_REVIEW_MUTATION = `
  mutation AddPullRequestReview($input: AddPullRequestReviewInput!) {
    addPullRequestReview(input: $input) {
      pullRequestReview {
        id
        state
        body
        createdAt
        author {
          login
          avatarUrl
        }
      }
    }
  }
`;

// Add comment to PR (issue comment, not review comment)
export const ADD_COMMENT_MUTATION = `
  mutation AddComment($input: AddCommentInput!) {
    addComment(input: $input) {
      commentEdge {
        node {
          id
          body
          createdAt
          author {
            login
            avatarUrl
          }
        }
      }
    }
  }
`;

// Merge PR mutation
export const MERGE_PULL_REQUEST_MUTATION = `
  mutation MergePullRequest($input: MergePullRequestInput!) {
    mergePullRequest(input: $input) {
      pullRequest {
        id
        number
        state
        merged
        mergedAt
        url
      }
    }
  }
`;

// Get PR node ID from number (needed for mutations that require node ID)
export const GET_PR_NODE_ID_QUERY = `
  query GetPRNodeId($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      squashMergeAllowed
      mergeCommitAllowed
      rebaseMergeAllowed
      pullRequest(number: $number) {
        id
        mergeable
        viewerCanMergeAsAdmin
        mergeStateStatus
      }
    }
  }
`;
