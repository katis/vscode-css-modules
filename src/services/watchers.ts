import * as vscode from 'vscode';
import type { TsconfigCache } from './tsconfigCache';
import type { CssIndexCache } from './cssIndexCache';

export function registerWatchers(
  context: vscode.ExtensionContext,
  tsconfigCache: TsconfigCache,
  cssIndexCache: CssIndexCache,
): void {
  const tsconfigWatcher = vscode.workspace.createFileSystemWatcher('**/tsconfig*.json');
  const onTsconfig = () => tsconfigCache.invalidateAll();
  context.subscriptions.push(
    tsconfigWatcher,
    tsconfigWatcher.onDidCreate(onTsconfig),
    tsconfigWatcher.onDidChange(onTsconfig),
    tsconfigWatcher.onDidDelete(onTsconfig),
  );

  const cssWatcher = vscode.workspace.createFileSystemWatcher('**/*.module.css');
  const onCss = (uri: vscode.Uri) => cssIndexCache.invalidate(uri.fsPath);
  context.subscriptions.push(
    cssWatcher,
    cssWatcher.onDidCreate(onCss),
    cssWatcher.onDidChange(onCss),
    cssWatcher.onDidDelete(onCss),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme !== 'file') return;
      if (e.document.fileName.toLowerCase().endsWith('.module.css')) {
        cssIndexCache.invalidate(e.document.fileName);
      }
    }),
  );
}
