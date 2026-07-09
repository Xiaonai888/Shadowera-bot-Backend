import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { corsOptions } from "./src/config/cors.js";
import chatRoutes from "./src/routes/chat.routes.js";
import chatSessionsRoutes from "./src/routes/chatSessions.routes.js";
import healthRoutes from "./src/routes/health.routes.js";
import { notFound } from "./src/middleware/notFound.middleware.js";
import { errorHandler } from "./src/middleware/error.middleware.js";

dotenv.config();

const app = express();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.get("/", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Shadower Backend API is running"
  });
});

app.use("/health", healthRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/chats", chatSessionsRoutes);

app.use(notFound);
app.use(errorHandler);

const port = Number(process.env.PORT) || 5000;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Shadower Backend running on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
