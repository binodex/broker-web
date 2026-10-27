export type Listener = () => void;

export interface ReadableStore<T> {
  getSnapshot: () => T;
  subscribe: (listener: Listener) => () => void;
}

export interface Store<T> extends ReadableStore<T> {
  set: (next: Partial<T> | ((previous: T) => Partial<T>)) => void;
  replace: (next: T) => void;
}

export const createStore = <T extends object>(initial: T): Store<T> => {
  let state = initial;
  const listeners = new Set<Listener>();
  const notify = () => {
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next) => {
      const patch = typeof next === "function" ? next(state) : next;
      const keys = Object.keys(patch) as (keyof T)[];
      if (keys.every((key) => Object.is(state[key], patch[key]))) return;
      state = { ...state, ...patch };
      notify();
    },
    replace: (next) => {
      if (Object.is(state, next)) return;
      state = next;
      notify();
    },
  };
};

export type Emitter<E> = {
  emit: (event: E) => void;
  subscribe: (listener: (event: E) => void) => () => void;
};

export const createEmitter = <E>(): Emitter<E> => {
  const listeners = new Set<(event: E) => void>();
  return {
    emit: (event) => {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
