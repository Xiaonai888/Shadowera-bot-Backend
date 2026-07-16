import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "Shadower Backend",
    repository: "Xiaonai888/Shadowera-bot-Backend",
    apiVersion: "1.1.0",
    status: "healthy",
    features: {
      smartMemory: true,
      smartSummary: true
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
