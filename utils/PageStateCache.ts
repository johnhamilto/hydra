export class PageState<T> {
  private value: T;
  private listeners = new Set<() => void>();

  constructor(initial: () => T) {
    this.value = initial();
  }

  getSnapshot = () => this.value;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set = (update: T | ((previous: T) => T)) => {
    const next =
      typeof update === "function"
        ? (update as (previous: T) => T)(this.value)
        : update;
    if (Object.is(this.value, next)) return;
    this.value = next;
    this.listeners.forEach((listener) => listener());
  };
}

export class PageStateCache {
  private pages = new Map<
    string,
    Map<string, Map<string | undefined, unknown>>
  >();

  get<T>(
    page: string,
    slot: string,
    initial: () => T,
    scope?: string,
  ): PageState<T> {
    let entries = this.pages.get(page);
    if (!entries) {
      entries = new Map();
      this.pages.set(page, entries);
    }
    let scopes = entries.get(slot);
    if (!scopes) {
      scopes = new Map();
      entries.set(slot, scopes);
    }
    let entry = scopes.get(scope) as PageState<T> | undefined;
    if (!entry) {
      entry = new PageState(initial);
      scopes.set(scope, entry);
    }
    return entry;
  }

  retainScope(page: string, slot: string, scope: string | undefined) {
    const scopes = this.pages.get(page)?.get(slot);
    if (!scopes) return;
    for (const key of scopes.keys()) {
      if (key !== scope) scopes.delete(key);
    }
  }

  retain(keys: string[]) {
    const retained = new Set(keys);
    for (const key of this.pages.keys()) {
      if (!retained.has(key)) this.pages.delete(key);
    }
  }
}
