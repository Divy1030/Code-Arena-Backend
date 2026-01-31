import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/user.model.js";
import Contest from "../models/contest.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import mongoose from "mongoose";
import Problem from "../models/problem.model.js";
import Solution from "../models/solution.model.js";
import { IProblem } from "../types/problem.types.js";
import { IContest } from "../types/contest.types.js";
import { IUser } from "../types/user.types.js";

const submitSolution = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    //TODO:
    //1. get contestId and ProblemId from the params
    //2. find user and validate if it is a participant of the contest or not
    //3. get all the solution details from the req body
    //4. update problem score to take only the max value to be stored in problem score which is inside the contestParticipated array
    //5. update the contest score to be the sum of all the problems score
    //6. return the response
    //7. update the user rating based on the contest score
    //8. update the user rank based on the contest score
    const { contestId, problemId } = req.params;

    const contest = await Contest.findById(contestId);
    const problem = await Problem.findById(problemId);
    const userId = (req as any).user._id;
    const user = await User.findById(userId);
    if (!contest) {
      throw new ApiError(404, "Contest not found");
    }
    if (!problem) {
      throw new ApiError(404, "Problem not found");
    }
    if (!userId) {
      throw new ApiError(404, "User not found");
    }
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Fix participant check
    const isParticipant = contest.participants.some(
      (p: any) => p.userId.toString() === userId.toString()
    );
    if (!isParticipant) {
      throw new ApiError(403, "User is not a participant of the contest");
    }
    const {
      score,
      solutionCode,
      languageUsed,
      timeOccupied,
      memoryOccupied,
      timeGivenOnSolution,
    } = req.body;
    if (score === undefined || score === null) {
      throw new ApiError(400, "Score is required");
    }
    if (!solutionCode) {
      throw new ApiError(400, "Solution code is required");
    }

    if (!languageUsed) {
      throw new ApiError(400, "Language Used is required");
    }
    // if (!timeOccupied) {
    //   throw new ApiError(400, "Time Occupied is required");
    // }
    // if (memoryOccupied === undefined || memoryOccupied === null) {
    //   throw new ApiError(400, "Memory Occupied is required");
    // }
    // if (!timeGivenOnSolution) {
    //   throw new ApiError(400, "Time Given On Solution is required");
    // }
    // Calculate actualMaxScore before creating solution
    const actualMaxScore = problem.maxScore > 0 
      ? problem.maxScore 
      : (problem.testCases?.length || 0) * 100;

    console.log('💾 Creating solution with:', {
      userId: userId.toString(),
      problemId,
      score,
      actualMaxScore,
      expectedStatus: score >= actualMaxScore ? 'correct' : score > 0 ? 'partially correct' : 'wrong'
    });

    const solution = await Solution.create({
      userId,
      contestId,
      problemId: new mongoose.Types.ObjectId(problemId),
      score,
      maxScore: actualMaxScore,
      solutionCode,
      languageUsed,
      timeOccupied,
      memoryOccupied,
      timeGivenOnSolution,
    });
    if (!solution) {
      throw new ApiError(500, "Solution not created");
    }

    console.log('✅ Solution created:', {
      id: solution._id,
      score: solution.score,
      maxScore: (solution as any).maxScore,
      status: solution.score >= ((solution as any).maxScore || actualMaxScore) ? 'correct' : solution.score > 0 ? 'partially correct' : 'wrong'
    });

    // Add solution to contest's submissions array
    contest.submissions = contest.submissions || [];
    contest.submissions.push(solution._id as mongoose.Types.ObjectId);
    await contest.save();

    console.log(`✅ Solution ${solution._id} added to contest submissions. Total submissions: ${contest.submissions.length}`);

    if (!Array.isArray(user.contestsParticipated)) {
      throw new ApiError(400, "User contestsParticipated is not a valid array");
    }

    const contestEntry = user.contestsParticipated.find(
      (c: any) => c?.contestId?.toString() === contestId
    );

    if (!contestEntry) {
      throw new ApiError(400, "User has not participated in this contest");
    }

    // Ensure contestProblems is always an array
    if (!Array.isArray(contestEntry.contestProblems)) {
      contestEntry.contestProblems = [];
    }

    // Find the contestProblem entry for this problem
    let problemEntry = contestEntry.contestProblems.find(
      (p: any) => p && p.problemId && p.problemId.toString() === problemId
    );

    const subStatus: "correct" | "wrong" | "partially correct" =
      score === problem.maxScore
        ? "correct"
        : score > 0
          ? "partially correct"
          : "wrong";

    console.log('📝 Submission details:', {
      problemId,
      score,
      maxScore: problem.maxScore,
      subStatus,
      isCorrect: subStatus === "correct"
    });

    // Recalculate submission status with actual max score
    const actualStatus: "correct" | "wrong" | "partially correct" =
      score >= actualMaxScore
        ? "correct"
        : score > 0
          ? "partially correct"
          : "wrong";

    console.log('✅ Corrected submission details:', {
      actualMaxScore,
      actualStatus,
      willUpdateGlobalStats: actualStatus === "correct",
      storingMaxScore: actualMaxScore
    });

    if (!problemEntry) {
      // If not present, push a new entry
      contestEntry.contestProblems.push({
        problemId: new mongoose.Types.ObjectId(problemId),
        score,
        submissionTime: new Date(),
        submissionStatus: actualStatus,
      });
    } else {
      // Update score to max of previous and new
      problemEntry.score = Math.max(problemEntry.score || 0, score);
      problemEntry.submissionTime = new Date();
      problemEntry.submissionStatus = actualStatus;
    }

    // Update contest score to sum of all contestProblems scores
    contestEntry.score = contestEntry.contestProblems.reduce(
      (acc: number, p: any) => acc + (p.score || 0),
      0
    );

    // Update global solvedProblems if this is the first correct submission for this problem
    let solvedForFirstTime = false;
    if (actualStatus === "correct") {
      const alreadySolved = user.solvedProblems.some(
        (sp: any) => sp.problemId.toString() === problemId
      );
      
      if (!alreadySolved) {
        solvedForFirstTime = true;
        user.solvedProblems.push({
          problemId: new mongoose.Types.ObjectId(problemId),
          solvedAt: new Date(),
        });
        
        // Update rating - simple increment for now (can be made more sophisticated)
        user.rating = (user.rating || 1000) + 10;
        
        console.log(`\u2705 First time solving problem ${problemId}! Rating: ${user.rating}, Total solved: ${user.solvedProblems.length}`);
      } else {
        console.log(`\ud83d\udd04 Problem ${problemId} already solved before`);
      }
    }

    console.log("User stats:", {
      username: user.username,
      rating: user.rating,
      totalSolved: user.solvedProblems.length,
      contestScore: contestEntry.score
    });

    await user.save();

    res
      .status(201)
      .json(
        new ApiResponse(201, { 
          user, 
          solvedForFirstTime,
          stats: {
            rating: user.rating,
            totalSolved: user.solvedProblems.length,
            contestScore: contestEntry.score
          }
        }, "Solution submitted and scores updated")
      );
  }
);

const getProblem = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user._id;
    const { contestId, problemId } = req.params;
    const contest = await Contest.findById(contestId);
    if (!contest) {
      throw new ApiError(404, "Contest not found");
    }
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }
    const isParticipant = contest.participants.some(
      (p: any) => p.userId.toString() === userId.toString()
    );
    if (!isParticipant) {
      throw new ApiError(403, "User is not a participant of the contest");
    }
    const problem = await Problem.findById(problemId);
    if (!problem) {
      throw new ApiError(404, "Problem not found");
    }

    // Fetch user's previous solution for this problem
    let userSolution = null;
    try {
      userSolution = await Solution.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        problemId: new mongoose.Types.ObjectId(problemId),
        contestId: new mongoose.Types.ObjectId(contestId),
      })
        .sort({ createdAt: -1 }) // Get the most recent solution
        .select("solutionCode languageUsed score timeOccupied memoryOccupied createdAt");
    } catch (error) {
      console.error("Error fetching user solution:", error);
    }

    res
      .status(200)
      .json(new ApiResponse(200, { ...problem.toObject(), userSolution }, "Problem fetched successfully"));
  }
);

const getLeaderboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { contestId } = req.params;
    const contest = await Contest.findById(contestId);
    if (!contest) {
      throw new ApiError(404, "Contest not found");
    }

    // Get all participants of the contest
    const participantIds = contest.participants.map((p: any) => p.userId);

    // Fetch users who participated in this contest
    const users = await User.find({
      _id: { $in: participantIds },
      "contestsParticipated.contestId": contestId,
    }).select("username profilePicture contestsParticipated");

    // Build leaderboard data
    const leaderboard = users
      .map((user: any) => {
        const contestEntry = user.contestsParticipated.find(
          (c: any) => c.contestId?.toString() === contestId
        );

        const score = contestEntry?.score || 0;
        
        // Count unique problems with correct submissions
        const uniqueProblemIds = new Set(
          contestEntry?.contestProblems
            ?.filter((p: any) => p.submissionStatus === "correct")
            .map((p: any) => p.problemId.toString()) || []
        );
        const problemsSolved = uniqueProblemIds.size;

        return {
          userId: user._id,
          username: user.username,
          profilePicture: user.profilePicture,
          score,
          problemsSolved,
        };
      })
      .sort((a: any, b: any) => b.score - a.score) // Sort by score descending
      .map((entry: any, index: number) => ({
        ...entry,
        rank: index + 1,
      }));

    res
      .status(200)
      .json(
        new ApiResponse(200, leaderboard, "Leaderboard fetched successfully")
      );
  }
);

const getAllProblems = asyncHandler( async (req: Request, res: Response) : Promise<void> => {
  const problems = await Problem.find();
  res.status(200).json(new ApiResponse(200, problems, "All problems fetched successfully"));
})

const getProblemById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { problemId } = req.params;
    const userId = (req as any).user?._id;

    // Populate the solution field to get full solution details
    const problem = await Problem.findById(problemId).populate({
      path: "solution",
      select: "solutionCode languageUsed score testCases timeOccupied memoryOccupied createdAt",
    });
    
    if (!problem) {
      throw new ApiError(404, "Problem not found");
    }

    // If user is authenticated, fetch their solution for this problem
    let userSolution = null;
    if (userId) {
      // Get the most recent solution by this user for this problem
      userSolution = await Solution.findOne({
        problemId: new mongoose.Types.ObjectId(problemId),
        userId: new mongoose.Types.ObjectId(userId),
      })
        .sort({ createdAt: -1 }) // Get the most recent solution
        .select("solutionCode languageUsed score testCases timeOccupied memoryOccupied createdAt");
    }

    res.status(200).json(
      new ApiResponse(
        200,
        {
          problem,
          userSolution,
        },
        "Problem fetched successfully"
      )
    );
  }
);

export { submitSolution, getProblem, getLeaderboard, getAllProblems, getProblemById };
