/**
 * Canonical platform scope for prompts_master duplicate checks and Redis fan-out.
 * "all" = applies to every platform (Redis uses platform id `0` in keys).
 */
export const canonicalPlatformScopeKeyFromBody = (body) => {
  const raw = body?.platform_ids ?? body?.platformIds;
  if (Array.isArray(raw) && raw.length > 0) {
    const ids = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => !Number.isNaN(n) && n > 0)
      ),
    ].sort((a, b) => a - b);
    return ids.length ? `n:${JSON.stringify(ids)}` : "all";
  }
  const single = body?.platformId ?? body?.platform_id;
  if (single !== undefined && single !== null && single !== "") {
    const n = parseInt(String(single), 10);
    if (!Number.isNaN(n) && n > 0) return `n:${JSON.stringify([n])}`;
  }
  return "all";
};

export const canonicalPlatformScopeKeyFromRow = (row) => {
  const j = row?.get?.({ plain: true }) ?? row?.dataValues ?? row;
  let ids = j.platformIds ?? j.platform_ids;
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = null;
    }
  }
  if (Array.isArray(ids) && ids.length > 0) {
    const norm = [
      ...new Set(
        ids.map((x) => parseInt(String(x), 10)).filter((n) => !Number.isNaN(n) && n > 0)
      ),
    ].sort((a, b) => a - b);
    return norm.length ? `n:${JSON.stringify(norm)}` : "all";
  }
  return "all";
};

export const normalizePlatformIdsForStorage = (body) => {
  const raw = body?.platform_ids ?? body?.platformIds;
  if (Array.isArray(raw)) {
    const ids = [
      ...new Set(
        raw
          .map((x) => parseInt(String(x), 10))
          .filter((n) => !Number.isNaN(n) && n > 0)
      ),
    ].sort((a, b) => a - b);
    return ids.length ? ids : null;
  }
  const single = body?.platformId ?? body?.platform_id;
  if (single !== undefined && single !== null && single !== "") {
    const n = parseInt(String(single), 10);
    if (!Number.isNaN(n) && n > 0) return [n];
  }
  return null;
};
