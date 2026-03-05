const COMMON_COMMANDS = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'theta',
  'lambda',
  'mu',
  'sigma',
  'pi',
  'mathcal',
  'frac',
  'partial',
  'sum',
  'left',
  'right',
  'lVert',
  'Vert',
  'cdot',
  'times',
  'int',
  'sqrt',
  'sin',
  'cos',
  'tan',
  'log',
  'ln',
  'exp',
  'operatorname',
];

const RECOVER_COMMANDS: Record<string, string> = {
  heta: 'theta',
  rac: 'frac',
  ight: 'right',
};

const commandPattern = new RegExp(`(^|[^\\\\])\\b(${COMMON_COMMANDS.join('|')})\\b`, 'g');

const normalizeMathBody = (raw: string): string => {
  let body = raw;

  // Recover escaped command prefixes that were pasted as control characters.
  body = body.replace(/[\u0009\u000C\u000D]/g, '\\');

  body = body.replace(/\\(heta|rac|ight)\b/g, (full, key: string) => {
    const recovered = RECOVER_COMMANDS[key];
    return recovered ? `\\${recovered}` : full;
  });

  body = body.replace(commandPattern, (_full, prefix: string, command: string) => {
    return `${prefix}\\${command}`;
  });

  return body;
};

export const normalizeMathInMarkdown = (source: string): string => {
  const blockCache: string[] = [];

  const withBlockPlaceholders = source.replace(/\$\$([\s\S]*?)\$\$/g, (_full, body: string) => {
    const key = `@@__MATH_BLOCK_${blockCache.length}__@@`;
    blockCache.push(`$$${normalizeMathBody(body)}$$`);
    return key;
  });

  const normalizedInline = withBlockPlaceholders.replace(
    /(^|[^\\])\$([^$\n]+?)\$/g,
    (_full, prefix: string, body: string) => `${prefix}$${normalizeMathBody(body)}$`,
  );

  return normalizedInline.replace(/@@__MATH_BLOCK_(\d+)__@@/g, (_full, index: string) => {
    return blockCache[Number(index)] ?? '';
  });
};
