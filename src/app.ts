import express, { urlencoded, Request, Response, NextFunction, ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import testRouter from "./routes/test.routes.js";
import authRouter from "./routes/user.routes.js"; // This is actually the user routes file
import codeRouter from "./routes/code.routes.js";
import adminRouter from "./routes/admin.routes.js";
import contestRouter from "./routes/contest.routes.js";
import problemRouter from "./routes/problem.routes.js";
import socialRoutes from "./routes/social.routes.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { ApiError } from "./utils/ApiError.js";
import { ApiResponse } from "./utils/ApiResponse.js";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: false,
  },
});

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);
  
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes
app.use('/api/v1', testRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/code', codeRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/contest', contestRouter);
app.use('/api/v1/problem', problemRouter);
app.use("/api/v1/social", socialRoutes);

// Handle 404 routes (must be after all routes, before error middleware)
app.use((req: Request, res: Response, next: NextFunction) => {
  const response = new ApiResponse(404, null, `Route ${req.originalUrl} not found`);
  res.status(404).json(response);
});

// Error handling middleware - MUST BE ABSOLUTE LAST (4 parameters)
const errorHandler: ErrorRequestHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error caught by middleware:', err);
  
  // Handle ApiError instances
  if (err instanceof ApiError) {
    const response = new ApiResponse(
      err.statusCode,
      err.data,
      err.message
    );
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle other errors
  console.error('Unhandled error:', err);
  const response = new ApiResponse(
    500,
    null,
    process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  );
  res.status(500).json(response);
};

app.use(errorHandler);

// Start the HTTP server
httpServer.listen(8000, () => {
  console.log(`Server is running on port 8000`);
});

export { app, io, httpServer };
