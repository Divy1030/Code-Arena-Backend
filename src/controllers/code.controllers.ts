import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { redis } from "../config/redis.js";
import Solution from "../models/solution.model.js";

const SUPPORTED_LANGUAGES = ["python", "cpp", "java", "javascript"];

/**
 * RUN CODE → sample test cases (LOW priority)
 */
const runCode = asyncHandler(async (req: Request, res: Response) => {
  let { code, language, testCases } = req.body;

  if (!code || !language || !Array.isArray(testCases)) {
    res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid payload"));
    return;
  }

  // 🔑 NORMALIZE LANGUAGE (CRITICAL)
  language = language.toLowerCase();

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    res
      .status(400)
      .json(new ApiResponse(400, null, "Unsupported language"));
    return;
  }

  const jobId = uuidv4();

  await redis.hset(`job:${jobId}`, {
    status: "queued",
    mode: "run",
    language,
    code,
    createdAt: Date.now().toString(),
  });

  // ⬇ LOW PRIORITY QUEUE
  await redis.rpush(
    `code_jobs:${language}:run`,
    JSON.stringify({
      jobId,
      mode: "run",
      language,
      code,
      testCases,
    })
  );

  res
    .status(202)
    .json(new ApiResponse(202, { jobId }, "Run started"));
});

/**
 * SUBMIT CODE → all test cases (HIGH priority)
 */
const submitCode = asyncHandler(async (req: Request, res: Response) => {
  let { code, language, testCases, problemId } = req.body;

  if (!code || !language || !Array.isArray(testCases)) {
    res
      .status(400)
      .json(new ApiResponse(400, null, "Invalid payload"));
    return;
  }

  // 🔑 NORMALIZE LANGUAGE (CRITICAL)
  language = language.toLowerCase();

  if (!SUPPORTED_LANGUAGES.includes(language)) {
    res
      .status(400)
      .json(new ApiResponse(400, null, "Unsupported language"));
    return;
  }

  const jobId = uuidv4();

  await redis.hset(`job:${jobId}`, {
    status: "queued",
    mode: "submit",
    language,
    code,
    problemId,
    createdAt: Date.now().toString(),
  });

  // ⬆ HIGH PRIORITY QUEUE
  await redis.rpush(
    `code_jobs:${language}:submit`,
    JSON.stringify({
      jobId,
      mode: "submit",
      language,
      code,
      problemId,
      testCases,
    })
  );

  res
    .status(202)
    .json(new ApiResponse(202, { jobId }, "Submission started"));
});

/**
 * RESULT POLLING
 */
const getResult = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const result = await redis.hgetall(`job:${jobId}`);

  if (!result || !result.status) {
    res
      .status(404)
      .json(new ApiResponse(404, null, "Invalid jobId"));
    return;
  }

  if (result.status !== "completed") {
    res.status(200).json(
      new ApiResponse(
        200,
        { status: result.status },
        "Execution in progress"
      )
    );
    return;
  }

  // 💾 Persist only once for submit
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

  // ⏳ TTL cleanup
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

  res
    .status(200)
    .json(new ApiResponse(200, response, "Result fetched"));
});

export { runCode, submitCode, getResult };