import {
  createVoiceCharacter as createVoiceCharacterRecord,
  deleteVoiceCharacter as deleteVoiceCharacterRecord,
  getVoiceCharacter as getVoiceCharacterRecord,
  listVoiceCharacters,
  updateVoiceCharacter as updateVoiceCharacterRecord
} from "../services/voiceCharacters.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FIELD_LIMITS = {
  name: 120,
  displayName: 120,
  language: 80,
  voiceRole: 80,
  linkedStory: 160,
  description: 500,
  avatarUrl: 2048
};

const EDITABLE_FIELDS = Object.keys(FIELD_LIMITS);

function sendError(res, error, fallbackMessage) {
  console.error("Voice character request failed", {
    name: error?.name,
    statusCode: error?.statusCode,
    message: error?.message
  });

  return res.status(error?.statusCode || 500).json({
    ok: false,
    message: error?.publicMessage || fallbackMessage
  });
}

function isValidUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function isValidOptionalText(value, maxLength) {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length <= maxLength)
  );
}

function isValidRequiredText(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length >= 1 &&
    value.trim().length <= maxLength
  );
}

function isValidAvatarUrl(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || value.length > FIELD_LIMITS.avatarUrl) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateCharacterFields(body, { partial = false } = {}) {
  const errors = [];

  if (!partial || body.name !== undefined) {
    if (!isValidRequiredText(body.name, FIELD_LIMITS.name)) {
      errors.push("Character name must contain 1 to 120 characters.");
    }
  }

  if (!partial || body.language !== undefined) {
    if (!isValidRequiredText(body.language, FIELD_LIMITS.language)) {
      errors.push("Language must contain 1 to 80 characters.");
    }
  }

  if (!partial || body.voiceRole !== undefined) {
    if (!isValidRequiredText(body.voiceRole, FIELD_LIMITS.voiceRole)) {
      errors.push("Voice role must contain 1 to 80 characters.");
    }
  }

  for (const field of ["displayName", "linkedStory", "description"]) {
    if (
      body[field] !== undefined &&
      !isValidOptionalText(body[field], FIELD_LIMITS[field])
    ) {
      errors.push(`${field} is too long or invalid.`);
    }
  }

  if (!isValidAvatarUrl(body.avatarUrl)) {
    errors.push("Avatar URL must be a valid HTTP or HTTPS URL.");
  }

  return errors;
}

export async function getVoiceCharacters(req, res) {
  try {
    const characters = await listVoiceCharacters({ limit: req.query?.limit });
    return res.status(200).json({ ok: true, characters });
  } catch (error) {
    return sendError(res, error, "Unable to load voice characters.");
  }
}

export async function getVoiceCharacter(req, res) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ ok: false, message: "Invalid character ID." });
  }

  try {
    const character = await getVoiceCharacterRecord(id);
    return res.status(200).json({ ok: true, character });
  } catch (error) {
    return sendError(res, error, "Unable to load this voice character.");
  }
}

export async function createVoiceCharacter(req, res) {
  const body = req.body ?? {};
  const errors = validateCharacterFields(body);

  if (body.permissionConfirmed !== true) {
    errors.push("Voice ownership or permission must be confirmed.");
  }

  if (errors.length) {
    return res.status(400).json({ ok: false, message: errors[0], errors });
  }

  try {
    const character = await createVoiceCharacterRecord(body);
    return res.status(201).json({ ok: true, character });
  } catch (error) {
    return sendError(res, error, "Unable to create this voice character.");
  }
}

export async function updateVoiceCharacter(req, res) {
  const { id } = req.params;
  const body = req.body ?? {};

  if (!isValidUuid(id)) {
    return res.status(400).json({ ok: false, message: "Invalid character ID." });
  }

  const suppliedFields = EDITABLE_FIELDS.filter(
    (field) => body[field] !== undefined
  );

  if (!suppliedFields.length) {
    return res.status(400).json({
      ok: false,
      message: "No character changes were provided."
    });
  }

  const errors = validateCharacterFields(body, { partial: true });
  if (errors.length) {
    return res.status(400).json({ ok: false, message: errors[0], errors });
  }

  try {
    const changes = Object.fromEntries(
      suppliedFields.map((field) => [field, body[field]])
    );
    const character = await updateVoiceCharacterRecord(id, changes);
    return res.status(200).json({ ok: true, character });
  } catch (error) {
    return sendError(res, error, "Unable to update this voice character.");
  }
}

export async function deleteVoiceCharacter(req, res) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ ok: false, message: "Invalid character ID." });
  }

  try {
    const deletedCharacterId = await deleteVoiceCharacterRecord(id);
    return res.status(200).json({ ok: true, deletedCharacterId });
  } catch (error) {
    return sendError(res, error, "Unable to delete this voice character.");
  }
}
