# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm install
npm run build          # esbuild → out/extension.js (dev, with sourcemap)
npm run build:prod     # minified, no sourcemap
npm run build:watch    # rebuild on change

npm run test:unit                                    # all unit tests
npm run compile-tests && npx mocha 'out-test/test/unit/**/x.test.js'   # one file (after compile-tests)
npm run test:integration   # downloads VS Code via @vscode/test-electron, runs in real Extension Host
npm test                   # both

npm run package        # build:prod + vsce package → vscode-css-modules-<ver>.vsix
```

F5 in VS Code launches an Extension Development Host. The second launch config opens `test/fixtures/monorepo-alias/` as the workspace — useful for end-to-end poking.

Unit tests must be **compiled** before running because they reference compiled `out-test/...` paths (Mocha runs against JS, not TS). `npm run test:unit` does both steps.

## Architecture

The extension is split into three layers with a strict dependency direction:

```
src/extension.ts  ──► src/services/  ──► src/core/
src/vscodeAdapter.ts                       ▲
                                           │ (no `vscode` import)
```

- **`src/core/`** — pure logic. Takes string paths, never `vscode.Uri`. Every module is unit-testable from plain Node. **Do not import `vscode` here.**
- **`src/services/`** — caches + watcher wiring. Imports `vscode` and wraps the core caches.
- **`src/extension.ts` + `src/vscodeAdapter.ts`** — `activate()`, provider registration, and converting `DefinitionTarget` (1-based) into `vscode.LocationLink` (0-based).

### Resolver decision tree (`src/core/resolver.ts`)

`resolveDefinitionAt` is the only entry point. It runs three checks in order:

1. **Cursor on an import string** (`'./x.module.css'`) → resolve specifier, return CSS file at line 1.
2. **Cursor on a property access** (`styles.foo` or `styles["foo"]`) where the LHS matches a default/namespace binding → look up the class in the CSS index. If found, jump to selector; if not, jump to line 1 of the CSS file.
3. **Cursor on the binding identifier itself** (`styles` in `styles.foo`, or `<div className={styles}>`) → CSS file at line 1. Skipped if the identifier is inside its own `import` declaration (so VS Code's TS provider still owns that case).

Returning `null` falls through to VS Code's "No definition found" UX. Returning `[{filePath, line: 1, column: 1}]` is the "I found the file but not the symbol" signal.

### Caching model

Two layers of cache, both designed to survive missed file-watcher events via mtime checks:

- `TsconfigCache` is thin — `findTsconfigFor` (dir → tsconfig path) and `loadTsconfig` (configPath → parsed) each hold their own `Map` keyed on mtime. Watcher invalidation calls `invalidateAll()` because a new `tsconfig.json` anywhere can flip ancestor resolution for many files.
- `CssIndexCache` holds parsed indexes keyed on mtime. If the CSS file is open in an editor, it parses from the live buffer instead (via the `DocumentReader` injected from `extension.ts`); this keeps F12 working against unsaved edits.

### Position conventions

Core returns **1-based** `line`/`column` (matching postcss conventions). `vscodeAdapter.toLocationLinks` subtracts 1 when constructing `vscode.Position`. Don't mix conventions inside `src/core/`.

### Locked design decisions (from PLAN.md)

- `*.module.css` only; no SCSS/Less/Stylus.
- Plain `.foo` class selectors + selectors inside `:global(...)` / `:local(...)`. No `composes:` chasing. No camelCase ↔ kebab-case transformation.
- `paths` are read from the **leaf** tsconfig as-is — **not** merged across the `extends` chain. Each leaf is expected to declare its own `paths`. (If you need to support paths declared on a base config, you'd resolve against `parsed.options.pathsBasePath`, but that's an explicit deviation from the current design.)
- No `tsserver`/`tsgo` interaction. The extension uses the bundled TS compiler API only for `ts.createSourceFile` (scan TSX) and `ts.parseJsonConfigFileContent` (read tsconfigs).
- Targets a private `.vsix`. `vsce publish` is wired but not invoked.

### Test compilation layout

`tsconfig.test.json` sets `rootDir: '.'` and includes both `src/**` and `test/**`, producing:

```
out-test/
  src/...              (compiled core, for unit tests to import)
  test/unit/...        (compiled mocha tests)
  test/integration/... (compiled integration runner + suite)
```

Unit tests import core modules via relative paths (`../../src/core/...`), which the compiler rewrites cleanly into `out-test/test/unit/../../src/core/...`. Don't break this by changing rootDir.

### Integration tests: activation race

The Extension Host queues activation asynchronously when a `typescriptreact` document is opened. Calling `executeDefinitionProvider` before activation completes returns nothing. `test/integration/suite/definition.test.ts` uses a `before` hook that calls `vscode.extensions.getExtension('katis.vscode-css-modules').activate()` to force activation before the first test. Keep that hook in any new test file that exercises the provider as its first call.

## When extending the resolver

If you're adding a new GTD case:

1. Add the matching logic in `src/core/resolver.ts` — keep it pure, return a `DefinitionTarget`.
2. If you need new binding info, extend `CssModuleBinding` and `scanTsxForCssModules` in `src/core/tsImportScanner.ts`.
3. Write a unit test in `test/unit/resolver.test.ts` using the existing fixtures or extend them under `test/fixtures/`.
4. Add an integration test if the behavior depends on real VS Code APIs (e.g. `LocationLink` shape, document open state).
