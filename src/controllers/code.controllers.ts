import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { redis } from "../config/redis.js";
import Solution from "../models/solution.model.js";

/**
 * RUN CODE → sample test cases
 */
const runCode = asyncHandler(async (req: Request, res: Response) => {
  const { code, language, testCases } = req.body;

  if (!code || !language || !Array.isArray(testCases)) {
    res.status(400).json(new ApiResponse(400, null, "Invalid payload"));
    return;
  }
  const SUPPORTED_LANGUAGES = ["python", "cpp", "java", "javascript"];

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    res.status(400).json(new ApiResponse(400, null, "Unsupported language"));
    return;
  }

  const jobId = uuidv4();

  await redis.hset(`job:${jobId}`, {
    status: "queued",
    mode: "run",
    createdAt: Date.now().toString(),
  });

  const queueKey = `code_jobs:${language.toLowerCase()}`;

  await redis.rpush(
    queueKey,
    JSON.stringify({
      jobId,
      mode: "run",
      language,
      code,
      testCases, // sample cases
    }),
  );

  res.status(202).json(new ApiResponse(202, { jobId }, "Run started"));
});

/**
 * SUBMIT CODE → all test cases
 */
const submitCode = asyncHandler(async (req: Request, res: Response) => {
  const { code, language, testCases, problemId } = req.body;

  if (!code || !language || !Array.isArray(testCases)) {
    res.status(400).json(new ApiResponse(400, null, "Invalid payload"));
    return;
  }
  const SUPPORTED_LANGUAGES = ["python", "cpp", "java", "javascript"];

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    res.status(400).json(new ApiResponse(400, null, "Unsupported language"));
    return;
  }

  const jobId = uuidv4();

  await redis.hset(`job:${jobId}`, {
    status: "queued",
    mode: "submit",
    createdAt: Date.now().toString(),
  });

  const queueKey = `code_jobs:${language.toLowerCase()}`;

  await redis.rpush(
    queueKey,
    JSON.stringify({
      jobId,
      mode: "submit",
      problemId,
      language,
      code,
      testCases, // all cases
    }),
  );

  res.status(202).json(new ApiResponse(202, { jobId }, "Submission started"));
});

/**
 * RESULT POLLING
 */
const getResult = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const result = await redis.hgetall(`job:${jobId}`);

  if (!result || !result.status) {
    res.status(404).json(new ApiResponse(404, null, "Invalid jobId"));
    return;
  }

  if (result.status !== "completed") {
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { status: result.status },
          "Execution in progress",
        ),
      );
    return;
  }

  if (result.mode === "submit" && !result.persisted) {
    await Solution.create({
      problemId: result.problemId,
      solutionCode: result.code,
      languageUsed: result.language,
      score: Number(result.score),
      testCases: JSON.parse(result.results),
    });

    await redis.hset(`job:${jobId}`, { persisted: "true" });
  }

  const ttl = result.mode === "submit" ? 600 : 120;
  await redis.expire(`job:${jobId}`, ttl);

  const response = {
    status: result.status,
    mode: result.mode,
    score: result.score ? Number(result.score) : null,
    passed: result.passed ? Number(result.passed) : null,
    total: result.total ? Number(result.total) : null,
    results: result.results ? JSON.parse(result.results) : [],
  };

  res.status(200).json(new ApiResponse(200, response, "Result fetched"));
});

export { runCode, submitCode, getResult };
