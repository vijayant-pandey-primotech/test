/**
 * Activity Log Service
 * Fetches raw API logs, maps to readable activities, computes onboarding progress,
 * and suggests next step. No new collections - uses existing apiLogs.
 */

import { db } from "../config/firebaseDb.js";
import {
  mapToReadableActivity,
  getMilestoneFromUrl,
  IGNORE_PATTERNS,
} from "./activityMapperService.js";

const DEFAULT_LOG_LIMIT = 100;
const DEFAULT_DAYS = 14; // Include logs from the last N days by default
const DEDUPE_WINDOW_MS = 2 * 60 * 1000; // 2 minutes: same message within window = duplicate

/** Onboarding milestones in order for progress and next step. */
export const ONBOARDING_MILESTONES = [
  "opened_dashboard",
  "viewed_community",
  "created_first_post",
  "invited_user",
];

/**
 * Fetches API logs for a user from Firebase within an optional date window.
 * @param {string|number} userId - User ID
 * @param {number} limit - Max number of logs to return
 * @param {{ days?: number }} options - Optional. days = include only logs from the last N days (default 14)
 * @returns {Promise<Array>} Raw log objects, newest first
 */
export async function fetchUserLogs(userId, limit = DEFAULT_LOG_LIMIT, options = {}) {
  const numericUserId = typeof userId === "string" ? parseInt(userId, 10) : userId;
  if (isNaN(numericUserId)) {
    throw new Error("Invalid user ID");
  }

  const days = options.days != null ? Math.max(1, parseInt(options.days, 10) || DEFAULT_DAYS) : DEFAULT_DAYS;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const apiLogRef = db.collection("apiLogs");
  const snapshot = await apiLogRef.where("userId", "==", numericUserId).get();

  let logs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // Keep only logs from the last N days
  logs = logs.filter((log) => normalizeTimestamp(log.timestamp) >= sinceMs);

  logs.sort((a, b) => {
    const tsA = normalizeTimestamp(a.timestamp);
    const tsB = normalizeTimestamp(b.timestamp);
    return tsB - tsA;
  });

  return logs.slice(0, limit);
}

/**
 * Normalize Firestore timestamp to milliseconds.
 * Handles Firestore Timestamp (_seconds, .seconds, .toMillis?), and ISO strings.
 * @param {*} t
 * @returns {number}
 */
function normalizeTimestamp(t) {
  if (t == null) return 0;
  if (typeof t === "object") {
    if (typeof t._seconds === "number") return t._seconds * 1000;
    if (typeof t.seconds === "number") return t.seconds * 1000;
    if (typeof t.toMillis === "function") return t.toMillis();
    if (typeof t.toDate === "function") return t.toDate().getTime();
  }
  if (typeof t === "number") return t > 1e12 ? t : t * 1000; // assume seconds if small
  const d = new Date(t);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/**
 * Filters out irrelevant logs (e.g. notification polling) before mapping.
 * @param {Array} rawLogs
 * @returns {Array}
 */
export function filterIrrelevantLogs(rawLogs) {
  return rawLogs.filter((log) => {
    const apiUrl = log?.apiUrl ?? log?.url ?? "";
    return !IGNORE_PATTERNS.some((re) => re.test(apiUrl));
  });
}

/**
 * Converts raw logs to readable activities (and attaches milestone when applicable).
 * @param {Array} rawLogs
 * @returns {Promise<Array<{ readableMessage: string, category: string, timestamp: Date, milestone?: string }>>}
 */
export async function mapLogsToActivities(rawLogs) {
  const results = [];
  for (const log of rawLogs) {
    const activity = await mapToReadableActivity(log);
    if (activity) {
      const apiUrl = log?.apiUrl ?? log?.url ?? "";
      const milestone = getMilestoneFromUrl(apiUrl);

      // Derive a clean route/path from the full URL (e.g. "/api/gather-assist")
      let fullRoute = "";
      if (apiUrl) {
        const withoutQuery = apiUrl.trim().split("?")[0];
        // Remove protocol and host if present
        const pathOnly = withoutQuery.replace(/^https?:\/\/[^/]+/i, "");
        fullRoute = pathOnly || withoutQuery;
        var route = fullRoute.split(" ").pop();
      }

      results.push({
        ...activity,
        milestone: activity.milestone || milestone || undefined,
        fullRoute: route||fullRoute || "",
      });
    }
  }
  return results;
}

/**
 * Removes duplicate repeated events: same readableMessage within DEDUPE_WINDOW_MS.
 * Keeps the most recent occurrence per message (activities assumed sorted by timestamp desc).
 * @param {Array} activities - Sorted by timestamp desc (newest first)
 * @returns {Array}
 */
export function deduplicateRepeatedEvents(activities) {
  const seen = new Map();
  const out = [];

  for (const a of activities) {
    const key = a.readableMessage;
    const ts = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const last = seen.get(key);
    if (last === undefined) {
      out.push(a);
      seen.set(key, ts);
    } else if (last - ts >= DEDUPE_WINDOW_MS) {
      out.push(a);
      seen.set(key, ts);
    }
  }

  return out;
}

/**
 * Computes onboarding progress from activities (milestones reached).
 * @param {Array} activities - With optional .milestone
 * @returns {{ percentage: number, completed: string[], nextMilestone: string | null }}
 */
export function computeOnboardingProgress(activities) {
  const completedSet = new Set();
  for (const a of activities) {
    if (a.milestone && ONBOARDING_MILESTONES.includes(a.milestone)) {
      completedSet.add(a.milestone);
    }
  }
  const completed = [...completedSet];
  const percentage = Math.round((completed.length / ONBOARDING_MILESTONES.length) * 100);
  const nextMilestone =
    ONBOARDING_MILESTONES.find((m) => !completedSet.has(m)) ?? null;
  return {
    percentage,
    completed,
    nextMilestone,
  };
}

/**
 * Returns human-readable next step suggestion from progress.
 * @param {{ percentage: number, completed: string[], nextMilestone: string | null }} progress
 * @returns {string}
 */
export function getNextStep(progress) {
  if (!progress) return "Complete your profile and explore the app.";
  const { nextMilestone, percentage } = progress;
  if (percentage >= 100) return "You've completed all onboarding steps. Keep exploring!";
  const steps = {
    opened_dashboard: "Open the dashboard or home screen to get started.",
    viewed_community: "Visit the community to see what others are sharing.",
    created_first_post: "Create your first post or journal entry.",
    invited_user: "Invite a friend or colleague to join.",
  };
  return (nextMilestone && steps[nextMilestone]) || "Complete your profile and explore the app.";
}

/**
 * Full pipeline: fetch logs for user, filter, map, dedupe, compute progress, next step.
 * @param {string|number} userId
 * @param {number} limit
 * @param {{ days?: number }} options - days = include only logs from the last N days (default 10)
 * @returns {Promise<{ activities: Array, progress: Object, nextStep: string }>}
 */
export async function getActivityLogsWithProgress(userId, limit = DEFAULT_LOG_LIMIT, options = {}) {
  const rawLogs = await fetchUserLogs(userId, limit, options);
  const filtered = filterIrrelevantLogs(rawLogs);
  const activities = await mapLogsToActivities(filtered);
  const deduped = deduplicateRepeatedEvents(activities);
  const progress = computeOnboardingProgress(deduped);
  const nextStep = getNextStep(progress);

  return {
    activities: deduped,
    progress: {
      percentage: progress.percentage,
      completed: progress.completed,
      nextMilestone: progress.nextMilestone,
    },
    nextStep,
  };
}
