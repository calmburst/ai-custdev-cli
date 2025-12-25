import assert from "node:assert/strict";

import type { ISegment } from "../src/types";
import { allocateCountsByWeight } from "../src/utils/allocations";

const toObject = (map: Map<string, number>): Record<string, number> =>
  Array.from(map.entries()).reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {} as Record<string, number>);

export const tests = [
  {
    name: "allocateCountsByWeight allocates counts that sum to total",
    run: () => {
      const segments: ISegment[] = [
        { id: "a", name: "A", weight: 0.6, traits: [] },
        { id: "b", name: "B", weight: 0.4, traits: [] },
      ];
      const counts = allocateCountsByWeight(segments, 10);
      const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
      assert.equal(total, 10);
      assert.deepEqual(toObject(counts), { a: 6, b: 4 });
    },
  },
  {
    name: "allocateCountsByWeight throws when weights sum to zero",
    run: () => {
      const segments: ISegment[] = [
        { id: "a", name: "A", weight: 0, traits: [] },
        { id: "b", name: "B", weight: 0, traits: [] },
      ];
      assert.throws(() => allocateCountsByWeight(segments, 5), /Segment weights must sum/);
    },
  },
];
