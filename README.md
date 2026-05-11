# vscode-css-modules

A VS Code extension that adds **Go to Definition** support from TypeScript/React into CSS Modules.

## Features

- F12 on `import styles from './x.module.css'` opens the CSS file.
- F12 on `styles.foo` jumps to the `.foo` selector in the CSS file.
- Honors tsconfig `paths` aliases (e.g. `#components/*` → `./src/components/*`).
- Works across monorepos with multiple `tsconfig.json` files (nearest-ancestor walk).
- Works whether the project type-checks with `tsc` or `tsgo` — no tsserver plugin required.
- Reads `:global(...)` / `:local(...)` selectors and selectors nested in `@media` etc.

## Scope (v1)

- `*.module.css` only (no SCSS/Less/Stylus).
- Plain class selectors. No `composes:` chasing.
- No camelCase ↔ kebab-case transformation.

## Building

```
npm install
npm run build       # bundles to out/extension.js
npm run package     # produces a .vsix
```

Hit F5 in VS Code to launch an Extension Development Host.

## Testing

```
npm run test:unit         # mocha unit tests
npm run test:integration  # spins up a real VS Code via @vscode/test-electron
```
