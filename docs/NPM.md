# Publishing to npm (`@feralxr/archivist`)

Package name: **`@feralxr/archivist`**  
Binary: **`archivist`** (unchanged)

## One-time

```bash
npm login
npm whoami
```

Confirm the scope exists (your npm user or org `feralxr`).

## Publish

```bash
cd archivist
npm install
npm run typecheck
npm run test:core
npm version patch   # or use current 0.4.0
npm publish --access public
git push --tags
```

## Install for users

```bash
npm install -g @feralxr/archivist
# or
npx @feralxr/archivist doctor
```

After global install the command is still `archivist` via the `bin` field.

## CI publish (optional)

Store `NPM_TOKEN` in GitHub Actions secrets only — never in the repo.
