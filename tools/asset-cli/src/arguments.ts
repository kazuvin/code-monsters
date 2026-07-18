export type Arguments = {
  command: string;
  options: Map<string, string | boolean>;
};

export function parseArguments(argv: string[]): Arguments {
  const [command = 'help', ...tokens] = argv;
  const options = new Map<string, string | boolean>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const next = tokens[index + 1];
    if (!next || next.startsWith('--')) {
      options.set(key, true);
    } else {
      options.set(key, next);
      index += 1;
    }
  }
  return { command, options };
}

export function requiredOption(options: Map<string, string | boolean>, name: string): string {
  const value = options.get(name);
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing required option: --${name}`);
  return value;
}

export function optionalString(options: Map<string, string | boolean>, name: string): string | undefined {
  const value = options.get(name);
  return typeof value === 'string' ? value : undefined;
}

export function booleanOption(options: Map<string, string | boolean>, name: string): boolean {
  return options.get(name) === true;
}
