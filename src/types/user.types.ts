import { Document, Types } from "mongoose";

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  isGoogleAccount: boolean;
  hasPassword: boolean;
  online: boolean;
  followers: Array<{
    userId: Types.ObjectId;
    followedAt: Date;
  }>;
  following: Array<{
    userId: Types.ObjectId;
    followedAt?: Date;
  }>;
  refreshToken?: string;
  role: "admin" | "participant";
  profilePicture: string;
  profile: {
    name?: string;
    institution?: string;
    country?: string;
    avatarUrl?: string;
    bio?: string;
  };
  rating: number;
  contestsParticipated: Array<{
    contestId: Types.ObjectId;
    rank?: number;
    score?: number;
    contestProblems: Array<{
      problemId: Types.ObjectId;
      score?: number;
      submissionTime?: Date;
      submissionStatus: "correct" | "wrong" | "partially correct";
    }>;
  }>;
  solvedProblems: Array<{
    problemId: Types.ObjectId;
    solvedAt: Date;
  }>;
  contestsCreated: Array<{
    contestId: Types.ObjectId;
  }>;
  contestsModerated: Array<{
    contestId: Types.ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
  isPasswordCorrect(password: string): Promise<boolean>;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}
