# vscode-css-modules

A VS Code extension that adds **Go to Definition** from TypeScript/React files into CSS Modules. Standalone — no `tsserver` plugin, no language-server dependency.

## What it does

Press F12 (or Cmd/Ctrl-click) on any of these:

| You click on… | …and you land on |
| --- | --- |
| `import styles from './x.module.css'` (the import string) | line 1 of `x.module.css` |
| `styles.primaryAction` (the property name) | the `.primaryAction` selector |
| `styles["primaryAction"]` (bracket access) | the `.primaryAction` selector |
| `styles` (the binding identifier) | line 1 of the matching CSS file |

If the class name doesn't exist in the CSS file, you jump to line 1 of the file rather than nowhere. If the import can't be resolved, the extension yields and VS Code shows the usual "No definition found".

## Supported selectors

The CSS indexer walks the rule tree with `postcss` + `postcss-selector-parser`, so all of these define jumpable classes:

```css
.primaryAction       { /* obvious */ }
.first, .second      { /* both indexed */ }

@media (max-width: 600px) {
  .nestedInMedia     { /* indexed */ }
}

:global(.globalClass) { /* indexed */ }
:local(.localClass)   { /* indexed */ }
```

Attribute selectors (`[class="foo"]`), CSS variables, and tag selectors are intentionally **not** picked up — only `.className` nodes.

## Path resolution

The extension owns its own resolution. For each TS/TSX file:

1. Walk up directories until it finds the nearest `tsconfig.json` (skipping `node_modules`). The result is cached per directory.
2. Read that tsconfig (honoring `extends`, JSON-with-comments). `paths` are taken from the leaf tsconfig as-is — they are **not** merged across the `extends` chain.
3. For each import specifier:
   - `./foo.module.css` → resolved against the importer's directory.
   - `#components/foo.module.css` → matched against `paths` patterns in declaration order; wildcards (`#*`) are substituted into the corresponding target.
   - Bare specifiers with no matching alias yield no candidates.

`baseUrl` is optional. If absent (the recommended `Bundler` setup), targets are resolved against the tsconfig's directory.

## Supported languages

- `typescriptreact` (`.tsx`)
- `typescript` (`.ts`)

## Scope (v1)

- `*.module.css` only (no SCSS / Less / Stylus).
- Plain class selectors only. No `composes: x from './other.module.css'` chasing.
- No camelCase ↔ kebab-case transformation (i.e. no `localsConvention`).

## Works with `tsc` *and* `tsgo`

The extension does not talk to `tsserver` or `tsgo`. It uses the bundled TypeScript compiler API only to parse TS/TSX text and read tsconfigs. That means it works the same way regardless of which type-checker your project uses, including projects that have moved off `tsserver` entirely.

## Editing experience

- Hovering with Cmd/Ctrl shows the standard VS Code definition peek card — the extension wires up `LocationLink.originSelectionRange` so the right token is highlighted.
- Changes pick up immediately:
  - Editing a `*.module.css` in an open buffer invalidates that file's class index on the next lookup.
  - Saving a new `tsconfig.json`, or changing `paths` in one, flushes the tsconfig caches.
  - Creating or deleting `.module.css` files via the file watcher invalidates only that entry.

## Install (private VSIX)

```
npm install
npm run package       # produces vscode-css-modules-0.1.0.vsix
code --install-extension vscode-css-modules-0.1.0.vsix
```

There is no Marketplace listing.

## Development

```
npm install
npm run build         # bundles src/extension.ts → out/extension.js (esbuild)
npm run build:watch   # rebuild on change
```

Hit F5 in VS Code to launch an Extension Development Host. The `.vscode/launch.json` includes a second config ("Run Extension (with fixtures)") that opens `test/fixtures/monorepo-alias/` as the workspace — useful for poking at the resolver end-to-end.

### Repo layout

```
src/
  extension.ts          activate(), provider registration
  vscodeAdapter.ts      LocationLink construction
  core/                 pure logic, no VS Code imports — unit-testable
    tsconfigLoader.ts   ts.parseJsonConfigFileContent + paths normalization
    tsconfigFinder.ts   nearest-ancestor walk, dir→tsconfig cache
    pathResolver.ts     specifier + tsconfig → candidate absolute paths
    cssIndex.ts         postcss-based class-name index
    tsImportScanner.ts  TS AST scan for css-module imports + binding nodes
    resolver.ts         top-level resolveDefinitionAt()
  services/
    tsconfigCache.ts    thin wrapper over the core caches
    cssIndexCache.ts    mtime-keyed + open-buffer-aware
    watchers.ts         FileSystemWatcher wiring
test/
  fixtures/             three monorepo shapes used by both test suites
  unit/                 mocha tests, run against compiled TS
  integration/          @vscode/test-electron smoke tests
```

## Testing

```
npm run test:unit         # mocha against the compiled core
npm run test:integration  # downloads VS Code via @vscode/test-electron and runs in a real Extension Host
npm test                  # both
```

The unit suite covers the parsers and resolver against fixture trees; the integration suite boots a real Extension Host and exercises `vscode.executeDefinitionProvider`.

## Known limitations

- Variable shadowing isn't tracked. If a local variable named `styles` shadows the imported binding, F12 on it will still point at the CSS file. In practice this is rare.
- Only one CSS file is returned per click. If multiple `paths` targets all exist, only the first matching one is opened.
- No completion provider, no diagnostics, no find-references — just go-to-definition.

## Not in scope (potential v2)

- `composes:` chasing across module boundaries
- camelCase ↔ kebab-case (`localsConvention`)
- SCSS / Less / Stylus modules
- Completion for `styles.<TAB>`
- Find References (CSS → TSX usages)
- Diagnostic for `styles.foo` where `foo` doesn't exist
- Hover preview showing the CSS rule body
