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
  },
  { _id: false }
);

const solutionSchema = new Schema<ISolution>(
  {
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
  { timestamps: true }
);

const Solution = mongoose.model<ISolution>("Solution", solutionSchema);

export default Solution;