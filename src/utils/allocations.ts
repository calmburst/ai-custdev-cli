import type { ISegment } from "../types";

export const allocateCountsByWeight = (
  segments: ISegment[],
  total: number
): Map<string, number> => {
  const weightSum = segments.reduce((sum, segment) => sum + segment.weight, 0);
  if (weightSum <= 0) {
    throw new Error("Segment weights must sum to a positive value.");
  }

  const allocations = segments.map((segment) => {
    const exact = (segment.weight / weightSum) * total;
    return {
      id: segment.id,
      exact,
      count: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });

  let remaining = total - allocations.reduce((sum, item) => sum + item.count, 0);
  allocations
    .sort((a, b) => b.remainder - a.remainder)
    .forEach((item) => {
      if (remaining <= 0) {
        return;
      }
      item.count += 1;
      remaining -= 1;
    });

  return new Map(allocations.map((item) => [item.id, item.count]));
};
