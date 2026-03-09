import type { Data, Root } from 'mdast';
import type { InlineMath, Math } from 'mdast-util-math';
import type { Plugin } from 'unified';
import {
  convertLatexMathToTypst,
  type MiTexConversionResult,
} from '@/services/typst/mitex';

interface MiTexNodeData extends Data {
  mitex?: MiTexConversionResult;
}

interface TraversableNode {
  type: string;
  value?: string;
  data?: MiTexNodeData;
  children?: TraversableNode[];
}

const isMathNode = (node: TraversableNode): node is TraversableNode & (InlineMath | Math) =>
  node.type === 'inlineMath' || node.type === 'math';

const attachMiTexResult = (node: InlineMath | Math): void => {
  const data = (node.data ?? {}) as MiTexNodeData;
  data.mitex = convertLatexMathToTypst(node.value);
  node.data = data;
};

const visitNode = (node: TraversableNode): void => {
  if (isMathNode(node)) {
    attachMiTexResult(node);
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  node.children.forEach((child) => {
    visitNode(child);
  });
};

export const remarkMiTexToTypst: Plugin<[], Root> = () => (tree) => {
  visitNode(tree as TraversableNode);
};
