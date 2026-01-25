/**
 * GitHub GraphQL Queries for Pull Requests
 */

import {
  PR_BASIC_INFO,
  PR_METADATA,
  PR_REVIEWS,
  PR_COMMENTS,
  PR_CHECKS,
  PR_LABELS,
} from './fragments';

// ========== QUERIES DE LISTADO (para obtener múltiples PRs) ==========

// Query MÍNIMA - Solo para listar PRs (más rápida)
export const PULL_REQUESTS_LIST_QUERY = `
  query PullRequestsList($query: String!, $limit: Int!, $after: String) {
    search(query: $query, type: ISSUE, first: $limit, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          state
          isDraft
          repository {
            nameWithOwner
          }
          author {
            login
            avatarUrl
          }
          createdAt
          updatedAt
          additions
          deletions
          changedFiles
          headRefName
          baseRefName
          comments {
            totalCount
          }
          reviews(first: 30) {
            nodes {
              author {
                login
              }
              state
              comments {
                totalCount
              }
            }
          }
          commits(last: 1) {
            totalCount
            nodes {
              commit {
                statusCheckRollup {
                  state
                }
              }
            }
          }
          reviewRequests(first: 25) {
            nodes {
              requestedReviewer {
                __typename
                ... on User {
                  login
                }
                ... on Team {
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Query completa con todos los fragmentos
export const PULL_REQUESTS_FULL_QUERY = `
  query PullRequestsToReview($query: String!, $limit: Int!) {
    search(query: $query, type: ISSUE, first: $limit) {
      nodes {
        ... on PullRequest {
          id
          number
          ...PRBasicInfo
          ...PRMetadata
          ...PRReviews
          ...PRComments
          ...PRChecks
          ...PRLabels
        }
      }
    }
  }
  ${PR_BASIC_INFO}
  ${PR_METADATA}
  ${PR_REVIEWS}
  ${PR_COMMENTS}
  ${PR_CHECKS}
  ${PR_LABELS}
`;

// ========== QUERIES INDIVIDUALES (para obtener detalles de UN PR específico) ==========

// Query para obtener reviews de un PR específico
export const PR_REVIEWS_BY_ID_QUERY = `
  query PullRequestReviews($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        reviews(last: 100) {
          totalCount
          nodes {
            id
            author {
              login
            }
            state
            createdAt
            body
            comments(first: 100) {
              totalCount
              nodes {
                id
                body
                createdAt
                path
                position
              }
            }
          }
        }
      }
    }
  }
`;

// Query para obtener comentarios de un PR específico
export const PR_COMMENTS_BY_ID_QUERY = `
  query PullRequestComments($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        comments(first: 100) {
          totalCount
          nodes {
            id
            author {
              login
            }
            body
            createdAt
            updatedAt
          }
        }
        reviews(first: 50) {
          nodes {
            comments(first: 50) {
              nodes {
                id
                author {
                  login
                }
                body
                createdAt
                updatedAt
                path
                position
              }
            }
          }
        }
      }
    }
  }
`;

// Query para obtener el estado de CI/CD de un PR específico
export const PR_CHECKS_BY_ID_QUERY = `
  query PullRequestChecks($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        commits(last: 1) {
          nodes {
            commit {
              statusCheckRollup {
                state
                contexts(first: 50) {
                  totalCount
                  nodes {
                    ... on CheckRun {
                      __typename
                      id
                      name
                      conclusion
                      status
                      detailsUrl
                      startedAt
                      completedAt
                    }
                    ... on StatusContext {
                      __typename
                      id
                      context
                      state
                      targetUrl
                      createdAt
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// Query para obtener detalles completos de un PR específico
export const PR_DETAILS_BY_ID_QUERY = `
  query PullRequestDetails($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        id
        number
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
        repository {
          nameWithOwner
        }
        author {
          login
          avatarUrl
        }
        labels(first: 10) {
          nodes {
            name
            color
          }
        }
        comments {
          totalCount
        }
        reviews(first: 30) {
          nodes {
            id
            author {
              login
            }
            state
            createdAt
            comments {
              totalCount
            }
          }
        }
        commits(last: 1) {
          totalCount
          nodes {
            commit {
              statusCheckRollup {
                state
              }
            }
          }
        }
      }
    }
  }
`;

// Query para buscar repositorios accesibles por el usuario
export const SEARCH_REPOSITORIES_QUERY = `
  query SearchRepositories($query: String!, $limit: Int!) {
    search(query: $query, type: REPOSITORY, first: $limit) {
      nodes {
        ... on Repository {
          nameWithOwner
          name
          owner {
            login
          }
          description
          isPrivate
          isFork
          isArchived
          stargazerCount
          updatedAt
        }
      }
    }
  }
`;

// Query para obtener repositorios del usuario actual Y de sus organizaciones
export const USER_REPOSITORIES_QUERY = `
  query UserRepositories($limit: Int!, $after: String) {
    viewer {
      repositories(
        first: $limit
        after: $after
        orderBy: { field: UPDATED_AT, direction: DESC }
        affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER]
      ) {
        nodes {
          nameWithOwner
          name
          owner {
            login
          }
          description
          isPrivate
          isFork
          isArchived
          stargazerCount
          updatedAt
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      organizations(first: 20) {
        nodes {
          repositories(first: $limit, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              nameWithOwner
              name
              owner {
                login
              }
              description
              isPrivate
              isFork
              isArchived
              stargazerCount
              updatedAt
            }
          }
        }
      }
    }
  }
`;
