import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";

import {
  getProblem,
  submitSolution,
  getLeaderboard,
} from "../controllers/problem.controllers.js";

import { getContestProblems } from "../controllers/contest.controllers.js";
<<<<<<< HEAD
import { submitSolution, getProblem, getLeaderboard, getAllProblems } from "../controllers/problem.controllers.js";

const router = Router();

router.route('/submit-solution/:contestId/:problemId').post(verifyJWT, submitSolution);
router.route('/get-problem/:contestId/:problemId').get(verifyJWT, getProblem);
router.route('/get-leaderboard/:contestId').get(verifyJWT, getLeaderboard);
router.route('/get-all-problems').get(verifyJWT, getAllProblems);
=======

const router = Router();

// Submit solution for a problem
router
  .route("/submit-solution/:contestId/:problemId")
  .post(verifyJWT, submitSolution);
>>>>>>> 6e81763c3af700dfb5416e6e1692c6a14c4859d0

// Get a specific problem
router
  .route("/get-problem/:contestId/:problemId")
  .get(verifyJWT, getProblem);

// Get leaderboard for a contest
router
  .route("/get-leaderboard/:contestId")
  .get(verifyJWT, getLeaderboard);

export { router as problemRouter };
