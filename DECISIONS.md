# Decisions

## Decisions

### Node runtime version
- Decision: which Node version to build on.
- Chosen: Node v26.3.1, already installed.
- Note: Node v26.3.1 (Current, not LTS) is in use. If a dependency fails to install or a native module errors, suspect the Node version first and report it before attempting workarounds.
- Rejected and why: installing Node 20 or 22 LTS alongside it — rejected for now because it means a global toolchain change, and AGENTS.md forbids installing or upgrading globally without asking. Revisit if `@node-rs/argon2` or Prisma's engines fail to build.
- Files: (none yet; will affect package.json "engines" and any CI setup)

### Repository layout
- Decision: whether auth-slice is its own repository or a folder inside the parent repo at C:\Users\HP\Documents\build-assessments.
- Chosen: standalone repository at auth-slice/, initialised with its own .git.
- Rejected and why: committing into the parent repo — rejected because the owner wants this assessment to be reviewable on its own. The parent repo is to be left completely untouched: no commits, no .gitignore edits, no git commands run from it.
- Files: .git/, .gitignore

### Default branch name
- Decision: default branch name for this repository.
- Chosen: main.
- Rejected and why: master, which `git init` produced by default — renamed to match the owner's other repository and the common GitHub default.
- Files: (none)

## Deliberately excluded
