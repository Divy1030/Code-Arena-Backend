import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getContestProblems } from "../controllers/contest.controllers.js";
import { submitSolution, getProblem, getLeaderboard } from "../controllers/problem.controllers.js";

const router = Router();

router.route('/submit-solution/:contestId/:problemId').post(verifyJWT, submitSolution);
router.route('/get-problem/:contestId/:problemId').get(verifyJWT, getProblem);
router.route('/get-leaderboard/:contestId').get(verifyJWT, getLeaderboard);

export default router;
