export const extractJsonBlock = (content: string): string | null => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const findJsonStart = (open: "{" | "["): number => {
    let index = content.indexOf(open);
    while (index !== -1) {
      let nextIndex = index + 1;
      while (nextIndex < content.length && /\s/.test(content[nextIndex])) {
        nextIndex += 1;
      }
      const nextChar = content[nextIndex];
      if (
        (open === "[" && (nextChar === "{" || nextChar === "[")) ||
        (open === "{" && nextChar === '"')
      ) {
        return index;
      }
      index = content.indexOf(open, index + 1);
    }
    return -1;
  };

  const findMatchingBracket = (
    start: number,
    open: "{" | "[",
    close: "}" | "]"
  ): number => {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < content.length; i += 1) {
      const char = content[i];
      if (inString) {
        if (escape) {
          escape = false;
        } else if (char === "\\") {
          escape = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }
      if (char === '"') {
        inString = true;
      } else if (char === open) {
        depth += 1;
      } else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  };

  const arrayStart = findJsonStart("[");
  if (arrayStart !== -1) {
    const arrayEnd = findMatchingBracket(arrayStart, "[", "]");
    if (arrayEnd !== -1) {
      return content.slice(arrayStart, arrayEnd + 1).trim();
    }
  }

  const objectStart = findJsonStart("{");
  if (objectStart !== -1) {
    const objectEnd = findMatchingBracket(objectStart, "{", "}");
    if (objectEnd !== -1) {
      return content.slice(objectStart, objectEnd + 1).trim();
    }
  }

  return null;
};

export const parseJsonFromText = <T>(content: string): T => {
  try {
    return JSON.parse(content) as T;
  } catch {
    const extracted = extractJsonBlock(content);
    if (!extracted) {
      throw new Error("No JSON block found in LLM response.");
    }
    return JSON.parse(extracted) as T;
  }
};
