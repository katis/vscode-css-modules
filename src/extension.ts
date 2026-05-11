import * as vscode from 'vscode';
import { resolveDefinitionAt } from './core/resolver';
import { TsconfigCache } from './services/tsconfigCache';
import { CssIndexCache } from './services/cssIndexCache';
import { registerWatchers } from './services/watchers';
import { toLocationLinks } from './vscodeAdapter';

export function activate(context: vscode.ExtensionContext): void {
  const tsconfigCache = new TsconfigCache();
  const cssIndexCache = new CssIndexCache((cssPath) => {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.scheme === 'file' && doc.fileName === cssPath) {
        return doc.getText();
      }
    }
    return undefined;
  });

  registerWatchers(context, tsconfigCache, cssIndexCache);

  const selector: vscode.DocumentSelector = [
    { language: 'typescriptreact', scheme: 'file' },
    { language: 'typescript', scheme: 'file' },
  ];

  const provider: vscode.DefinitionProvider = {
    provideDefinition(document, position, token) {
      if (token.isCancellationRequested) return undefined;

      const offset = document.offsetAt(position);
      const targets = resolveDefinitionAt({
        documentPath: document.fileName,
        documentText: document.getText(),
        cursorOffset: offset,
        loadTsconfig: (filePath) => tsconfigCache.getForFile(filePath),
        loadCssIndex: (cssPath) => {
          if (token.isCancellationRequested) return null;
          return cssIndexCache.get(cssPath);
        },
      });

      if (token.isCancellationRequested) return undefined;
      if (!targets || targets.length === 0) return undefined;
      return toLocationLinks(document, targets);
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(selector, provider),
  );
}

export function deactivate(): void {
  // disposables are managed by the extension context
}
