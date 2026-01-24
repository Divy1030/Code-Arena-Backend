import mongoose, { Schema } from "mongoose";

const roomSchema = new Schema(
  {
    roomId: 
    { 
      type: String, required: true, unique: true 
    },
    problemId: 
    { 
      type: Schema.Types.ObjectId, ref: "Problem", required: true 
    },
    roomStatus: 
    { 
      type: String, enum: ["waiting", "Live", "completed"], default: "waiting" 
    },
    users: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        username: String,
        score: { type: Number, default: 0 },
        submissionStatus: { type: String, default: "pending" },
        submissionTime: Date,
        rating: { type: Number, default: 1000 },
        isCreator: { type: Boolean, default: false },
      },
    ],
    createdAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Room", roomSchema);
