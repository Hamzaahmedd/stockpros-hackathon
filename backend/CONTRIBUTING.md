# Contributing to Stock Web App

Thank you for contributing to Stock Web App! Follow this guide to maintain a consistent workflow and branch structure.

## Branching Strategy

We follow an industry-standard Git workflow:

```
            production (Stable Production Code)
                ↑
                |
                |
               main (Latest Stable Development)
                ↑
         -----------------------
         |         |          |
      feat/*   test/*    hotfix/*
   (Features) (Testing) (Critical Fixes)
```

### Branch Types

- **`main` (Protected):** Stable development code. All pull requests merge here.
- **`production` (Protected):** Live production code. Only merges from `main`.
- **`feat/{feature-name}`:** Feature branches created from `main`.
- **`test/{alpha|beta}/{feature-name}`:** Testing branches for alpha or beta testing.
- **`hotfix/{issue-name}`:** Hotfix branches created from `production` for critical fixes.

## Workflow for Feature Development

```bash
git checkout main
git pull origin main
git checkout -b feat/{feature-name}
# Develop your feature
git add .
git commit -m "feat: description of feature"
git push origin feat/{feature-name}
```

Open a pull request (PR) to `main`. Ensure all checks pass and receive approval before merging.

## Workflow for Hotfixes

```bash
git checkout production
git pull origin production
git checkout -b hotfix/{issue-name}
# Fix the issue
git add .
git commit -m "fix: description of hotfix"
git push origin hotfix/{issue-name}
```

Open a pull request to both `production` and `main`.

## Versioning (Semantic Versioning)

- **Major (X):** Breaking changes.
- **Minor (Y):** New features.
- **Patch (Z):** Bug fixes.

Tag releases on `production` using GitHub Releases:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

## Commit Message Guidelines (Conventional Commits)

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Formatting changes (no code impact)
- `refactor:` Code restructuring
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## Pull Request Guidelines

- Use descriptive titles (e.g., "feat: add payment gateway")
- Link related issues (e.g., `Closes #123`)
- Provide a summary of changes
- Request a review from relevant team members

## Testing Requirements

- Write unit and integration tests for all major changes.
- Ensure CI/CD checks pass before merging.

## Protected Branch Policies

- **`main` & `production`** are protected. Direct pushes are not allowed.
- PR merges require at least one approval and passing CI checks.
