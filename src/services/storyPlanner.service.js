const API_ROOT = "https://api.cloudflare.com/client/v4";
const DEFAULT_PLANNER_MODEL =
  process.env.CLOUDFLARE_STORY_PLANNER_MODEL?.trim() ||
  "@cf/qwen/qwen3-30b-a3b-fp8";
const PLANNER_TIMEOUT_MS = 90000;
const HISTORY_LIMIT = 12;
const HISTORY_MESSAGE_LIMIT = 1800;

const STORY_INTENTS = new Set([
  "write_story",
  "continue_story"
]);

function getCredentials() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

  if (!accountId || !apiToken) {
    throw new Error("Cloudflare Workers AI is not configured.");
  }

  return {
    accountId,
    apiToken
  };
}

function normalizeString(value, maxLength = 1200) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function normalizeList(value, limit = 14, itemLength = 700) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim().slice(0, itemLength))
    )
  ].slice(0, limit);
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim()
    )
    .slice(-HISTORY_LIMIT)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, HISTORY_MESSAGE_LIMIT)
    }));
}

function normalizeMemory(memory) {
  if (!memory) {
    return null;
  }

  return {
    summary: normalizeString(memory.summary, 5000),
    importantFacts: normalizeList(memory.important_facts, 20, 500),
    userPreferences: normalizeList(memory.user_preferences, 20, 500),
    storyFacts: normalizeList(memory.story_facts, 30, 600)
  };
}

function extractText(payload) {
  const result = payload?.result ?? payload;

  const candidates = [
    result?.response,
    result?.output_text,
    result?.choices?.[0]?.message?.content,
    result?.choices?.[0]?.text,
    payload?.response,
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.text,
    typeof result === "string" ? result : ""
  ];

  return candidates.find(
    (value) => typeof value === "string" && value.trim()
  )?.trim();
}

function extractJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) {
    throw new Error("Story planner did not return JSON.");
  }

  return JSON.parse(text.slice(start, end + 1));
}

function createFallbackPlan({ message, analysis, source }) {
  const continuation = analysis?.intent === "continue_story";

  return {
    mode: continuation ? "continuation" : "new_scene",
    pointOfView: "Use the latest confirmed or explicitly requested point of view.",
    startingPoint: continuation
      ? "Continue immediately after the latest established ending without recap."
      : "Begin at the scene opening requested by the user.",
    sceneGoal:
      normalizeString(analysis?.userGoal, 900) ||
      normalizeString(message, 900),
    conflict: "Use only conflict supported by the request and known context.",
    emotionalTurn:
      "Create a meaningful emotional change without contradicting established characterization.",
    endingTarget:
      "End at a natural scene boundary while preserving unresolved threads.",
    characters: [],
    continuityChecks: [
      "Names and relationships",
      "Timeline and location",
      "Point of view and character knowledge",
      "Physical state, injuries, abilities, and accessibility",
      "Objects, positions, and unresolved threads"
    ],
    mustNotChange: normalizeList(
      [
        ...(analysis?.constraints || []),
        ...(analysis?.mustPreserve || [])
      ],
      20,
      700
    ),
    openQuestions: [],
    source
  };
}

function normalizePlan(value, fallback) {
  return {
    mode:
      value?.mode === "continuation" || value?.mode === "new_scene"
        ? value.mode
        : fallback.mode,
    pointOfView:
      normalizeString(value?.pointOfView) || fallback.pointOfView,
    startingPoint:
      normalizeString(value?.startingPoint) || fallback.startingPoint,
    sceneGoal:
      normalizeString(value?.sceneGoal) || fallback.sceneGoal,
    conflict:
      normalizeString(value?.conflict) || fallback.conflict,
    emotionalTurn:
      normalizeString(value?.emotionalTurn) || fallback.emotionalTurn,
    endingTarget:
      normalizeString(value?.endingTarget) || fallback.endingTarget,
    characters: normalizeList(value?.characters),
    continuityChecks: normalizeList(
      value?.continuityChecks,
      16,
      700
    ),
    mustNotChange: normalizeList(value?.mustNotChange, 20, 700),
    openQuestions: normalizeList(value?.openQuestions, 10, 700),
    source: "model"
  };
}

export async function createStoryPlan({
  message,
  history = [],
  analysis,
  memory = null
}) {
  if (!STORY_INTENTS.has(analysis?.intent)) {
    return null;
  }

  const cleanMessage =
    typeof message === "string" ? message.trim() : "";
  const cleanHistory = normalizeHistory(history);
  const fallback = createFallbackPlan({
    message: cleanMessage,
    analysis,
    source: "rules"
  });

  try {
    const { accountId, apiToken } = getCredentials();
    const endpoint =
      `${API_ROOT}/accounts/${accountId}/ai/run/${DEFAULT_PLANNER_MODEL}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PLANNER_TIMEOUT_MS
    );

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          messages: [
            {
              role: "system",
              content: [
                "Create a compact execution plan for a fiction-writing request.",
                "Do not write the story and do not reveal private reasoning.",
                "Use only the supplied request, recent conversation, request analysis, and long-term memory.",
                "For continuation, begin exactly after the latest established ending without recap, restart, or unsupported time jump.",
                "Separate confirmed facts from open questions and never invent protected facts.",
                "Check point of view, character knowledge, timeline, location, physical state, accessibility, objects, relationships, and unresolved threads.",
                "Return one valid JSON object only, without markdown.",
                "Use this exact shape:",
                '{"mode":"continuation|new_scene","pointOfView":"string","startingPoint":"string","sceneGoal":"string","conflict":"string","emotionalTurn":"string","endingTarget":"string","characters":["string"],"continuityChecks":["string"],"mustNotChange":["string"],"openQuestions":["string"]}'
              ].join(" ")
            },
            {
              role: "user",
              content: JSON.stringify({
                latestMessage: cleanMessage,
                requestAnalysis: analysis,
                recentHistory: cleanHistory,
                longTermMemory: normalizeMemory(memory)
              })
            }
          ],
          stream: false,
          max_tokens: 1000,
          temperature: 0.12,
          top_p: 0.76,
          repetition_penalty: 1.03
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok || payload?.success === false) {
        return {
          ...fallback,
          source: "rules_after_model_error"
        };
      }

      const text = extractText(payload);

      if (!text) {
        return {
          ...fallback,
          source: "rules_after_empty_model"
        };
      }

      return normalizePlan(extractJsonObject(text), fallback);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("Story planning failed", {
      name: error?.name,
      message: error?.message
    });

    return {
      ...fallback,
      source: "rules_after_exception"
    };
  }
}
