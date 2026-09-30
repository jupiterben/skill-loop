type Body = Record<string, unknown>;

function missing(value: unknown): boolean {
  return value === undefined;
}

export function pickString(body: Body, key: string): string;
export function pickString(body: Body, key: string, defaultValue: string): string;
export function pickString(body: Body, key: string, defaultValue?: string): string {
  const value = body[key];
  if (missing(value)) {
    if (arguments.length >= 3) return defaultValue!;
    throw new Error(`${key} 必填`);
  }
  return String(value);
}

/** PATCH 语义：字段缺失时返回 undefined，存在时转为 string */
export function pickOptionalString(body: Body, key: string): string | undefined {
  if (body[key] === undefined) return undefined;
  return String(body[key]);
}

/** null / undefined / "" 均视为 null */
export function pickNullableString(body: Body, key: string): string | null {
  const raw = body[key];
  if (raw === null || raw === undefined || raw === "") return null;
  return String(raw);
}

export function pickNumber(body: Body, key: string): number;
export function pickNumber(body: Body, key: string, defaultValue: number): number;
export function pickNumber(body: Body, key: string, defaultValue?: number): number {
  const value = body[key];
  if (missing(value)) {
    if (arguments.length >= 3) return defaultValue!;
    throw new Error(`${key} 必填`);
  }
  return Number(value);
}

export function pickInteger(body: Body, key: string): number;
export function pickInteger(body: Body, key: string, defaultValue: number): number;
export function pickInteger(body: Body, key: string, defaultValue?: number): number {
  if (arguments.length >= 3 && missing(body[key])) return defaultValue!;
  const num = pickNumber(body, key);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`${key} 必须为非负整数`);
  }
  return num;
}

export function pickEnum<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[]
): T;
export function pickEnum<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[],
  defaultValue: T
): T;
export function pickEnum<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[],
  defaultValue?: T
): T {
  const value = body[key];
  if (missing(value)) {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`${key} 必填`);
  }
  const str = String(value);
  if (!(allowed as readonly string[]).includes(str)) {
    throw new Error(`${key} 必须为 ${allowed.join(" 或 ")}`);
  }
  return str as T;
}

export function pickOptionalEnum<T extends string>(
  body: Body,
  key: string,
  allowed: readonly T[]
): T | undefined {
  if (body[key] === undefined) return undefined;
  return pickEnum(body, key, allowed);
}

export function pickBoolean(body: Body, key: string): boolean;
export function pickBoolean(body: Body, key: string, defaultValue: boolean): boolean;
export function pickBoolean(body: Body, key: string, defaultValue?: boolean): boolean {
  const value = body[key];
  if (missing(value)) {
    if (arguments.length >= 3) return defaultValue!;
    throw new Error(`${key} 必填`);
  }
  return value === true;
}

export function pickStringArray(body: Body, key: string, defaultValue: string[] = []): string[] {
  const value = body[key];
  if (value === undefined) return defaultValue;
  if (!Array.isArray(value)) throw new Error(`${key} 必须为字符串数组`);
  return (value as unknown[]).map((item) => String(item).trim()).filter(Boolean);
}

/** 将 body 中已存在的 string 字段写入 patch */
export function patchString(
  patch: Record<string, unknown>,
  body: Body,
  key: string,
  trim = false
): void {
  const value = pickOptionalString(body, key);
  if (value !== undefined) {
    patch[key] = trim ? value.trim() : value;
  }
}
