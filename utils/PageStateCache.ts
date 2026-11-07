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
  private pages = new Map<string, Map<string, unknown>>();

  get<T>(page: string, slot: string, initial: () => T): PageState<T> {
    let entries = this.pages.get(page);
    if (!entries) {
      entries = new Map();
      this.pages.set(page, entries);
    }
    let entry = entries.get(slot) as PageState<T> | undefined;
    if (!entry) {
      entry = new PageState(initial);
      entries.set(slot, entry);
    }
    return entry;
  }

  retain(keys: string[]) {
    const retained = new Set(keys);
    for (const key of this.pages.keys()) {
      if (!retained.has(key)) this.pages.delete(key);
    }
  }
}
