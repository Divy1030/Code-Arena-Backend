import { Router } from "express";
import {
  runCode,
  submitCode,
  getResult,
} from "../controllers/code.controllers.js";

const router = Router();

// Run with sample test cases
router.post("/run", runCode);

// Submit with all test cases
router.post("/submit", submitCode);

// Poll result
router.get("/result/:jobId", getResult);

export default router;
