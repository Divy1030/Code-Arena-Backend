import { Router } from "express";
import { 
  addProblems, 
  createContest, 
  deleteContest, 
  editContest, 
  enterContest, 
  getAllContests, 
  getContestById, 
  joinContest, 
  startContest,
  updateContestDetails,
  addModerators,
  getContestProblems,
  updateProblem,
  deleteProblem,
  getModerators,
  editModerator,
  deleteModerator,
  getContestParticipants,
  getUserSubmissions,
  updateContestBackground
} from "../controllers/contest.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { uploadContestBackground } from "../middlewares/upload.middleware.js";

const router = Router();

// Contest management routes
router.route('/join-contest/:contestId').post(verifyJWT, joinContest);
router.route('/getAllContests').get(verifyJWT, getAllContests);
router.route('/getContestById/:contestId').get(verifyJWT, getContestById);
router.route('/create-contest').post(verifyJWT, createContest);
router.route('/edit-contest/:contestId').put(verifyJWT, editContest);
router.route('/delete-contest/:contestId').delete(verifyJWT, deleteContest);
router.route('/enter-contest/:contestId').get(verifyJWT, enterContest);
router.route('/start-contest/:contestId').get(verifyJWT, startContest);
router.route('/update-contest-details/:contestId').put(verifyJWT, updateContestDetails);
router.route('/add-moderators/:contestId').post(verifyJWT, addModerators);

// Contest problem management routes
router.route('/add-problems/:contestId').post(verifyJWT, addProblems);
router.route('/get-problems/:contestId').get(verifyJWT, getContestProblems);
router.route('/update-problem/:contestId/:problemId').put(verifyJWT, updateProblem);
router.route('/delete-problem/:contestId/:problemId').delete(verifyJWT, deleteProblem);


// Moderator management routes
router.route('/moderators/:contestId').get(verifyJWT, getModerators);
router.route('/moderators/:contestId/:moderatorId').put(verifyJWT, editModerator);
router.route('/moderators/:contestId/:moderatorId').delete(verifyJWT, deleteModerator);

// Add the new route for getting participants
router.route('/:contestId/participants').get(verifyJWT, getContestParticipants);

// Add route for getting user's submissions
router.route('/:contestId/submissions').get(verifyJWT, getUserSubmissions);

// Add the new route for updating contest background
router.route('/background/:contestId')
  .post(
    verifyJWT, 
    uploadContestBackground.single('backgroundImage'),
    updateContestBackground
  );

export default router;