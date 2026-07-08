import { createChatReply } from "../services/chat.service.js";

const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARACTERS = 30000;
const MAX_MESSAGE_CHARACTERS = 12000;
const ALLOWED_ROLES = new Set(["user", "assistant"]);

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalized = [];
  let totalCharacters = 0;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];

    if (
      !item ||
      !ALLOWED_ROLES.has(item.role) ||
      typeof item.text !== "string"
    ) {
      continue;
    }

    const text = item.text.trim().slice(0, MAX_MESSAGE_CHARACTERS);

    if (!text) {
      continue;
    }

    if (totalCharacters + text.length > MAX_HISTORY_CHARACTERS) {
      break;
    }

    normalized.unshift({
      role: item.role,
      content: text
    });

    totalCharacters += text.length;

    if (normalized.length >= MAX_HISTORY_MESSAGES) {
      break;
    }
  }

  return normalized;
}

export async function sendChatMessage(req, res) {
  const { message, history } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({
      ok: false,
      message: "Message is required"
    });
  }

  const cleanMessage = message.trim();

  if (cleanMessage.length > MAX_MESSAGE_CHARACTERS) {
    return res.status(400).json({
      ok: false,
      message: "Message must not exceed 12,000 characters"
    });
  }

  try {
    const reply = await createChatReply(
      cleanMessage,
      normalizeHistory(history)
    );

    return res.status(200).json({
      ok: true,
      reply
    });
  } catch (error) {
    console.error("Chat generation failed", {
      name: error?.name,
      status: error?.status,
      statusCode: error?.statusCode,
      code: error?.code,
      message: error?.message
    });

    return res.status(error?.statusCode || 500).json({
      ok: false,
      message:
        error?.publicMessage ||
        "Shadower AI is temporarily unavailable. Please try again."
    });
  }
}
