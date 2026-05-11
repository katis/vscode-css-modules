import * as path from 'node:path';
import * as ts from 'typescript';

export type CssModuleBinding =
  | { kind: 'default'; localName: string; specifier: string }
  | { kind: 'namespace'; localName: string; specifier: string }
  | { kind: 'named'; localName: string; importedName: string; specifier: string };

export type ImportSpecifierLiteral = {
  specifier: string;
  // Offsets within the source text, exclusive of the surrounding quote characters.
  start: number;
  end: number;
};

export type ScanResult = {
  sourceFile: ts.SourceFile;
  bindings: CssModuleBinding[];
  stringLiterals: ImportSpecifierLiteral[];
};

const CSS_MODULE_RE = /\.module\.css(\?.*)?$/i;

export function isCssModuleSpecifier(spec: string): boolean {
  return CSS_MODULE_RE.test(spec);
}

export function scanTsxForCssModules(source: string, fileName: string): ScanResult {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    scriptKindFromFileName(fileName),
  );

  const bindings: CssModuleBinding[] = [];
  const stringLiterals: ImportSpecifierLiteral[] = [];

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const spec = stmt.moduleSpecifier;
    if (!ts.isStringLiteralLike(spec)) continue;
    const specifier = spec.text;
    if (!isCssModuleSpecifier(specifier)) continue;

    const litStart = spec.getStart(sourceFile);
    const litEnd = spec.getEnd();
    stringLiterals.push({ specifier, start: litStart + 1, end: litEnd - 1 });

    const importClause = stmt.importClause;
    if (!importClause) continue;

    if (importClause.name) {
      bindings.push({ kind: 'default', localName: importClause.name.text, specifier });
    }

    const named = importClause.namedBindings;
    if (!named) continue;

    if (ts.isNamespaceImport(named)) {
      bindings.push({ kind: 'namespace', localName: named.name.text, specifier });
    } else if (ts.isNamedImports(named)) {
      for (const el of named.elements) {
        bindings.push({
          kind: 'named',
          localName: el.name.text,
          importedName: el.propertyName?.text ?? el.name.text,
          specifier,
        });
      }
    }
  }

  return { sourceFile, bindings, stringLiterals };
}

function scriptKindFromFileName(fileName: string): ts.ScriptKind {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.ts':
      return ts.ScriptKind.TS;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.js':
      return ts.ScriptKind.JS;
    case '.mts':
      return ts.ScriptKind.TS;
    case '.cts':
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.TSX;
  }
}
