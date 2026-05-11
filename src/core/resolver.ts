import * as ts from 'typescript';
import { resolveImport } from './pathResolver';
import { scanTsxForCssModules, type CssModuleBinding } from './tsImportScanner';
import type { LoadedTsconfig } from './tsconfigLoader';
import type { CssIndex } from './cssIndex';

export type DefinitionOriginRange = { start: number; end: number };

export type DefinitionTarget = {
  filePath: string;
  // 1-based line/column. Adapter converts to 0-based VS Code positions.
  line: number;
  column: number;
  originRange?: DefinitionOriginRange;
};

export type ResolveArgs = {
  documentPath: string;
  documentText: string;
  cursorOffset: number;
  loadTsconfig: (filePath: string) => LoadedTsconfig | null;
  loadCssIndex: (cssPath: string) => CssIndex | null;
};

export function resolveDefinitionAt(args: ResolveArgs): DefinitionTarget[] | null {
  const scan = scanTsxForCssModules(args.documentText, args.documentPath);
  if (scan.bindings.length === 0 && scan.stringLiterals.length === 0) return null;

  // 1. cursor on the import string literal?
  for (const lit of scan.stringLiterals) {
    if (args.cursorOffset >= lit.start && args.cursorOffset <= lit.end) {
      const tsconfig = args.loadTsconfig(args.documentPath);
      const candidates = resolveImport(args.documentPath, tsconfig, lit.specifier);
      for (const candidate of candidates) {
        const idx = args.loadCssIndex(candidate);
        if (idx) {
          return [{
            filePath: candidate,
            line: 1,
            column: 1,
            originRange: { start: lit.start, end: lit.end },
          }];
        }
      }
      return null;
    }
  }

  // 2. cursor on a property access against a CSS-module binding?
  const node = findNodeAtOffset(scan.sourceFile, args.cursorOffset);
  if (!node) return null;

  const access = readAccess(node);
  if (access) {
    const binding = scan.bindings.find(
      (b) => (b.kind === 'default' || b.kind === 'namespace') && b.localName === access.local,
    );
    if (!binding) return null;

    const tsconfig = args.loadTsconfig(args.documentPath);
    const candidates = resolveImport(args.documentPath, tsconfig, binding.specifier);
    for (const candidate of candidates) {
      const idx = args.loadCssIndex(candidate);
      if (!idx) continue;
      const sel = idx.selectors.get(access.className);
      const originRange = computeOriginRange(node);
      if (sel) {
        return [{ filePath: candidate, line: sel.line, column: sel.column, originRange }];
      }
      return [{ filePath: candidate, line: 1, column: 1, originRange }];
    }
    return null;
  }

  // 3. cursor on the binding identifier itself (e.g. F12 on `styles` in `styles.foo`)
  if (ts.isIdentifier(node) && !isInsideImportDeclaration(node)) {
    const binding = scan.bindings.find(
      (b) =>
        (b.kind === 'default' || b.kind === 'namespace') &&
        b.localName === node.text,
    );
    if (binding) {
      const tsconfig = args.loadTsconfig(args.documentPath);
      const candidates = resolveImport(args.documentPath, tsconfig, binding.specifier);
      for (const candidate of candidates) {
        const idx = args.loadCssIndex(candidate);
        if (!idx) continue;
        return [{
          filePath: candidate,
          line: 1,
          column: 1,
          originRange: { start: node.getStart(), end: node.getEnd() },
        }];
      }
    }
  }

  return null;
}

function isInsideImportDeclaration(node: ts.Node): boolean {
  let p: ts.Node | undefined = node.parent;
  while (p) {
    if (ts.isImportDeclaration(p)) return true;
    p = p.parent;
  }
  return false;
}

// Exposed for tests; finds the deepest node whose span contains the offset.
export function findNodeAtOffset(sourceFile: ts.SourceFile, offset: number): ts.Node | undefined {
  function visit(node: ts.Node): ts.Node | undefined {
    if (offset < node.getStart(sourceFile) || offset > node.getEnd()) return undefined;
    let inner: ts.Node | undefined;
    ts.forEachChild(node, (child) => {
      const r = visit(child);
      if (r) {
        inner = r;
        return true;
      }
      return undefined;
    });
    return inner ?? node;
  }
  return visit(sourceFile);
}

function readAccess(node: ts.Node): { local: string; className: string } | null {
  // styles.foo  — cursor on `foo`
  if (
    ts.isIdentifier(node) &&
    node.parent &&
    ts.isPropertyAccessExpression(node.parent) &&
    node.parent.name === node
  ) {
    const obj = node.parent.expression;
    if (ts.isIdentifier(obj)) {
      return { local: obj.text, className: node.text };
    }
  }
  // styles["foo"] — cursor on the string literal
  if (
    ts.isStringLiteralLike(node) &&
    node.parent &&
    ts.isElementAccessExpression(node.parent) &&
    node.parent.argumentExpression === node
  ) {
    const obj = node.parent.expression;
    if (ts.isIdentifier(obj)) {
      return { local: obj.text, className: node.text };
    }
  }
  return null;
}

function computeOriginRange(node: ts.Node): DefinitionOriginRange {
  if (ts.isStringLiteralLike(node)) {
    return { start: node.getStart() + 1, end: node.getEnd() - 1 };
  }
  return { start: node.getStart(), end: node.getEnd() };
}
