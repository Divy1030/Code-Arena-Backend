import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import "./controllers/socket.controllers.js";

const port = Number(process.env.PORT || 8000);

// ✅ create server ONCE
const httpServer = createServer(app);

// ✅ attach socket.io HERE
export const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

connectDB()
  .then(() => {
    httpServer.listen(port, () => {
      console.log("------------------------------------------------");
      console.log(`🚀 Server running on port ${port}`);
      console.log("------------------------------------------------");
    });
  })
  .catch((err) => {
    console.error("❌ DB connection failed", err);
    process.exit(1);
  });
