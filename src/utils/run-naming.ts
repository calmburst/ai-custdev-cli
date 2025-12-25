export const formatRunTimestamp = (date: Date): string => {
  const iso = date.toISOString();
  return iso.replace("T", "_").replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
};

export const slugify = (value: string): string => {
  const ascii = value.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
};

export const normalizeTags = (tags: string[]): string[] =>
  tags.map((tag) => slugify(tag)).filter((tag) => tag.length > 0);

export const buildRunLabel = (params: {
  timestamp: string;
  runName?: string;
  tags?: string[];
}): string => {
  const parts: string[] = [params.timestamp];
  const runName = params.runName ? slugify(params.runName) : "";
  if (runName) {
    parts.push(runName);
  }
  const tagSlugs = params.tags ? normalizeTags(params.tags) : [];
  if (tagSlugs.length > 0) {
    parts.push(tagSlugs.join("-"));
  }
  return parts.join("__");
};
