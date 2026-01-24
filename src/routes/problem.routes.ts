import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
  getProblem,
  submitSolution,
  getLeaderboard,
} from "../controllers/problem.controllers.js";

import { getContestProblems } from "../controllers/contest.controllers.js";

const router = Router();

// Submit solution for a problem
router
  .route("/submit-solution/:contestId/:problemId")
  .post(verifyJWT, submitSolution);

// Get a specific problem
router
  .route("/get-problem/:contestId/:problemId")
  .get(verifyJWT, getProblem);

// Get leaderboard for a contest
router
  .route("/get-leaderboard/:contestId")
  .get(verifyJWT, getLeaderboard);

export { router as problemRouter };
