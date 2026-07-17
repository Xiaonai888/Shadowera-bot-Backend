import { randomUUID } from "node:crypto";
import { getVoiceCharacter as getVoiceCharacterRecord } from "../services/voiceCharacters.service.js";
import {
  cleanEtag,
  createVoicePlayUrl,
  createVoiceUploadUrl,
  deleteVoiceObject,
  getVoiceObjectMetadata,
  voicePlayUrlSeconds
} from "../services/r2.service.js";
import {
  completeVoiceSample as completeVoiceSampleRecord,
  createVoiceSample,
  deleteVoiceSample as deleteVoiceSampleRecord,
  failVoiceSample,
  getVoiceSample,
  listVoiceSamples,
  updateVoiceSample as updateVoiceSampleRecord
} from "../services/voiceSamples.service.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_DURATION_SECONDS = 6 * 60 * 60;
const AUDIO_EXTENSIONS = new Map([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/aac", "aac"],
  ["audio/ogg", "ogg"],
  ["audio/webm", "webm"],
  ["audio/flac", "flac"],
  ["audio/x-flac", "flac"]
]);

function sendError(res, error, fallbackMessage) {
  console.error("Voice sample request failed", {
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

function validateIds(characterId, sampleId) {
  if (!isValidUuid(characterId)) return "Invalid character ID.";
  if (sampleId !== undefined && !isValidUuid(sampleId)) {
    return "Invalid voice sample ID.";
  }
  return null;
}

function normalizeMimeType(value) {
  return typeof value === "string"
    ? value.split(";", 1)[0].trim().toLowerCase()
    : "";
}

function createStorageKey(characterId, mimeType) {
  return `voice-samples/${characterId}/${randomUUID()}.${AUDIO_EXTENSIONS.get(mimeType)}`;
}

export async function getVoiceSamples(req, res) {
  const { characterId } = req.params;
  const idError = validateIds(characterId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  try {
    await getVoiceCharacterRecord(characterId);
    const samples = await listVoiceSamples(characterId, {
      limit: req.query?.limit
    });
    return res.status(200).json({ ok: true, samples });
  } catch (error) {
    return sendError(res, error, "Unable to load voice samples.");
  }
}

export async function requestVoiceUpload(req, res) {
  const { characterId } = req.params;
  const body = req.body ?? {};
  const idError = validateIds(characterId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  const originalName =
    typeof body.fileName === "string" ? body.fileName.trim() : "";
  const mimeType = normalizeMimeType(body.mimeType);
  const fileSizeBytes = Number(body.fileSizeBytes);

  if (!originalName || originalName.length > 255) {
    return res.status(400).json({
      ok: false,
      message: "Audio filename must contain 1 to 255 characters."
    });
  }
  if (!AUDIO_EXTENSIONS.has(mimeType)) {
    return res.status(400).json({
      ok: false,
      message: "Use MP3, WAV, M4A, AAC, OGG, WEBM, or FLAC audio."
    });
  }
  if (
    !Number.isInteger(fileSizeBytes) ||
    fileSizeBytes < 1 ||
    fileSizeBytes > MAX_FILE_BYTES
  ) {
    return res.status(400).json({
      ok: false,
      message: "Audio file size must be between 1 byte and 100 MB."
    });
  }

  let sample;
  try {
    await getVoiceCharacterRecord(characterId);
    const storageKey = createStorageKey(characterId, mimeType);
    sample = await createVoiceSample({
      characterId,
      originalName,
      storageKey,
      mimeType,
      fileSizeBytes
    });
    const upload = await createVoiceUploadUrl({ storageKey, mimeType });
    return res.status(201).json({ ok: true, sample, upload });
  } catch (error) {
    if (sample?.id) {
      await failVoiceSample(characterId, sample.id, "Could not create upload URL.");
    }
    return sendError(res, error, "Unable to prepare this voice upload.");
  }
}

export async function completeVoiceUpload(req, res) {
  const { characterId, sampleId } = req.params;
  const idError = validateIds(characterId, sampleId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  const durationSeconds = Number(req.body?.durationSeconds);
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_DURATION_SECONDS
  ) {
    return res.status(400).json({
      ok: false,
      message: "Audio duration must be greater than 0 and no more than 6 hours."
    });
  }

  try {
    const currentSample = await getVoiceSample(characterId, sampleId);
    const object = await getVoiceObjectMetadata(currentSample.storageKey);
    const uploadedBytes = Number(object.ContentLength);

    if (uploadedBytes !== currentSample.fileSizeBytes) {
      await deleteVoiceObject(currentSample.storageKey);
      await failVoiceSample(characterId, sampleId, "Uploaded file size did not match.");
      return res.status(400).json({
        ok: false,
        message: "Uploaded audio size did not match the selected file. Please retry."
      });
    }

    const sample = await completeVoiceSampleRecord(characterId, sampleId, {
      durationSeconds,
      storageEtag: cleanEtag(object.ETag)
    });
    return res.status(200).json({ ok: true, sample });
  } catch (error) {
    const notUploaded =
      error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404;
    if (notUploaded) {
      return res.status(400).json({
        ok: false,
        message: "Audio upload was not found or is not complete."
      });
    }
    return sendError(res, error, "Unable to finish this voice upload.");
  }
}

export async function getVoicePlayUrl(req, res) {
  const { characterId, sampleId } = req.params;
  const idError = validateIds(characterId, sampleId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  try {
    const sample = await getVoiceSample(characterId, sampleId);
    if (sample.status !== "ready") {
      return res.status(409).json({
        ok: false,
        message: "This voice sample is not ready to play."
      });
    }
    const url = await createVoicePlayUrl(sample.storageKey);
    return res.status(200).json({
      ok: true,
      url,
      expiresIn: voicePlayUrlSeconds
    });
  } catch (error) {
    return sendError(res, error, "Unable to play this voice sample.");
  }
}

export async function updateVoiceSample(req, res) {
  const { characterId, sampleId } = req.params;
  const body = req.body ?? {};
  const idError = validateIds(characterId, sampleId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  const fields = ["transcript", "notes", "includeInTraining"].filter(
    (field) => body[field] !== undefined
  );
  if (!fields.length) {
    return res.status(400).json({ ok: false, message: "No sample changes provided." });
  }
  if (
    body.transcript !== undefined &&
    body.transcript !== null &&
    (typeof body.transcript !== "string" || body.transcript.length > 12000)
  ) {
    return res.status(400).json({ ok: false, message: "Transcript is invalid or too long." });
  }
  if (
    body.notes !== undefined &&
    body.notes !== null &&
    (typeof body.notes !== "string" || body.notes.length > 1000)
  ) {
    return res.status(400).json({ ok: false, message: "Notes are invalid or too long." });
  }
  if (
    body.includeInTraining !== undefined &&
    typeof body.includeInTraining !== "boolean"
  ) {
    return res.status(400).json({
      ok: false,
      message: "includeInTraining must be true or false."
    });
  }

  try {
    const changes = Object.fromEntries(fields.map((field) => [field, body[field]]));
    const sample = await updateVoiceSampleRecord(characterId, sampleId, changes);
    return res.status(200).json({ ok: true, sample });
  } catch (error) {
    return sendError(res, error, "Unable to update this voice sample.");
  }
}

export async function deleteVoiceSample(req, res) {
  const { characterId, sampleId } = req.params;
  const idError = validateIds(characterId, sampleId);
  if (idError) return res.status(400).json({ ok: false, message: idError });

  try {
    const sample = await getVoiceSample(characterId, sampleId);
    await deleteVoiceObject(sample.storageKey);
    const deletedSampleId = await deleteVoiceSampleRecord(characterId, sampleId);
    return res.status(200).json({ ok: true, deletedSampleId });
  } catch (error) {
    return sendError(res, error, "Unable to delete this voice sample.");
  }
}
