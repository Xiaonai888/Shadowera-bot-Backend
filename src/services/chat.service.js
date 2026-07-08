import OpenAI from "openai";
import { SHADOWER_INSTRUCTIONS } from "../config/shadowerPrompt.js";

const DEFAULT_MODEL = "gpt-5.4-mini";

let openaiClient;

function createPublicError(statusCode, publicMessage) {
  const error = new Error(publicMessage);
  error.statusCode = statusCode;
  error.publicMessage = publicMessage;
  return error;
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw createPublicError(
      503,
      "Shadower AI is not configured yet. OPENAI_API_KEY is missing."
    );
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey,
      timeout: 45000,
      maxRetries: 1
    });
  }

  return openaiClient;
}

function mapOpenAIError(error) {
  if (error?.status === 401) {
    return createPublicError(
      503,
      "Shadower AI configuration is invalid. Please check the OpenAI API key."
    );
  }

  if (error?.status === 429) {
    return createPublicError(
      429,
      "Shadower AI usage limit has been reached. Please try again later."
    );
  }

  if (
    error?.name === "APIConnectionTimeoutError" ||
    error?.code === "ETIMEDOUT"
  ) {
    return createPublicError(
      504,
      "Shadower AI took too long to respond. Please try again."
    );
  }

  return createPublicError(
    502,
    "Shadower AI could not generate a response. Please try again."
  );
}

export async function createChatReply(message, history = []) {
  try {
    const response = await getOpenAIClient().responses.create({
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      reasoning: {
        effort: "low"
      },
      instructions: SHADOWER_INSTRUCTIONS,
      input: [
        ...history,
        {
          role: "user",
          content: message
        }
      ],
      max_output_tokens: 1200,
      store: false
    });

    const reply = response.output_text?.trim();

    if (!reply) {
      throw createPublicError(
        502,
        "Shadower AI returned an empty response. Please try again."
      );
    }

    return reply;
  } catch (error) {
    if (error?.publicMessage) {
      throw error;
    }

    throw mapOpenAIError(error);
  }
}
