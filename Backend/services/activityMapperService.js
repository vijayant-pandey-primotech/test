/**
 * Activity Mapper Service
 * Converts raw API logs into human-readable user activity messages using pattern matching.
 * No new collections - interprets logs dynamically.
 * Category (module name) is derived from the API URL path when not overridden by a pattern.
 */

/**
 * Derives a human-readable module/category name from the API path.
 * e.g. "/api/auth/widgets/platform" → "Auth / Widgets", "/api/platforms/activities" → "Platforms / Activities"
 * @param {string} pathname - URL pathname (e.g. "/api/auth/widgets/platform")
 * @param {number} maxSegments - Max path segments to include (default 2)
 * @returns {string} Module name for use as category
 */
export function getCategoryFromUrl(pathname, maxSegments = 2) {
  if (!pathname || typeof pathname !== "string") return "Other";

  const segments = pathname
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase() !== "api");

  if (segments.length === 0) return "Other";

  const take = segments.slice(0, maxSegments);
  return take
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/-/g, " "))
    .join(" / ");
}

/**
 * Parses apiUrl (e.g. "GET /api/auth/widgets/platform?platformId=1") into components.
 * @param {string} apiUrl - Raw log apiUrl
 * @returns {{ method: string, path: string, pathname: string, query: Record<string, string> }}
 */
export function parseApiUrl(apiUrl) {
  if (!apiUrl || typeof apiUrl !== "string") {
    return { method: "", path: "", pathname: "", query: {} };
  }

  const trimmed = apiUrl.trim();
  const methodMatch = trimmed.match(/^(GET|POST|PUT|PATCH|DELETE)\s+/i);
  const method = methodMatch ? methodMatch[1].toUpperCase() : "";
  const path = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "").trim();
  const [pathname, search] = path.split("?");
  const query = {};

  if (search) {
    search.split("&").forEach((pair) => {
      const [key, value] = pair.split("=").map(decodeURIComponent);
      if (key && value !== undefined) query[key] = value;
    });
  }

  return { method, path, pathname: pathname || "", query };
}

/**
 * Endpoint patterns: regex + optional category override + message builder.
 * - category (optional): override module name; when omitted, derived from path via getCategoryFromUrl(pathname).
 * - messageBuilder: (match, query, pathname, rawLog) => string
 * - milestone (optional): for onboarding progress
 * Order matters: first match wins. Add new mappings here to scale.
 */
const ENDPOINT_PATTERNS = [
  // Life Planning / Widgets / Home
  {
    pattern: /^\/?api\/auth\/widgets\/platform\/?$/i,
    messageBuilder: () => "User opened Life Planning → Home Screen → Right Panel",
    milestone: "opened_dashboard",
  },
  {
    pattern: /^\/?api\/auth\/widgets\/platform\??/i,
    messageBuilder: (_, query) => {
      const name = query?.platformName || query?.platform || "Home";
      return `User opened Life Planning → ${name} → Right Panel`;
    },
    milestone: "opened_dashboard",
  },
  {
    pattern: /^\/?api\/admin\/widgets\/?$/i,
    messageBuilder: () => "User opened Widgets / Home configuration",
    milestone: "opened_dashboard",
  },
  {
    pattern: /^\/?api\/platforms\/platforms\/?$/i,
    messageBuilder: () => "User viewed platforms list",
    milestone: "opened_dashboard",
  },

  // Dashboard
  {
    pattern: /\/dashboard\/?$/i,
    messageBuilder: () => "User opened dashboard",
    milestone: "opened_dashboard",
  },
  {
    pattern: /\/dashboard\??/i,
    messageBuilder: () => "User opened dashboard",
    milestone: "opened_dashboard",
  },

  // Community
  {
    pattern: /\/community\/?$/i,
    messageBuilder: () => "User viewed community",
    milestone: "viewed_community",
  },
  {
    pattern: /\/community\??/i,
    messageBuilder: () => "User viewed community",
    milestone: "viewed_community",
  },
  {
    pattern: /\/api\/.*\/posts?\??/i,
    messageBuilder: (match, query) => {
      const action = match[0].toUpperCase().startsWith("POST") ? "Created" : "Viewed";
      return query?.id ? `${action} post` : `${action} posts feed`;
    },
    milestone: "created_first_post",
  },

  // Posts / Journal
  {
    pattern: /\/api\/.*\/(journal|post)s?\/?$/i,
    messageBuilder: (_, __, pathname) => {
      const type = pathname && pathname.toLowerCase().includes("journal") ? "journal" : "post";
      return `User viewed ${type}`;
    },
    milestone: null,
  },
  {
    pattern: /\/api\/.*\/(journal|post)s?\??/i,
    messageBuilder: (_, query) => {
      const id = query?.id || query?.postId;
      return id ? "User viewed a post" : "User viewed posts";
    },
    milestone: "created_first_post",
  },
  {
    pattern: /POST\s+.*\/(journal|post)s?\/?/i,
    messageBuilder: () => "User created a post",
    milestone: "created_first_post",
  },

  // Invite
  {
    pattern: /\/invite\/?$/i,
    messageBuilder: () => "User opened invite screen",
    milestone: "invited_user",
  },
  {
    pattern: /POST\s+.*\/invite/i,
    messageBuilder: () => "User invited someone",
    milestone: "invited_user",
  },
  {
    pattern: /\/api\/.*\/invite/i,
    messageBuilder: () => "User used invite flow",
    milestone: "invited_user",
  },

  // Stories / Chapters / Items (content navigation)
  {
    pattern: /\/api\/platforms\/stories-by-platforms/i,
    messageBuilder: () => "User viewed stories by platform",
  },
  {
    pattern: /\/api\/platforms\/chapters-by-platform-stories/i,
    messageBuilder: () => "User viewed chapters",
  },
  {
    pattern: /\/api\/platforms\/items-by-platform-chapters/i,
    messageBuilder: () => "User viewed items / tasks",
  },
  {
    pattern: /\/api\/platforms\/activities/i,
    messageBuilder: () => "User viewed activities",
  },

  // Settings / Profile
  {
    pattern: /\/profile\/?/i,
    messageBuilder: () => "User opened profile",
  },
  {
    pattern: /\/settings\/?/i,
    messageBuilder: () => "User opened settings",
  },

  // Fallback: generic by path segments (category derived from URL)
  {
    pattern: /^\/?api\/[^/]+\/([^/?]+)\??/i,
    messageBuilder: (_, query, pathname, rawLog) => {
      const segment = pathname && pathname.split("/").filter(Boolean).pop();
      const method = (rawLog?.apiUrl || "").toUpperCase();
      const action = method.startsWith("POST") || method.startsWith("PUT") || method.startsWith("PATCH") ? "Submitted" : "Viewed";
      const name = (segment || "page").replace(/-/g, " ");
      return `User ${action} ${name}`;
    },
    milestone: null,
  },
];

/**
 * Patterns for logs to exclude (e.g. polling, health checks).
 */
const IGNORE_PATTERNS = [
  /notification.*count|notifications\/count|poll.*notification/i,
  /heartbeat|health|ping|ready/i,
  /\/metrics\/?$/i,
  /_next\/|static\/|favicon|\.ico/i,
];

/**
 * Maps a single raw log to a readable activity, or null if ignored/unmapped.
 * @param {Object} rawLog - Log object from store (apiUrl, timestamp, etc.)
 * @returns {Promise<{ readableMessage: string, category: string, timestamp: Date } | null>}
 */
export async function mapToReadableActivity(rawLog) {
  const apiUrl = rawLog?.apiUrl ?? rawLog?.url ?? "";
  const { pathname, query } = parseApiUrl(apiUrl);
  const fullPath = pathname.replace(/^\//, "");

  if (IGNORE_PATTERNS.some((re) => re.test(apiUrl))) {
    return null;
  }

  for (const { pattern, category: categoryOverride, messageBuilder, milestone: patternMilestone } of ENDPOINT_PATTERNS) {
    const match = apiUrl.match(pattern) || fullPath.match(pattern);
    if (!match) continue;

    let readableMessage;
    try {
      readableMessage =
        typeof messageBuilder === "function"
          ? messageBuilder(match, query, pathname, rawLog)
          : messageBuilder;
    } catch (e) {
      readableMessage = "User activity";
    }

    if (!readableMessage) continue;

    let timestamp = rawLog?.timestamp;
    if (timestamp && typeof timestamp === "object" && typeof timestamp._seconds === "number") {
      timestamp = new Date(timestamp._seconds * 1000);
    } else if (typeof timestamp === "string" || typeof timestamp === "number") {
      timestamp = new Date(timestamp);
    } else if (!(timestamp instanceof Date)) {
      timestamp = new Date();
    }

    const category = categoryOverride ?? getCategoryFromUrl(pathname);

    return {
      readableMessage: String(readableMessage).trim(),
      category,
      timestamp,
      milestone: patternMilestone ?? rawLog.milestone ?? null,
    };
  }

  return null;
}

/**
 * Get milestone key for a pattern (for onboarding progress).
 * @param {string} apiUrl
 * @returns {string | null}
 */
export function getMilestoneFromUrl(apiUrl) {
  const { pathname } = parseApiUrl(apiUrl);
  const fullPath = pathname.replace(/^\//, "");

  for (const { pattern, milestone } of ENDPOINT_PATTERNS) {
    if (milestone && (apiUrl.match(pattern) || fullPath.match(pattern))) {
      return milestone;
    }
  }
  return null;
}

export { ENDPOINT_PATTERNS, IGNORE_PATTERNS };
