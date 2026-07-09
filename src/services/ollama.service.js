import { getMyAiInstructions } from "../config/myAiRules.js";

const MODEL_CACHE_MS = 15000;

let modelCache = {
  baseUrl: "",
  expiresAt: 0,
  models: []
};

function createPublicError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

export function isOllamaConfigured() {
  return Boolean(process.env.OLLAMA_BASE_URL?.trim());
}

function getBaseUrl() {
  const rawUrl = process.env.OLLAMA_BASE_URL?.trim();

  if (!rawUrl) {
    throw createPublicError(
      503,
      "My AI model server is not configured. Add OLLAMA_BASE_URL in Render."
    );
  }

  try {
    const url = new URL(rawUrl);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return url.href.replace(/\/$/, "");
  } catch {
    throw createPublicError(
      503,
      "OLLAMA_BASE_URL is invalid. Use a valid http or https URL."
    );
  }
}

function getHeaders(hasBody = false) {
  const headers = {
    Accept: "application/json"
  };

  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const apiKey = process.env.OLLAMA_API_KEY?.trim();

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeModels(payload) {
  if (!Array.isArray(payload?.models)) {
    return [];
  }

  return payload.models
    .map((item) => {
      const id =
        typeof item?.model === "string"
          ? item.model.trim()
          : typeof item?.name === "string"
            ? item.name.trim()
            : "";

      if (!id) {
        return null;
      }

      const parameterSize = item?.details?.parameter_size;
      const quantization = item?.details?.quantization_level;
      const detail = [parameterSize, quantization].filter(Boolean).join(" · ");

      return {
        id,
        label: id,
        detail
      };
    })
    .filter(Boolean);
}

export async function getOllamaModels({ silent = false, force = false } = {}) {
  let baseUrl;

  try {
    baseUrl = getBaseUrl();
  } catch (error) {
    if (silent) return [];
    throw error;
  }

  if (
    !force &&
    modelCache.baseUrl === baseUrl &&
    modelCache.expiresAt > Date.now()
  ) {
    return modelCache.models;
  }

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/tags`,
      {
        headers: getHeaders(false)
      },
      7000
    );

    if (!response.ok) {
      throw new Error(`Ollama model list failed with ${response.status}`);
    }

    const payload = await response.json();
    const models = normalizeModels(payload);

    modelCache = {
      baseUrl,
      expiresAt: Date.now() + MODEL_CACHE_MS,
      models
    };

    return models;
  } catch (error) {
    modelCache = {
      baseUrl,
      expiresAt: Date.now() + 3000,
      models: []
    };

    if (silent) {
      return [];
    }

    if (error?.name === "AbortError") {
      throw createPublicError(
        504,
        "My AI model server took too long to respond."
      );
    }

    throw createPublicError(
      503,
      "My AI is unavailable. Check Ollama and OLLAMA_BASE_URL."
    );
  }
}

function getThinkValue(intelligence) {
  if (intelligence === "high") return "high";
  if (intelligence === "medium") return "medium";
  return false;
}

export async function createOllamaReply({
  message,
  history,
  model,
  intelligence
}) {
  const models = await getOllamaModels({ force: true });

  if (!models.some((item) => item.id === model)) {
    throw createPublicError(
      400,
      "The selected My AI model is not installed or is unavailable."
    );
  }

  const baseUrl = getBaseUrl();

  try {
    const response = await fetchWithTimeout(
      `${baseUrl}/api/chat`,
      {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: getMyAiInstructions()
            },
            ...history,
            {
              role: "user",
              content: message
            }
          ],
          stream: false,
          think: getThinkValue(intelligence),
          keep_alive: process.env.OLLAMA_KEEP_ALIVE?.trim() || "10m",
          options: {
            temperature: 0.75
          }
        })
      },
      120000
    );

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || `Ollama failed with ${response.status}`);
    }

    const reply = payload?.message?.content?.trim();

    if (!reply) {
      throw createPublicError(
        502,
        "My AI returned an empty response. Please try again."
      );
    }

    return {
      reply,
      provider: "my-ai",
      model,
      intelligence
    };
  } catch (error) {
    if (error?.publicMessage) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw createPublicError(
        504,
        "My AI took too long to respond. Try a smaller model."
      );
    }

    throw createPublicError(
      502,
      "My AI could not generate a response. Check the Ollama server and model."
    );
  }
}
