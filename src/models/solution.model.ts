import mongoose, { Schema } from "mongoose";
import { ISolution, ITestCaseResult } from "../types/solution.types.js";

const testCaseResultSchema = new Schema<ITestCaseResult>(
  {
    input: {
      type: String,
      required: true,
    },
    expectedOutput: {
      type: String,
      required: true,
    },
    actualOutput: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Passed", "Failed", "TLE", "Runtime Error"],
      required: true,
    },
    timeMs: { type: Number },
    memoryKb: { type: Number },
  },
  { _id: false },
);

const solutionSchema = new Schema<ISolution>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
    },
    problemId: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },

    solutionCode: {
      type: String,
      required: true,
    },

    languageUsed: {
      type: String,
      required: true,
    },

    score: {
      type: Number,
      default: 0,
    },

    testCases: [testCaseResultSchema],

    timeOccupied: {
      type: Number,
    },

    memoryOccupied: {
      type: Number,
    },

    timeGivenOnSolution: {
      type: Number,
    },
  },
  { timestamps: true },
);

const Solution = mongoose.model<ISolution>("Solution", solutionSchema);

export default Solution;
