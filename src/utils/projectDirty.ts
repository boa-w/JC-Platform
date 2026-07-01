export type JsonPath = Array<string | number>;

const missing = Symbol('missing');

type Missing = typeof missing;

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deepEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

export function getAtPath(root: unknown, path: JsonPath): unknown | Missing {
  let current = root;
  for (const segment of path) {
    if (current === null || current === undefined) return missing;
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) return missing;
      current = current[segment];
    } else {
      if (typeof current !== 'object' || !(segment in (current as Record<string, unknown>)))
        return missing;
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}

export function setAtPath(root: unknown, path: JsonPath, value: unknown): unknown {
  if (path.length === 0) return cloneJson(value);
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    const next = Array.isArray(root) ? [...root] : [];
    next[segment] = setAtPath(next[segment], rest, value);
    return next;
  }
  const next =
    root && typeof root === 'object' && !Array.isArray(root)
      ? { ...(root as Record<string, unknown>) }
      : {};
  next[segment] = setAtPath(next[segment], rest, value);
  return next;
}

export function deleteAtPath(root: unknown, path: JsonPath): unknown {
  if (path.length === 0) return null;
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    if (!Array.isArray(root)) return root;
    const next = [...root];
    if (rest.length === 0) {
      next.splice(segment, 1);
    } else {
      next[segment] = deleteAtPath(next[segment], rest);
    }
    return next;
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return root;
  const next = { ...(root as Record<string, unknown>) };
  if (rest.length === 0) {
    delete next[segment];
  } else {
    next[segment] = deleteAtPath(next[segment], rest);
  }
  return next;
}

export function isPathModified(
  currentDocument: unknown,
  baselineDocument: unknown | null,
  path: JsonPath,
): boolean {
  if (!baselineDocument) return false;
  return !deepEqual(getAtPath(currentDocument, path), getAtPath(baselineDocument, path));
}

export function restorePath(
  currentDocument: unknown,
  baselineDocument: unknown,
  path: JsonPath,
): unknown {
  const baselineValue = getAtPath(baselineDocument, path);
  if (baselineValue === missing) {
    return deleteAtPath(currentDocument, path);
  }
  return setAtPath(currentDocument, path, baselineValue);
}
