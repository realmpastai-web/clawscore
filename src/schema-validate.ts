/**
 * Minimal JSON Schema validator for the bundled report schema.
 * Supports the keywords used in schemas/report.schema.json.
 */
export interface ValidationError {
  path: string;
  message: string;
}

export function validateAgainstSchema(data: unknown, schema: unknown): ValidationError[] {
  return check(data, schema as Schema, schema as Schema, "$");
}

interface Schema {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  required?: string[];
  properties?: Record<string, Schema>;
  additionalProperties?: boolean | Schema;
  items?: Schema;
  $defs?: Record<string, Schema>;
  $ref?: string;
}

function check(data: unknown, schema: Schema, root: Schema, path: string): ValidationError[] {
  const resolved = resolveRef(schema, root);
  const errors: ValidationError[] = [];
  if (resolved.type) {
    const types = Array.isArray(resolved.type) ? resolved.type : [resolved.type];
    if (!types.some((t) => matchType(data, t))) {
      errors.push({ path, message: `expected type ${types.join("|")}, got ${actualType(data)}` });
      return errors;
    }
  }
  if ("const" in resolved && !deepEqual(data, resolved.const)) {
    errors.push({ path, message: `expected const ${JSON.stringify(resolved.const)}` });
  }
  if (resolved.enum && !resolved.enum.some((v) => deepEqual(data, v))) {
    errors.push({ path, message: `expected one of ${resolved.enum.map((v) => JSON.stringify(v)).join(", ")}` });
  }
  if (typeof data === "number") {
    if (typeof resolved.minimum === "number" && data < resolved.minimum) {
      errors.push({ path, message: `expected >= ${resolved.minimum}` });
    }
    if (typeof resolved.maximum === "number" && data > resolved.maximum) {
      errors.push({ path, message: `expected <= ${resolved.maximum}` });
    }
  }
  if (typeof data === "string" && typeof resolved.minLength === "number" && data.length < resolved.minLength) {
    errors.push({ path, message: `expected minLength ${resolved.minLength}` });
  }
  if (Array.isArray(data) && resolved.items) {
    data.forEach((item, i) => errors.push(...check(item, resolved.items!, root, `${path}[${i}]`)));
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const key of resolved.required ?? []) {
      if (!(key in obj)) errors.push({ path, message: `missing required property ${key}` });
    }
    const props = resolved.properties ?? {};
    for (const [key, value] of Object.entries(obj)) {
      if (props[key]) {
        errors.push(...check(value, props[key]!, root, `${path}.${key}`));
      } else if (resolved.additionalProperties === false) {
        errors.push({ path, message: `unexpected property ${key}` });
      }
    }
  }
  return errors;
}

function resolveRef(schema: Schema, root: Schema): Schema {
  if (!schema.$ref) return schema;
  const ref = schema.$ref;
  if (ref === "#") return root;
  const prefix = "#/$defs/";
  if (ref.startsWith(prefix)) {
    const name = ref.slice(prefix.length);
    const def = root.$defs?.[name];
    if (!def) throw new Error(`unresolved $ref ${ref}`);
    return def;
  }
  throw new Error(`unsupported $ref ${ref}`);
}

function matchType(data: unknown, type: string): boolean {
  if (type === "object") return !!data && typeof data === "object" && !Array.isArray(data);
  if (type === "array") return Array.isArray(data);
  if (type === "integer") return typeof data === "number" && Number.isInteger(data);
  if (type === "number") return typeof data === "number";
  if (type === "string") return typeof data === "string";
  if (type === "boolean") return typeof data === "boolean";
  if (type === "null") return data === null;
  return false;
}

function actualType(data: unknown): string {
  if (data === null) return "null";
  if (Array.isArray(data)) return "array";
  return typeof data;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
