import mongoose from 'mongoose';

export interface IParticipant {
    userId: mongoose.Types.ObjectId;
    joinedAt: Date;
}

export interface IContest extends mongoose.Document {
    title: string;
    description?: string;
    moderators: mongoose.Types.ObjectId[];
    organizer: mongoose.Types.ObjectId;
    startTime: Date;
    endTime: Date;
    duration: number; // in minutes
    problems: mongoose.Types.ObjectId[];
    participants: IParticipant[];
    submissions: mongoose.Types.ObjectId[]; // Array of Solution IDs
    score?: number;
    rank?: number;
    attempts?: number;
    bestSubmissionTime?: number; // in seconds or milliseconds
    totalScore?: number;
    isRated: boolean;
    tags?: string[];
    rules?: string;
    landingPageTitle?: string;
    landingPageDescription?: string;
    prizes?: string;
    scoring?: string;
    landingPageImage?: string;
    backgroundImage?: string; // New field added
    createdAt: Date;
    updatedAt: Date;
}