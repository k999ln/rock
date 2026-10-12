'use strict';

// A hard ceiling shared by parser and public AST walkers. Options cannot bypass it.
const MAX_DEPTH = 100;
const checkDepth = depth => {
  if (depth > MAX_DEPTH) {
    throw new SyntaxError('Brace pattern exceeds maximum nesting depth (100)');
  }
};
const assertDepth = ast => {
  const pending = [[ast, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop();
    checkDepth(depth);
    if (node && Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
module.exports = { checkDepth, assertDepth };
