import { Router } from "express";
import {
  createVoiceCharacter,
  deleteVoiceCharacter,
  getVoiceCharacter,
  getVoiceCharacters,
  updateVoiceCharacter
} from "../controllers/voiceCharacters.controller.js";

const router = Router();

router.get("/", getVoiceCharacters);
router.post("/", createVoiceCharacter);
router.get("/:id", getVoiceCharacter);
router.patch("/:id", updateVoiceCharacter);
router.delete("/:id", deleteVoiceCharacter);

export default router;
