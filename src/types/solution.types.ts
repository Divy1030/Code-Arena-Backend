import mongoose from "mongoose";

export type TestCaseStatus = "Passed" | "Failed" | "TLE" | "Runtime Error";

export interface ITestCaseResult {
  input: string;
  expectedOutput: string;
  actualOutput: string;
  status: TestCaseStatus;
  timeMs?: number;
  memoryKb?: number;
}

export interface ISolution extends mongoose.Document {
  userId: mongoose.Types.ObjectId;
  contestId: mongoose.Types.ObjectId;
  problemId: mongoose.Types.ObjectId;

  solutionCode: string;
  languageUsed: string;

  score: number;

  testCases: ITestCaseResult[];

  timeOccupied?: number;
  memoryOccupied?: number;
  timeGivenOnSolution?: number;

  createdAt: Date;
  updatedAt: Date;
}
