import { Change } from '@codemirror/merge';
import { diffLines } from 'diff';

export function lineDiffChanges(original: string, current: string): readonly Change[] {
  const parts = diffLines(original, current);
  const changes: Change[] = [];
  let positionA = 0;
  let positionB = 0;
  let changeStartA: number | null = null;
  let changeStartB: number | null = null;

  const finishChange = () => {
    if (changeStartA === null || changeStartB === null) return;
    changes.push(new Change(changeStartA, positionA, changeStartB, positionB));
    changeStartA = null;
    changeStartB = null;
  };

  for (const part of parts) {
    if (!part.added && !part.removed) {
      finishChange();
      positionA += part.value.length;
      positionB += part.value.length;
      continue;
    }
    if (changeStartA === null) {
      changeStartA = positionA;
      changeStartB = positionB;
    }
    if (part.removed) positionA += part.value.length;
    if (part.added) positionB += part.value.length;
  }
  finishChange();
  return changes;
}
