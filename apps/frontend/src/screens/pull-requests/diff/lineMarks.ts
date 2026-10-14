import { useMemo, useRef } from "react";
import type { ReviewRule } from "@lib/contract";
import { changesOf, type Change, type DiffLine } from "@lib/diff";
import { useMarks } from "../review";

// What a file's diff needs to show and change which lines are accepted.
export interface LineMarks {
  // Each diff line's change; null for an unchanged line.
  owner: (Change | null)[];
  isAccepted: (change: Change) => boolean;
  // Accepted by a rule rather than by you.
  isAuto: (change: Change) => boolean;
  isHigh: (change: Change) => boolean;
  // The auto-accept and high-impact rules that matched a change.
  rulesOf: (change: Change) => ReviewRule[];
  set: (changes: Change[], accepted: boolean) => void;
  // A click on a change's bar. With `extend` it takes in every change
  // between this one and the last one clicked.
  click: (change: Change, extend: boolean) => void;
}

// Undefined until the pull request's changes are loaded.
export function useLineMarks(
  path: string,
  lines: DiffLine[],
): LineMarks | undefined {
  const { marks, accept } = useMarks();
  const changes = useMemo(() => changesOf(lines), [lines]);
  const owner = useMemo(() => {
    const result: (Change | null)[] = lines.map(() => null);
    for (const change of changes) {
      for (const i of change.lines) {
        result[i] = change;
      }
    }
    return result;
  }, [changes, lines]);
  const last = useRef<number | null>(null);
  if (!marks) {
    return undefined;
  }
  const ref = (change: Change) => ({ path, key: change.key });
  const isAccepted = (change: Change) => marks.isAccepted(ref(change));
  const set = (list: Change[], accepted: boolean) =>
    accept(
      list.map((change) => ({ path, key: change.key })),
      accepted,
    );
  return {
    owner,
    isAccepted,
    isAuto: (change) => marks.isAuto(ref(change)),
    isHigh: (change) => marks.isHigh(ref(change)),
    rulesOf: (change) => marks.rulesOf(ref(change)),
    set,
    click: (change, extend) => {
      const index = changes.indexOf(change);
      const from = extend ? (last.current ?? index) : index;
      last.current = index;
      set(
        changes.slice(Math.min(from, index), Math.max(from, index) + 1),
        !isAccepted(change),
      );
    },
  };
}
