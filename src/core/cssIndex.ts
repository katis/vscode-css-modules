import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';

export type CssSelectorPosition = {
  // 1-based line/column matching postcss conventions; adapter converts to 0-based.
  line: number;
  column: number;
};

export type CssIndex = {
  filePath: string;
  selectors: Map<string, CssSelectorPosition>;
};

export function indexCssModule(filePath: string, source: string): CssIndex {
  const selectors = new Map<string, CssSelectorPosition>();

  let root: postcss.Root;
  try {
    root = postcss.parse(source, { from: filePath });
  } catch {
    return { filePath, selectors };
  }

  root.walkRules((rule) => {
    const ruleLine = rule.source?.start?.line ?? 1;
    const ruleCol = rule.source?.start?.column ?? 1;

    let parsed: selectorParser.Root;
    try {
      parsed = selectorParser().astSync(rule.selector);
    } catch {
      return;
    }

    parsed.walk((node) => {
      if (node.type !== 'class') return;
      const name = node.value;
      if (!name || selectors.has(name)) return;
      const off = node.sourceIndex ?? 0;
      const pos = offsetToLineColumn(rule.selector, off, ruleLine, ruleCol);
      selectors.set(name, pos);
    });
  });

  return { filePath, selectors };
}

function offsetToLineColumn(
  text: string,
  offset: number,
  startLine: number,
  startCol: number,
): CssSelectorPosition {
  let line = startLine;
  let column = startCol;
  const max = Math.min(offset, text.length);
  for (let i = 0; i < max; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}
