import * as vscode from 'vscode';
import type { DefinitionTarget } from './core/resolver';

export function toLocationLinks(
  document: vscode.TextDocument,
  targets: DefinitionTarget[],
): vscode.LocationLink[] {
  return targets.map((t) => {
    const targetUri = vscode.Uri.file(t.filePath);
    const targetPosition = new vscode.Position(Math.max(0, t.line - 1), Math.max(0, t.column - 1));
    const targetRange = new vscode.Range(targetPosition, targetPosition);
    const link: vscode.LocationLink = {
      targetUri,
      targetRange,
      targetSelectionRange: targetRange,
    };
    if (t.originRange) {
      link.originSelectionRange = new vscode.Range(
        document.positionAt(t.originRange.start),
        document.positionAt(t.originRange.end),
      );
    }
    return link;
  });
}
