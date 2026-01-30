/**
 * GitHub GraphQL Fragments
 */

export const PR_BASIC_INFO = `
  fragment PRBasicInfo on PullRequest {
    title
    url
    state
    createdAt
    updatedAt
    additions
    deletions
    changedFiles
    isDraft
    mergeable
  }
`;

export const PR_METADATA = `
  fragment PRMetadata on PullRequest {
    repository {
      nameWithOwner
    }
    author {
      login
    }
  }
`;

export const PR_REVIEWS = `
  fragment PRReviews on PullRequest {
    reviews(last: 100) {
      totalCount
      nodes {
        author {
          login
        }
        state
        createdAt
        comments(first: 100) {
          totalCount
        }
      }
    }
  }
`;

export const PR_COMMENTS = `
  fragment PRComments on PullRequest {
    comments(first: 100) {
      totalCount
    }
  }
`;

export const PR_CHECKS = `
  fragment PRChecks on PullRequest {
    commits(last: 1) {
      nodes {
        commit {
          statusCheckRollup {
            state
            contexts(first: 20) {
              nodes {
                ... on CheckRun {
                  name
                  conclusion
                  status
                }
                ... on StatusContext {
                  context
                  state
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const PR_LABELS = `
  fragment PRLabels on PullRequest {
    labels(first: 10) {
      nodes {
        name
        color
      }
    }
  }
`;
