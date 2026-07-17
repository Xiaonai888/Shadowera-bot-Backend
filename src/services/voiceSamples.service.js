import { getSupabaseAdmin } from "../config/supabase.js";

const SAMPLE_FIELDS = [
  "id",
  "character_id",
  "original_name",
  "storage_key",
  "storage_etag",
  "mime_type",
  "file_size_bytes",
  "duration_seconds",
  "transcript",
  "notes",
  "include_in_training",
  "status",
  "error_message",
  "created_at",
  "updated_at"
].join(", ");

function createDatabaseError(error, publicMessage) {
  const databaseError = new Error(error?.message || publicMessage);
  databaseError.statusCode = 500;
  databaseError.publicMessage = publicMessage;
  return databaseError;
}

function createNotFoundError() {
  const error = new Error("Voice sample not found.");
  error.statusCode = 404;
  error.publicMessage = "Voice sample not found.";
  return error;
}

function toVoiceSample(row) {
  if (!row) return null;

  return {
    id: row.id,
    characterId: row.character_id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    durationSeconds: Number(row.duration_seconds),
    transcript: row.transcript,
    notes: row.notes,
    includeInTraining: row.include_in_training,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function optionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function listVoiceSamples(characterId, { limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .select(SAMPLE_FIELDS)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw createDatabaseError(error, "Unable to load voice samples.");
  }

  return (data ?? []).map(toVoiceSample);
}

export async function getVoiceSample(characterId, sampleId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .select(SAMPLE_FIELDS)
    .eq("id", sampleId)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw createDatabaseError(error, "Unable to load this voice sample.");
  }

  if (!data) throw createNotFoundError();
  return { ...toVoiceSample(data), storageKey: data.storage_key };
}

export async function createVoiceSample({
  characterId,
  originalName,
  storageKey,
  mimeType,
  fileSizeBytes
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .insert({
      character_id: characterId,
      owner_id: null,
      original_name: originalName,
      storage_key: storageKey,
      mime_type: mimeType,
      file_size_bytes: fileSizeBytes,
      status: "uploading"
    })
    .select(SAMPLE_FIELDS)
    .single();

  if (error) {
    throw createDatabaseError(error, "Unable to prepare this voice upload.");
  }

  return toVoiceSample(data);
}

export async function completeVoiceSample(
  characterId,
  sampleId,
  { durationSeconds, storageEtag }
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .update({
      duration_seconds: durationSeconds,
      storage_etag: storageEtag,
      status: "ready",
      error_message: null
    })
    .eq("id", sampleId)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null)
    .select(SAMPLE_FIELDS)
    .maybeSingle();

  if (error) {
    throw createDatabaseError(error, "Unable to finish this voice upload.");
  }

  if (!data) throw createNotFoundError();
  return toVoiceSample(data);
}

export async function failVoiceSample(characterId, sampleId, message) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("voice_samples")
    .update({ status: "failed", error_message: message.slice(0, 500) })
    .eq("id", sampleId)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null);
}

export async function updateVoiceSample(characterId, sampleId, changes) {
  const updates = {};
  if (changes.transcript !== undefined) {
    updates.transcript = optionalText(changes.transcript);
  }
  if (changes.notes !== undefined) {
    updates.notes = optionalText(changes.notes);
  }
  if (changes.includeInTraining !== undefined) {
    updates.include_in_training = changes.includeInTraining;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .update(updates)
    .eq("id", sampleId)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null)
    .select(SAMPLE_FIELDS)
    .maybeSingle();

  if (error) {
    throw createDatabaseError(error, "Unable to update this voice sample.");
  }

  if (!data) throw createNotFoundError();
  return toVoiceSample(data);
}

export async function deleteVoiceSample(characterId, sampleId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("voice_samples")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", sampleId)
    .eq("character_id", characterId)
    .is("owner_id", null)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw createDatabaseError(error, "Unable to delete this voice sample.");
  }

  if (!data) throw createNotFoundError();
  return data.id;
}
