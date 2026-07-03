export type ParsedCli = {
  command: string;
  flags: Record<string, string | boolean>;
  repeats: Record<string, string[]>;
  positional: string[];
};

const REPEAT_FLAGS = new Set([
  "ac",
  "acceptance-criteria",
  "learning",
  "learnings",
  "depends-on",
]);

export function parseCliArgs(argv: string[]): ParsedCli {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const repeats: Record<string, string[]> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2).replace(/-/g, "-");
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    if (REPEAT_FLAGS.has(key)) {
      repeats[key] = repeats[key] ?? [];
      repeats[key].push(next);
      i++;
      continue;
    }

    flags[key] = next;
    i++;
  }

  return {
    command: positional[0] ?? "",
    flags,
    repeats,
    positional: positional.slice(1),
  };
}

export function flagStr(
  flags: Record<string, string | boolean>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = flags[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

export function flagNum(
  flags: Record<string, string | boolean>,
  key: string
): number | undefined {
  const raw = flags[key];
  if (typeof raw !== "string") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function repeatValues(
  repeats: Record<string, string[]>,
  ...keys: string[]
): string[] {
  for (const key of keys) {
    if (repeats[key]?.length) return repeats[key];
  }
  return [];
}
