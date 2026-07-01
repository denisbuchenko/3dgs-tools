export function splitArgs(value: string) {
  const args: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }

  return args;
}

export function replacePlaceholders(value: string, replacements: Record<string, string>) {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => replacements[key] ?? "");
}
