# vscode-css-modules — Implementation Plan

A VS Code extension providing **Go to Definition** from TypeScript/React files into CSS Modules. Supports tsconfig path aliases, monorepos with multiple tsconfigs, and works in projects that use `tsc` or `tsgo` (no tsserver-plugin dependency).

## Locked design decisions

| Area | Decision |
| --- | --- |
| GTD scope | F12 on the import string opens the `.module.css` file; F12 on `styles.foo` jumps to the `.foo` selector |
| Architecture | **Standalone**. No tsserver/tsgo dependency. Extension owns parsing and resolution. |
| CSS dialects | `*.module.css` only |
| TSX parsing | TypeScript compiler API (`ts.createSourceFile`) bundled with the extension |
| tsconfig discovery | Nearest-ancestor walk from the source file, cached per directory |
| `extends` handling | Each leaf tsconfig is assumed to define its own `paths`. We do not merge `paths` across the extends chain. |
| CSS semantics | Plain `.foo` class selectors + selectors inside `:global(...)` / `:local(...)`. No `composes` resolution, no camelCase ↔ kebab-case transformation. |
| CSS parsing | `postcss` + `postcss-selector-parser` |
| Caching | In-memory caches for tsconfigs and parsed CSS modules; invalidated by `vscode.workspace.createFileSystemWatcher`. TSX parsed on demand from the open buffer. |
| Failure UX | CSS file resolved + selector found → jump to selector. CSS file resolved + selector not found → jump to top of CSS file. CSS file not resolved → return `undefined` (default VS Code "no definition" UX). |
| Languages | `typescriptreact`, `typescript` |
| Testing | Unit tests (resolver/parsers, fixture trees) + `@vscode/test-electron` smoke tests |
| Distribution | Private `.vsix`, bundled with esbuild. `publish` script wired but not invoked. |

---

## Phase 0 — Project bootstrap

**Goal:** A skeleton extension that activates on `.tsx` and registers a no-op DefinitionProvider.

**Deliverables**

- `package.json` with:
  - `engines.vscode` pinned to a recent LTS (e.g. `^1.95.0`).
  - `activationEvents`: `onLanguage:typescriptreact`, `onLanguage:typescript`.
  - `contributes.languages` empty (we don't add a language); `main` → `out/extension.js`.
  - Dependencies: `typescript`, `postcss`, `postcss-selector-parser`.
  - DevDeps: `@types/vscode`, `@types/node`, `esbuild`, `vsce`, `@vscode/test-electron`, `mocha`, `@types/mocha`.
- `tsconfig.json` for the extension itself (target ES2022, module CommonJS, strict on).
- `src/extension.ts` exporting `activate(context)` that registers a `DefinitionProvider` returning `undefined` for both languages.
- `.vscodeignore` excluding `src/`, `test/`, `node_modules/typescript/lib` doc files, etc.
- README stub (no marketplace listing yet).
- `.vscode/launch.json` with an "Extension Development Host" config (F5 to run).

**Exit criteria**

- `npm run build` produces `out/extension.js`.
- F5 launches an Extension Host; opening a `.tsx` file activates the extension (verified by a `console.log` in `activate`).

---

## Phase 1 — Core resolver pipeline (pure logic, no VS Code APIs)

All modules in this phase live in `src/core/` and take plain string paths, not `vscode.Uri`. This lets us unit-test everything without spinning up an Extension Host.

### 1a. `tsconfigLoader.ts`

Responsible for: given an absolute path to a `tsconfig.json`, return a normalized object:

```ts
type LoadedTsconfig = {
  configPath: string;        // absolute path to the tsconfig.json
  baseDir: string;           // dirname(configPath), used as the implicit base for relative paths
  paths: Array<{
    pattern: string;         // e.g. "#*"
    prefix: string;          // "#"          (literal portion before "*")
    suffix: string;          // ""           (literal portion after "*")
    targets: string[];       // absolute, with "*" preserved: ["/repo/apps/web/src/*"]
  }>;
};
```

Implementation notes:

- Use `ts.readConfigFile` + `ts.parseJsonConfigFileContent` to honor JSON-with-comments and `extends` (TypeScript resolves the chain for us). We do **not** attempt to merge `paths` across extends — we only read the `paths` field as resolved on the final config. Per the agreed assumption, each tsconfig has its own `paths`.
- If `baseUrl` is absent (the example has no `baseUrl`, just `moduleResolution: "Bundler"`), use the tsconfig's directory as the base for resolving relative `paths` targets. This matches `Bundler` semantics.
- Cache key: `configPath` + `mtime` of the file. mtime is captured in this module so the cache can detect changes even when watcher events are missed.

### 1b. `tsconfigFinder.ts`

Given an absolute file path, walk up directories looking for the first `tsconfig.json` (skip `node_modules/`). Cache `dir → tsconfigPath`. Also cache negative results (`dir → null` if no tsconfig found before workspace root).

Edge cases:

- `tsconfig.base.json` and similar are **not** picked up by the walk (we look only for the exact name `tsconfig.json`). The base is reached via `extends` from a leaf tsconfig.
- If the file lives outside any workspace folder, return `null` (we cannot resolve).

### 1c. `pathResolver.ts`

Given an importing file's absolute path, the `LoadedTsconfig` for that file, and an import specifier (e.g. `"#components/Button.module.css"` or `"./Button.module.css"`), return an array of candidate absolute paths to try, in order.

```ts
function resolveImport(
  importerPath: string,
  tsconfig: LoadedTsconfig | null,
  specifier: string,
): string[]
```

Logic:

1. If `specifier` starts with `./` or `../`, return `[path.resolve(dirname(importerPath), specifier)]`.
2. Otherwise, if `tsconfig` is non-null, walk `tsconfig.paths` in declaration order:
   - For each pattern with wildcard: match `prefix + "*" + suffix` against `specifier`. Capture the wildcard substring.
   - For each pattern without wildcard: match exactly.
   - For each matched target, substitute the wildcard and produce an absolute candidate path.
3. If no patterns match and the specifier is bare (no `./`), return `[]` — we have no convention for `node_modules`-style CSS modules.

This module does **not** touch the filesystem; it returns *candidates*. The caller decides which exist.

### 1d. `cssIndex.ts`

Parses a `.module.css` file and returns a map from class-name → position.

```ts
type CssIndex = {
  filePath: string;
  mtime: number;
  selectors: Map<string, { line: number; column: number }>; // first occurrence wins
};

function indexCssModule(filePath: string, source: string): CssIndex
```

Implementation:

- Run `postcss.parse(source)` to walk rules.
- For each rule, run its selector through `postcss-selector-parser`.
- Walk the parsed selector tree; for each class node, record the class name → start position of the **first class node** in that selector list.
- Also descend into `:global(...)` / `:local(...)` pseudo-selectors and harvest their inner class nodes.
- If a class name appears multiple times, keep the first occurrence. Document this in code with a one-line comment.

### 1e. `tsImportScanner.ts`

Parses a TSX/TS source and produces a small model of CSS-module bindings in that file.

```ts
type CssModuleBinding =
  | { kind: 'default'; localName: string; specifier: string; importNode: ts.Node }
  | { kind: 'namespace'; localName: string; specifier: string; importNode: ts.Node }
  | { kind: 'named'; localName: string; specifier: string; importNode: ts.Node }; // rare for CSS modules

type ScanResult = {
  bindings: CssModuleBinding[];           // only for specifiers ending in ".module.css"
  stringLiterals: Array<{                  // for F12 on the import string itself
    specifier: string;
    range: { start: number; end: number }; // positions of the string content, not the quotes
  }>;
};

function scanTsxForCssModules(source: string, fileName: string): ScanResult
```

Implementation:

- `ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKindFromFileName(fileName))`.
- Walk top-level statements; match `ImportDeclaration` whose `moduleSpecifier.text` ends in `.module.css`.
- Capture default specifier, namespace specifier, and named specifiers (last is uncommon for CSS modules but cheap to support).
- For each `stringLiterals` entry, store the inner-text positions so we can match a cursor offset against the literal range.

This module does **not** resolve the import — that's the caller's job (calls `pathResolver`).

### 1f. `resolver.ts` — the top-level pure function

Combines everything for a single F12 request:

```ts
type DefinitionTarget = { filePath: string; line: number; column: number };

function resolveDefinitionAt(args: {
  documentPath: string;
  documentText: string;
  cursorOffset: number;
  loadTsconfig: (filePath: string) => LoadedTsconfig | null; // injected to allow caching
  loadCssIndex: (cssPath: string) => CssIndex | null;        // injected, returns null if file missing
}): DefinitionTarget | DefinitionTarget[] | null
```

Decision tree:

1. Scan TSX with `tsImportScanner`.
2. Is the cursor inside one of `stringLiterals`?
   - **Yes**: resolve specifier with `pathResolver`. Return the first candidate whose file exists, as `{ line: 0, column: 0 }`. If none exist, return `null`.
3. Otherwise, is the cursor on a property name in `binding.localName.X` (or `binding.localName["X"]`)?
   - Find the binding for `localName`. Resolve its specifier. Load `CssIndex` for the resolved file. Look up `X`. If found, return `{ filePath, line, column }`. If not found, return `{ filePath, line: 0, column: 0 }` (jump to top of file). If the CSS file itself doesn't exist, return `null`.
4. Otherwise, return `null`.

**Exit criteria for Phase 1**

- Every module above is exported from `src/core/index.ts`.
- The pure-logic pipeline can be exercised from a Node script (`node -e`) against a fixture tree without any VS Code dependency.

---

## Phase 2 — VS Code integration

All glue in `src/extension.ts` and `src/vscodeAdapter.ts`. Goal: turn the pure-logic resolver into a real `DefinitionProvider`.

### 2a. DefinitionProvider registration

```ts
const provider: vscode.DefinitionProvider = {
  provideDefinition(document, position) {
    const offset = document.offsetAt(position);
    const result = resolveDefinitionAt({
      documentPath: document.fileName,
      documentText: document.getText(),
      cursorOffset: offset,
      loadTsconfig: services.tsconfigCache.get,
      loadCssIndex: services.cssIndexCache.get,
    });
    if (!result) return undefined;
    return toLocations(result);
  }
};

context.subscriptions.push(
  vscode.languages.registerDefinitionProvider(
    [{ language: 'typescriptreact' }, { language: 'typescript' }],
    provider,
  ),
);
```

### 2b. Range hinting (so VS Code shows a definition hover preview)

`provideDefinition` may return a `LocationLink[]` instead of `Location[]`. `LocationLink.originSelectionRange` lets VS Code highlight the exact word/string the user invoked on. Wire this up so the hover card and Ctrl-hover behave naturally:

- For `styles.foo`, the origin range is the `foo` identifier.
- For the import string, the origin range is the inner text of the literal.

### 2c. Cancellation

Honor the `CancellationToken` passed to `provideDefinition`. Bail out before reading the CSS file if cancelled — important for fast-typing users who trigger hover repeatedly.

**Exit criteria**

- Manually open the example monorepo, press F12 on `styles.primaryAction` → lands on the selector line.
- F12 on `'#components/Button.module.css'` → opens that file at line 1.
- F12 on an unresolved import → VS Code shows "No definition found".

---

## Phase 3 — Caching & file watching

All caches live in `src/services/` with a single owner: `CacheRegistry`. Created on `activate`, disposed on `deactivate`.

### 3a. tsconfig cache

```ts
class TsconfigCache {
  get(filePath: string): LoadedTsconfig | null
  invalidate(tsconfigPath: string): void
  invalidateAll(): void
}
```

- Internal maps: `dir → tsconfigPath`, `tsconfigPath → LoadedTsconfig`.
- `get(filePath)` walks up directories, populating `dir → tsconfigPath` along the way, then loads (or returns cached) `LoadedTsconfig`.

### 3b. CSS module cache

```ts
class CssIndexCache {
  get(cssPath: string): CssIndex | null
  invalidate(cssPath: string): void
}
```

- Reads file from disk, but: if the file is open in an editor, prefer `vscode.workspace.textDocuments` so unsaved edits are reflected.
- Re-parses if file's mtime differs from cached entry.

### 3c. Watchers

- `vscode.workspace.createFileSystemWatcher('**/tsconfig*.json')` → on create/change/delete, invalidate all tsconfig entries plus the `dir → tsconfigPath` map (cheap; a new tsconfig can change ancestor resolution for many files).
- `vscode.workspace.createFileSystemWatcher('**/*.module.css')` → on create/change/delete, invalidate the matching CSS entry.
- `vscode.workspace.onDidChangeTextDocument` → if the changed document is a `.module.css`, invalidate its entry (the cache will re-read from `textDocuments` on next `get`).

**Exit criteria**

- Edit a tsconfig's `paths`, save, then F12 — the new mapping is used immediately.
- Add a new class to a `.module.css`, F12 from the TSX file — the new class is resolved.
- Delete and recreate a CSS file → next F12 still works.

---

## Phase 4 — Tests

### 4a. Unit tests (`test/unit/*.test.ts`, run with mocha against compiled output)

Fixture tree under `test/fixtures/`:

```
test/fixtures/
  monorepo-alias/
    tsconfig.base.json         (no paths)
    apps/web/
      tsconfig.json            (extends ../../tsconfig.base.json, paths: { "#*": ["./src/*"] })
      src/
        Button.tsx
        Button.module.css
        components/Card.tsx
        components/Card.module.css
  monorepo-relative/
    tsconfig.json              (no paths)
    src/x.tsx
    src/x.module.css
  multi-tsconfig/
    apps/web/tsconfig.json     (paths: { "#*": ["./src/*"] })
    apps/api/tsconfig.json     (paths: { "@api/*": ["./src/*"] })  -- ensures correct picking
```

Tests:

- `tsconfigLoader`: loads paths correctly; survives `extends`; missing file returns null.
- `tsconfigFinder`: returns nearest ancestor; ignores `node_modules`.
- `pathResolver`: relative imports, alias imports, multiple alias targets, no-match cases.
- `cssIndex`: plain selectors, `:global(.x)`, `:local(.x)`, nested under `@media`, comments-with-dots, attribute selectors with quoted strings (negative test — no false matches).
- `tsImportScanner`: default import, namespace import, named import, multiple imports per file, import with non-`.module.css` specifier (ignored), cursor-on-string detection.
- `resolver` end-to-end against the fixture tree.

### 4b. Integration tests (`test/integration/*.test.ts`, run with `@vscode/test-electron`)

- Boot a real Extension Host pointed at `test/fixtures/monorepo-alias/`.
- Open `apps/web/src/Button.tsx`, place cursor on `styles.primaryAction`, call `vscode.commands.executeCommand<vscode.LocationLink[]>('vscode.executeDefinitionProvider', uri, position)`, assert the resulting location is the right file and line.
- Same with cursor on the import string.
- Same with an unresolved class → expect a location at line 0 of the CSS file.
- Same with an unresolved import → expect an empty result.

CI: a single `npm test` script runs unit + integration (integration step downloads a stable VS Code build via `@vscode/test-electron`).

**Exit criteria**

- All tests green locally and in CI.
- A regression touching any resolver module fails at least one unit test.

---

## Phase 5 — Bundling & packaging

### 5a. esbuild config

`scripts/build.mjs`:

- `entryPoints: ['src/extension.ts']`
- `bundle: true`, `platform: 'node'`, `target: 'node20'`, `external: ['vscode']`
- `format: 'cjs'`, `outfile: 'out/extension.js'`, `sourcemap: true`
- Production build adds `minify: true`.
- Watch build (`--watch`) for the F5 dev loop.

Verify the bundled `out/extension.js` is in the low single-digit MB range (TypeScript is the heaviest dep; postcss is small).

### 5b. `vsce` packaging

- `package.json` fields: `name`, `displayName`, `description`, `version`, `publisher`, `repository`, `license`, `categories: ["Programming Languages"]`, `keywords: ["css modules", "go to definition", "monorepo"]`.
- `.vscodeignore` excludes `src/`, `test/`, `scripts/`, `tsconfig.json`, `.vscode/`, source maps in production.
- `scripts.package`: `vsce package --no-dependencies` (we've already bundled).
- `scripts.publish`: `vsce publish --no-dependencies` — present but not invoked.

**Exit criteria**

- `npm run package` produces `vscode-css-modules-0.1.0.vsix`.
- `code --install-extension vscode-css-modules-0.1.0.vsix` installs cleanly.
- After install, F12 works on a real (non-fixture) project.

---

## Phase 6 — Manual QA on real projects

Before declaring v1 done, run through this checklist on the user's actual monorepo(s):

- [ ] Open a TSX file using `#*` alias → F12 on import string opens the right CSS file.
- [ ] F12 on `styles.someClass` lands on the selector.
- [ ] F12 on `styles.classDefinedInsideMedia` lands on the selector inside `@media`.
- [ ] F12 on `styles.classDefinedIn:global` lands inside the `:global(...)` selector.
- [ ] F12 on `styles.nonExistentClass` opens the CSS file at line 1.
- [ ] F12 on an import to a missing CSS file shows "No definition found".
- [ ] Add a new class to a CSS file → immediately resolvable without reloading the window.
- [ ] Change `paths` in a tsconfig → immediately reflected.
- [ ] Project uses tsgo as the type-checker → still works (the extension does not interact with tsserver/tsgo at all, so this should pass by construction).
- [ ] No noticeable lag on F12 even in a repo with hundreds of CSS module files.

---

## Out of scope for v1 (potential v2 backlog)

- `composes: x from './other.module.css'` chasing.
- camelCase ↔ kebab-case transformation (only relevant when consumers configure `localsConvention`).
- SCSS / Less / Stylus modules.
- Completion provider for `styles.<TAB>`.
- Find References (CSS → TSX usages).
- Diagnostic for `styles.foo` where `foo` doesn't exist.
- Hover preview showing the CSS rule body.
- Marketplace listing, icon, screenshots.

---

## Repo layout (final)

```
.
├── PLAN.md
├── README.md
├── package.json
├── tsconfig.json
├── .vscodeignore
├── .vscode/launch.json
├── scripts/build.mjs
├── src/
│   ├── extension.ts                  # activate / deactivate, provider registration
│   ├── vscodeAdapter.ts              # Location/LocationLink construction, range hinting
│   ├── core/
│   │   ├── index.ts
│   │   ├── tsconfigLoader.ts
│   │   ├── tsconfigFinder.ts
│   │   ├── pathResolver.ts
│   │   ├── cssIndex.ts
│   │   ├── tsImportScanner.ts
│   │   └── resolver.ts
│   └── services/
│       ├── tsconfigCache.ts
│       ├── cssIndexCache.ts
│       └── watchers.ts
└── test/
    ├── fixtures/...
    ├── unit/...
    └── integration/...
```
