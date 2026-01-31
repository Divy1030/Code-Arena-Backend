import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { IContest } from "../types/contest.types.js";
import Contest from "../models/contest.model.js";
import { IUser } from "../types/user.types.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import Problem from "../models/problem.model.js";
import Solution from "../models/solution.model.js";
import cloudinary from "../config/cloudinary.js";


const createContest = asyncHandler(async (req: Request, res: Response) => {
  const {
    title,
    description,
    startTime,
    endTime,
    duration,
    problems,
    isRated,
    tags,
    rules,
  } = req.body;

  const userId = req.user?._id; // Ensure req.user is properly typed
  const user = await User.findById(userId);

  if (!user || user.role !== "admin") {
    throw new ApiError(403, "You are not authorized to create a contest");
  }

  // Create the contest
  const contest = await Contest.create({
    title,
    description,
    organizer: userId,
    startTime,
    endTime,
    duration,
    problems,
    isRated,
    tags,
    rules,
  });

  // Push the entire contest details to the user's contestsCreated array
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        contestsCreated: {
          contestId: contest._id,
          title: contest.title,
          description: contest.description,
          startTime: contest.startTime,
          endTime: contest.endTime,
          duration: contest.duration,
          problems: contest.problems,
          isRated: contest.isRated,
          tags: contest.tags,
          rules: contest.rules,
        },
      },
    },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(500, "Something went wrong while updating the user");
  }

  res
    .status(201)
    .json(new ApiResponse(201, contest, "Contest created successfully"));
});

const joinContest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role !== "participant") {
    throw new ApiError(403, "You are not authorized to join a contest");
  }

  const { contestId } = req.params;
  const contest = await Contest.findById(contestId);

  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  // Check if the user is already a participant
  const alreadyParticipant = contest.participants.some((p) =>
    p.userId.equals(userId)
  );
  if (alreadyParticipant) {
    throw new ApiError(409, "You are already a participant in this contest");
  }

  // Add the user to the contest's participants array
  contest.participants.push({
    userId,
    joinedAt: new Date(),
  });

  // Add the contest to the user's contestsParticipated array
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    {
      $push: {
        contestsParticipated: {
          contestId: contest._id,
          title: contest.title,
          description: contest.description,
          startTime: contest.startTime,
          endTime: contest.endTime,
          duration: contest.duration,
          problems: contest.problems,
          isRated: contest.isRated,
          tags: contest.tags,
          rules: contest.rules,
        },
      },
    },
    { new: true }
  );

  if (!updatedUser) {
    throw new ApiError(500, "Something went wrong while updating the user");
  }

  // Save the updated contest
  await contest.save();

  res
    .status(200)
    .json(new ApiResponse(200, contest, "Contest joined successfully"));
});

const getAllContests = asyncHandler(async (req: Request, res: Response) => {
  //TODO:
  //1. Get all the contests from the database
  //2. Return the contests as a response

  const aggregatedContests = await Contest.aggregate([
    {
      $lookup: {
        from: "problems",
        localField: "problems",
        foreignField: "_id",
        as: "problems",
      }
    },
  ])
  if (!aggregatedContests) {
    throw new ApiError(404, "No contests found");
  }
  
  const contests = await Contest.find();
  res
    .status(200)
    .json(new ApiResponse(200, aggregatedContests, "Contests retrieved successfully"));
});

const addProblems = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  const userId = req.user?._id as mongoose.Types.ObjectId;

  const {
    title,
    statement,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    explanation,
    difficulty,
    tags,
    testCases,  // Change: Accept testCases directly as an array
    timeLimit,
    memoryLimit,
  } = req.body;

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  if (!contest.problems) {
    contest.problems = [];
  }
  if (
    !contest.organizer.equals(userId) &&
    !contest.moderators.some((mod: mongoose.Types.ObjectId) =>
      mod.equals(userId)
    )
  ) {
    throw new ApiError(403, "You are not authorized to edit the contest");
  }

  // Make sure testCases is an array with at least one item and required fields
  if (!Array.isArray(testCases) || testCases.length === 0 || 
      !testCases[0].input || !testCases[0].output) {
    throw new ApiError(400, "Test cases must include at least one test case with input and output");
  }

  const problem = await Problem.create({
    title,
    statement,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    explanation,
    difficulty,
    createdBy: userId,
    tags,
    testCases,  // Pass the entire array
    timeLimit,
    memoryLimit,
  });

  if (!problem) {
    throw new ApiError(500, "Something went wrong while creating the problem");
  }

  contest.problems.push(problem._id as mongoose.Types.ObjectId);
  await contest.save();

  const updatedContest = await Contest.findById(contestId).populate("problems");

  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        updatedContest,
        "Problem added to the contest successfully"
      )
    );
});

const enterContest = asyncHandler(async (req: Request, res: Response) => {
//TODO:
  //1. Get the contestId from the request params
  //1.5 Verify the role of the user
  //2. Verify if the contest exists 
  //3. Verify if the user is already a participant

  const { contestId } = req.params;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role !== "participant") {
    throw new ApiError(403, "You are not authorized to join a contest");
  }

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  const alreadyParticipant = contest.participants.some((p) =>
    p.userId.equals(userId)
  );
  if (!alreadyParticipant) {
    throw new ApiError(409, "You are not a participant in this contest");
  }

  res
    .status(200)
    .json(new ApiResponse(200, contest, "Contest entered successfully"));
});

const startContest = asyncHandler(async (req: Request, res: Response) => {
  //TODO:
  //1. Get the contestId from the request params
  //1.5 Verify the role of the user
  //2. Verify if the contest exists 
  //3. Verify if the user is already a participant
  //4. aggregate problems from the problem id in the contest

  const { contestId } = req.params;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.role !== "participant") {
    throw new ApiError(403, "You are not authorized to join a contest");
  }

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  const currentTime = new Date();
  const isPastContest = currentTime > contest.endTime;
  
  // For past contests, allow anyone to access for practice
  // For active/upcoming contests, verify participation
  if (!isPastContest) {
    const alreadyParticipant = contest.participants.some((p) =>
      p.userId.equals(userId)
    );
    if (!alreadyParticipant) {
      throw new ApiError(409, "You are not a participant in this contest");
    }

    if (currentTime < contest.startTime) {
      throw new ApiError(400, "The contest has not started yet");
    }
  }
  

  const updatedContest = await Contest.aggregate([
    {
      $match: {
        _id: contest._id,
      }
    },
    {
      $lookup: {
        from: "problems",
        localField: "problems",
        foreignField: "_id",
        as: "problems",
      },
    }
  ])

  // console.log(updatedContest);
  

  res
    .status(200)
    .json(new ApiResponse(200, updatedContest, "Contest started successfully"));


})

const getContestById = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Use aggregate to get contest with populated problems
  const contest = await Contest.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(contestId),
      }
    },
    {
      $lookup: {
        from: "problems",
        localField: "problems",
        foreignField: "_id",
        as: "problems",
      },
    }
  ]);

  if (!contest || contest.length === 0) {
    throw new ApiError(404, "Contest not found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, contest[0], "Contest retrieved successfully"));
});

const editContest = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  const userId = req.user?._id as mongoose.Types.ObjectId;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Only admin can edit contests
  if (user.role !== "admin") {
    throw new ApiError(403, "You are not authorized to edit contests");
  }

  const {
    title,
    description,
    startTime,
    endTime,
    duration,
    isRated,
    tags,
    rules,
  } = req.body;

  // Find the contest
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  // Check if user is the organizer or a moderator
  const isAuthorized = 
    contest.organizer.equals(userId) || 
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));

  if (!isAuthorized && user.role !== "admin") {
    throw new ApiError(403, "You are not authorized to edit this contest");
  }

  // Update contest fields
  if (title) contest.title = title;
  if (description !== undefined) contest.description = description;
  if (startTime) contest.startTime = new Date(startTime);
  if (endTime) contest.endTime = new Date(endTime);
  if (duration) contest.duration = duration;
  if (isRated !== undefined) contest.isRated = isRated;
  if (tags) contest.tags = tags;
  if (rules !== undefined) contest.rules = rules;

  await contest.save();

  // Get updated contest with populated problems
  const updatedContest = await Contest.findById(contestId).populate("problems");

  res
    .status(200)
    .json(new ApiResponse(200, updatedContest, "Contest updated successfully"));
});

const deleteContest = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  const userId = req.user?._id as mongoose.Types.ObjectId;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Only admin can delete contests
  if (user.role !== "admin") {
    throw new ApiError(403, "You are not authorized to delete contests");
  }

  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  // Delete the contest
  await Contest.findByIdAndDelete(contestId);

  // Update users who have created or participated in this contest
  await User.updateMany(
    { "contestsCreated.contestId": contestId },
    { $pull: { contestsCreated: { contestId } } }
  );

  await User.updateMany(
    { "contestsParticipated.contestId": contestId },
    { $pull: { contestsParticipated: { contestId } } }
  );

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Contest deleted successfully"));
});

const updateContestDetails = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  const userId = req.user?._id as mongoose.Types.ObjectId;

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Only admin, organizer, or moderator can update contest details
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));

  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to edit this contest");
  }

  const {
    title,
    description,
    startTime,
    endTime,
    duration,
    landingPageTitle,
    landingPageDescription,
    prizes,
    rules,
    scoring,
    landingPageImage,
  } = req.body;

  if (title !== undefined) contest.title = title;
  if (description !== undefined) contest.description = description;
  if (startTime !== undefined) contest.startTime = new Date(startTime);
  if (endTime !== undefined) contest.endTime = new Date(endTime);
  if (duration !== undefined) contest.duration = duration;
  if (landingPageTitle !== undefined) contest.landingPageTitle = landingPageTitle;
  if (landingPageDescription !== undefined) contest.landingPageDescription = landingPageDescription;
  if (prizes !== undefined) contest.prizes = prizes;
  if (rules !== undefined) contest.rules = rules;
  if (scoring !== undefined) contest.scoring = scoring;
  if (landingPageImage !== undefined) contest.landingPageImage = landingPageImage;

  await contest.save();

  const updatedContest = await Contest.findById(contestId).populate("problems");

  res
    .status(200)
    .json(new ApiResponse(200, updatedContest, "Contest details updated successfully"));
});

const addModerators = asyncHandler(async (req: Request, res: Response) => {
  //TODO:
  //1. Get the contestId from the request params
  //2. Get the userId from the request body
  //3. Verify if the contest exists
  //4. Verify if the user is the organizer or an admin
  //4.4 Verify if the user has created the contest by matching the userId with the contest.organizer 
  //4.5 search the user in the database by email or username
  //5. Check if the user is already a moderator
  //6. If not, add the userId to the moderators array of the contest
  //5. Add the userId to the moderators array of the contest
  //6. Add the contestId to the contestsModerated array of the user
  //7. Return the updated contest and user as a response
  const { contestId } = req.params;
  const { email, username } = req.body; 
  const requestingUser = req.user as IUser;

  if (!requestingUser) {
    throw new ApiError(404, "Requesting user not found");
  }

  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }

  // Find the contest
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }

  // Only admin or organizer can add moderators
  const isAuthorized =
    requestingUser.role === "admin" &&
    contest.organizer.equals(requestingUser._id as mongoose.Types.ObjectId);

  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to add moderators");
  }

  // Find the user to be added as moderator
  let userToAdd;
  if (email) {
    userToAdd = await User.findOne({ email });
  } else if (username) {
    userToAdd = await User.findOne({ username });
  } else {
    throw new ApiError(400, "Please provide an email or username of the user to add as moderator");
  }

  if (!userToAdd) {
    throw new ApiError(404, "User to add as moderator not found");
  }

  // Prevent adding the organizer as a moderator
  if (contest.organizer.equals(userToAdd._id as mongoose.Types.ObjectId)) {
    throw new ApiError(409, "Organizer is already the contest owner");
  }

  // Check if already a moderator
  const alreadyModerator = contest.moderators.some((mod: mongoose.Types.ObjectId) =>
    mod.equals(userToAdd._id as mongoose.Types.ObjectId)
  );
  if (alreadyModerator) {
    throw new ApiError(409, "User is already a moderator");
  }

  // Add to contest's moderators array
  contest.moderators.push(userToAdd._id as mongoose.Types.ObjectId);
  await contest.save();

  // Add to user's contestsModerated array (if not already present)
  const alreadyModerating = userToAdd.contestsModerated?.some(
    (c: any) => c.contestId.equals(contest._id)
  );
  if (!alreadyModerating) {
    userToAdd.contestsModerated = userToAdd.contestsModerated || [];
    userToAdd.contestsModerated.push({
      contestId: contest._id as mongoose.Types.ObjectId,
    });
    await userToAdd.save();
  }

  const updatedContest = await Contest.findById(contestId).populate("problems");
  const updatedUser = await User.findById(userToAdd._id);

  res.status(200).json(
    new ApiResponse(200, { contest: updatedContest, user: updatedUser }, "Moderator added successfully")
  );
});

const getContestProblems = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  // Check if user is authorized (admin, organizer, or moderator)
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to access these problems");
  }
  
  // Fetch problems with populated data
  const problems = await Problem.find({
    _id: { $in: contest.problems }
  });
  
  res.status(200).json(
    new ApiResponse(200, problems, "Problems fetched successfully")
  );
});

const updateProblem = asyncHandler(async (req: Request, res: Response) => {
  const { contestId, problemId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId) || !mongoose.isValidObjectId(problemId)) {
    throw new ApiError(400, "Invalid ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if contest exists and user has access
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to edit this problem");
  }
  
  // Check if problem exists and belongs to the contest
  const problemBelongsToContest = contest.problems.some(
    (p: mongoose.Types.ObjectId) => p.equals(problemId)
  );
  
  if (!problemBelongsToContest) {
    throw new ApiError(404, "Problem not found in this contest");
  }
  
  // Get data from request body
  const {
    title,
    statement,
    inputFormat,
    outputFormat,
    constraints,
    sampleInput,
    sampleOutput,
    explanation,
    difficulty,
    tags,
    testCaseInput,
    testCaseOutput,
    testCaseExplanation,
    timeLimit,
    memoryLimit,
  } = req.body;
  
  // Find and update the problem
  const problem = await Problem.findById(problemId);
  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }
  
  // Update fields if provided
  if (title !== undefined) problem.title = title;
  if (statement !== undefined) problem.statement = statement;
  if (inputFormat !== undefined) problem.inputFormat = inputFormat;
  if (outputFormat !== undefined) problem.outputFormat = outputFormat;
  if (constraints !== undefined) problem.constraints = constraints;
  if (sampleInput !== undefined) problem.sampleInput = sampleInput;
  if (sampleOutput !== undefined) problem.sampleOutput = sampleOutput;
  if (explanation !== undefined) problem.explanation = explanation;
  if (difficulty !== undefined) problem.difficulty = difficulty;
  if (tags !== undefined) problem.tags = tags;
  
  // Update test cases - THIS is the part that needs to be fixed
  if (testCaseInput !== undefined || testCaseOutput !== undefined || testCaseExplanation !== undefined) {
    problem.testCases = [{
      input: testCaseInput || "",
      output: testCaseOutput || "",
      explanation: testCaseExplanation || "",
    }];
  }
  
  if (timeLimit !== undefined) problem.timeLimit = timeLimit;
  if (memoryLimit !== undefined) problem.memoryLimit = memoryLimit;
  
  // Save updated problem
  await problem.save();
  
  res.status(200).json(
    new ApiResponse(200, problem, "Problem updated successfully")
  );
});

const deleteProblem = asyncHandler(async (req: Request, res: Response) => {
  const { contestId, problemId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId) || !mongoose.isValidObjectId(problemId)) {
    throw new ApiError(400, "Invalid ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Check if contest exists and user has access
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to delete this problem");
  }
  
  // Check if problem exists and belongs to the contest
  const problemBelongsToContest = contest.problems.some(
    (p: mongoose.Types.ObjectId) => p.equals(problemId)
  );
  
  if (!problemBelongsToContest) {
    throw new ApiError(404, "Problem not found in this contest");
  }
  
  // Remove problem from contest
  contest.problems = contest.problems.filter(
    (p: mongoose.Types.ObjectId) => !p.equals(problemId)
  );
  await contest.save();
  
  // Delete the problem
  await Problem.findByIdAndDelete(problemId);
  
  res.status(200).json(
    new ApiResponse(200, {}, "Problem deleted successfully")
  );
});

const getModerators = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  // Only allow organizer, admins, or moderators to view moderators
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId));
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to view moderators");
  }
  
  // Fetch moderator users with their details
  const moderators = await User.find(
    { _id: { $in: contest.moderators } },
    { username: 1, email: 1, profilePicture: 1, _id: 1, "profile.avatarUrl": 1 }
  );
  
  // Add organizer to the list with a special role
  const organizer = await User.findById(
    contest.organizer,
    { username: 1, email: 1, profilePicture: 1, _id: 1, "profile.avatarUrl": 1 }
  );
  
  // Map moderators with proper profile picture handling
  let allModerators = moderators.map(mod => ({
    id: mod._id,
    username: mod.username,
    // Use profilePicture field first, then fall back to profile.avatarUrl if exists
    profilePicture: mod.profilePicture || (mod.profile && mod.profile.avatarUrl) || "",
    role: 'moderator'
  }));
  
  if (organizer) {
    allModerators.unshift({
      id: organizer._id,
      username: organizer.username,
      // Use profilePicture field first, then fall back to profile.avatarUrl if exists
      profilePicture: organizer.profilePicture || (organizer.profile && organizer.profile.avatarUrl) || "",
      role: 'owner'
    });
  }
  
  res.status(200).json(
    new ApiResponse(200, { moderators: allModerators }, "Moderators fetched successfully")
  );
});

const editModerator = asyncHandler(async (req: Request, res: Response) => {
  const { contestId, moderatorId } = req.params;
  const { role } = req.body;
  
  if (!mongoose.isValidObjectId(contestId) || !mongoose.isValidObjectId(moderatorId)) {
    throw new ApiError(400, "Invalid ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  // Only allow organizer or admins to edit moderators
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId);
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to edit moderators");
  }
  
  // Check if the user to be edited exists
  const moderatorToEdit = await User.findById(moderatorId);
  if (!moderatorToEdit) {
    throw new ApiError(404, "Moderator not found");
  }
  
  // Check if the user is actually a moderator
  const isModerator = contest.moderators.some(
    (mod: mongoose.Types.ObjectId) => mod.equals(moderatorId)
  );
  
  if (!isModerator) {
    throw new ApiError(400, "User is not a moderator for this contest");
  }
  
  // Currently, we only support role changes, which isn't stored in the DB
  // This is primarily a placeholder for future functionality
  // For now, just return success
  
  res.status(200).json(
    new ApiResponse(200, { message: "Moderator role updated" }, "Moderator updated successfully")
  );
});

const deleteModerator = asyncHandler(async (req: Request, res: Response) => {
  const { contestId, moderatorId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId) || !mongoose.isValidObjectId(moderatorId)) {
    throw new ApiError(400, "Invalid ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  // Only allow organizer or admins to remove moderators
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId);
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to remove moderators");
  }
  
  // Check if the user is actually a moderator
  const isModerator = contest.moderators.some(
    (mod: mongoose.Types.ObjectId) => mod.equals(moderatorId)
  );
  
  if (!isModerator) {
    throw new ApiError(400, "User is not a moderator for this contest");
  }
  
  // Remove the user from contest's moderators array
  contest.moderators = contest.moderators.filter(
    (mod: mongoose.Types.ObjectId) => !mod.equals(moderatorId)
  );
  await contest.save();
  
  // Update the user's contestsModerated array
  await User.findByIdAndUpdate(
    moderatorId,
    { $pull: { contestsModerated: { contestId: contest._id } } }
  );
  
  res.status(200).json(
    new ApiResponse(200, {}, "Moderator removed successfully")
  );
});

const getContestParticipants = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  // Check if user is authorized (admin, organizer, moderator, or participant)
  const isAuthorized =
    user.role === "admin" ||
    contest.organizer.equals(userId) ||
    contest.moderators.some((mod: mongoose.Types.ObjectId) => mod.equals(userId)) ||
    contest.participants.some((p) => p.userId.equals(userId));
    
  if (!isAuthorized) {
    throw new ApiError(403, "You are not authorized to view participants");
  }
  
  // Get participant details with lookup
  const participantUsers = await User.aggregate([
    {
      $match: {
        _id: { $in: contest.participants.map(p => p.userId) }
      }
    },
    {
      $project: {
        id: "$_id",
        username: 1,
        profilePicture: 1,
        "profile.avatarUrl": 1,
        lastActive: 1,
        _id: 0
      }
    }
  ]);
  
  // Combine participant data with join timestamps
  const enrichedParticipants = participantUsers.map(user => {
    const participantData = contest.participants.find(p => 
      p.userId.equals(user.id)
    );
    
    return {
      id: user.id,
      username: user.username,
      signupDate: participantData?.joinedAt,
      // Consider a user logged in if they've been active in the last 15 minutes
      lastLogin: user.lastActive && 
        (new Date().getTime() - new Date(user.lastActive).getTime() < 15 * 60 * 1000) 
        ? user.lastActive : null,
      profilePicture: user.profilePicture || (user.profile && user.profile.avatarUrl) || ""
    };
  });
  
  res.status(200).json(
    new ApiResponse(200, enrichedParticipants, "Participants fetched successfully")
  );
});

const getUserSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  
  console.log('🔍 getUserSubmissions called for contestId:', contestId);
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  const userId = req.user?._id as mongoose.Types.ObjectId;
  const user = await User.findById(userId);
  
  console.log('👤 Fetching submissions for userId:', userId.toString());
  
  if (!user) {
    throw new ApiError(404, "User not found");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  console.log('🏆 Contest submissions array length:', contest.submissions?.length || 0);
  
  // Get user's submissions from the Solution model
  const submissions = await Solution.find({
    userId: userId,
    contestId: contestId
  })
  .populate('problemId', 'title difficulty')
  .sort({ createdAt: -1 }); // Most recent first
  
  console.log(`📋 Found ${submissions.length} submissions in Solution collection`);
  
  // Map submissions to include problem info and format data
  const formattedSubmissions = submissions.map((sub, idx) => {
    // Use the stored maxScore to accurately determine status
    const maxScore = (sub as any).maxScore || 100;
    const status = sub.score >= maxScore ? 'correct' : sub.score > 0 ? 'partially correct' : 'wrong';
    
    console.log(`Submission ${idx + 1}:`, {
      id: sub._id,
      score: sub.score,
      maxScore,
      status
    });
    
    return {
      _id: sub._id,
      problemId: sub.problemId,
      score: sub.score,
      maxScore: maxScore,
      solutionCode: sub.solutionCode,
      languageUsed: sub.languageUsed,
      timeOccupied: sub.timeOccupied,
      memoryOccupied: sub.memoryOccupied,
      submittedAt: sub.createdAt,
      status: status
    };
  });
  
  res.status(200).json(
    new ApiResponse(200, formattedSubmissions, "Submissions fetched successfully")
  );
});

// Get all submissions from all users in a contest (Admin/Moderator)
const getAllContestSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const { contestId } = req.params;
  
  console.log('🔍 getAllContestSubmissions called for contestId:', contestId);
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  // Verify if contest exists
  const contest = await Contest.findById(contestId);
  if (!contest) {
    throw new ApiError(404, "Contest not found");
  }
  
  console.log('🏆 Fetching all submissions for contest:', contest.title);
  
  // Get all submissions for this contest from all users
  const submissions = await Solution.find({
    contestId: contestId
  })
  .populate('userId', 'username email profile')
  .populate('problemId', 'title difficulty')
  .sort({ createdAt: -1 }); // Most recent first
  
  console.log(`📋 Found ${submissions.length} total submissions from all users`);
  
  // Map submissions to include all data
  const formattedSubmissions = submissions.map((sub) => {
    const maxScore = (sub as any).maxScore || 100;
    const status = sub.score >= maxScore ? 'correct' : sub.score > 0 ? 'partially correct' : 'wrong';
    
    return {
      _id: sub._id,
      userId: sub.userId,
      problemId: sub.problemId,
      score: sub.score,
      maxScore: maxScore,
      solutionCode: sub.solutionCode,
      languageUsed: sub.languageUsed,
      timeOccupied: sub.timeOccupied,
      memoryOccupied: sub.memoryOccupied,
      submittedAt: sub.createdAt,
      status: status
    };
  });
  
  res.status(200).json(
    new ApiResponse(200, formattedSubmissions, "All contest submissions fetched successfully")
  );
});

const updateContestBackground = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, "Authentication required");
  }
  
  const { contestId } = req.params;
  
  if (!mongoose.isValidObjectId(contestId)) {
    throw new ApiError(400, "Invalid Contest ID format");
  }
  
  if (!req.file) {
    throw new ApiError(400, "No background image provided");
  }
  
  try {
    // Check if contest exists
    const contest = await Contest.findById(contestId);
    if (!contest) {
      throw new ApiError(404, "Contest not found");
    }
    
    // Check if user is authorized (admin, organizer, or moderator)
    const userRole = req.user?.role;
    const isAdmin = userRole === "admin";
    const isOrganizer = contest.organizer.toString() === userId.toString();
    const isModerator = contest.moderators?.some(
      (modId) => modId.toString() === userId.toString()
    );
    
    if (!isAdmin && !isOrganizer && !isModerator) {
      throw new ApiError(403, "You are not authorized to update this contest");
    }
    
    // The file has already been uploaded to Cloudinary by the middleware
    const imageUrl = (req.file as any).path || (req.file as Express.Multer.File & { path: string }).path;
    
    if (!imageUrl) {
      throw new ApiError(500, "Failed to upload background image");
    }
    
    // If contest already has a background image in Cloudinary, delete the old one
    if (contest.backgroundImage && contest.backgroundImage.includes('cloudinary')) {
      try {
        // Extract the public ID from the Cloudinary URL
        const publicId = contest.backgroundImage
          .split('/')
          .pop()
          ?.split('.')[0];
          
        if (publicId) {
          await cloudinary.uploader.destroy(`code-up-contest-backgrounds/${publicId}`);
        }
      } catch (err) {
        console.error("Error deleting old background image:", err);
        // Continue even if deletion fails
      }
    }
    
    // Update the contest with the new background URL
    contest.backgroundImage = imageUrl;
    await contest.save();
    
    res.status(200).json(
      new ApiResponse(
        200,
        { backgroundImage: imageUrl },
        "Contest background updated successfully"
      )
    );
  } catch (error) {
    console.error("Error updating contest background:", error);
    
    // Clean up the uploaded file in case of error
    if (req.file && (req.file as any).public_id) {
      try {
        await cloudinary.uploader.destroy((req.file as any).public_id);
      } catch (err) {
        console.error("Error deleting uploaded file after error:", err);
      }
    }
    
    throw new ApiError(
      500, 
      "Failed to update contest background. Please try again."
    );
  }
});

// Update the export statement
export { 
  createContest, 
  joinContest, 
  getAllContests, 
  addProblems, 
  enterContest, 
  startContest, 
  getContestById, 
  editContest, 
  deleteContest, 
  updateContestDetails, 
  addModerators,
  getModerators,
  editModerator,
  deleteModerator,
  getContestProblems,
  updateProblem,
  deleteProblem,
  getContestParticipants,
  getUserSubmissions,
  getAllContestSubmissions,
  updateContestBackground 
};
