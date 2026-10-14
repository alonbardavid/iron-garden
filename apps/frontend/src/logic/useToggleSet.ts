import { useState } from "react";

// A set of keys and a way to flip one in or out of it.
export function useToggleSet(
  initial: () => Iterable<string> = () => [],
): [
  ReadonlySet<string>,
  (key: string) => void,
  (update: (current: ReadonlySet<string>) => ReadonlySet<string>) => void,
] {
  const [keys, setKeys] = useState<ReadonlySet<string>>(
    () => new Set(initial()),
  );
  const toggle = (key: string) =>
    setKeys((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  return [keys, toggle, setKeys];
}
