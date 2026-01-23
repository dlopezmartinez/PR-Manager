/**
 * GitHub GraphQL Fragments
 * Reusable fragments for PR queries
 */

// Fragmento para información básica del PR
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

// Fragmento para información del repositorio y autor
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

// Fragmento para reviews
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

// Fragmento para comentarios
export const PR_COMMENTS = `
  fragment PRComments on PullRequest {
    comments(first: 100) {
      totalCount
    }
  }
`;

// Fragmento para commits y checks
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

// Fragmento para labels
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
