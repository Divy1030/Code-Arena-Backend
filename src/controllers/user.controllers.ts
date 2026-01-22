import { Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { IUser } from "../types/user.types.js";
import User from "../models/user.model.js";

// Extend Express Request to include user property
declare module 'express-serve-static-core' {
  interface Request {
    user?: IUser;
  }
}
import { generateAccessAndRefreshTokens } from "../utils/tools.js";
import jwt from "jsonwebtoken";
import { sendOtpEmail } from "../utils/sendMail.js";
import mongoose from "mongoose";
import { verifyGoogleToken, getGoogleUser } from "../utils/googleAuth.js";
import Contest from "../models/contest.model.js";
import cloudinary from "../config/cloudinary.js";

const otpStore = new Map<
  string,
  {
    user: {
      username: string;
      email: string;
      password: string;
      verified?: boolean;
    };
    otp: string;
    expiry: number;
    otpVerified?: boolean;
  }
>();

// Update the registerUser function
const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    throw new ApiError(
      400,
      "All fields (username, email, and password) are required."
    );
  }

  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw new ApiError(
      409,
      "A user with this email or username already exists."
    );
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore.set(email, {
    user: { username, email, password },
    otp,
    expiry,
  });

  try {
    await sendOtpEmail(email, otp);
  } catch (error) {
    otpStore.delete(email);
    console.error("Error sending OTP email:", error);
    throw new ApiError(
      500,
      "Failed to send OTP email. Please try again later."
    );
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "OTP sent successfully. Please check your email."
      )
    );
});

// Update verifyLoginOTP to set hasPassword
const verifyLoginOTP = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    throw new ApiError(400, "Both email and OTP are required.");
  }

  const stored = otpStore.get(email);

  if (!stored) {
    throw new ApiError(
      400,
      "No OTP found for this email. Please request a new OTP."
    );
  }

  if (Date.now() > stored.expiry) {
    otpStore.delete(email);
    throw new ApiError(400, "The OTP has expired. Please request a new OTP.");
  }

  if (stored.otp !== otp) {
    throw new ApiError(401, "Invalid OTP. Please try again.");
  }

  const { username, password } = stored.user;

  try {
    const newUser = await User.create({
      username,
      email,
      password,
      isGoogleAccount: false,
      hasPassword: true,
    });
    otpStore.delete(email);

    const user = await User.findById(newUser._id).select(
      "-password -refreshToken -contestsCreated"
    );

    res
      .status(201)
      .json(new ApiResponse(201, user, "User registered successfully."));
  } catch (error) {
    console.error("Error creating user:", error);
    throw new ApiError(
      500,
      "An error occurred while registering the user. Please try again."
    );
  }
});

const loginUser = asyncHandler(async (req: Request, res: Response) => {
  const { email, password }: { email: string; password: string } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Both email and password are required.");
  }

  const user = (await User.findOne({ email })) as IUser | null;

  if (!user) {
    throw new ApiError(404, "No user found with this email.");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Incorrect password. Please try again.");
  }

  try {
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id!.toString()
    );

    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken -contestsCreated"
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    res
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          { user: loggedInUser, accessToken, refreshToken },
          "User logged in successfully."
        )
      );
  } catch (error) {
    console.error("Error during login:", error);
    throw new ApiError(
      500,
      "An error occurred during login. Please try again."
    );
  }
});

const logoutUser = asyncHandler(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(
    (req as any).user._id,
    { $set: { refreshToken: undefined } },
    { new: true }
  );

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };

  res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

interface DecodedToken {
  _id: string;
  iat: number;
  exp: number;
}

const refreshAccessToken = asyncHandler(async (req: Request, res: Response) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET!
    ) as DecodedToken;

    const user = (await User.findById(decodedToken._id)) as IUser | null;
    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshTokens(user._id!.toString());

    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token refreshed"
        )
      );
  } catch (error: any) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old and new passwords are required");
  }

  const user = (await User.findById((req as any).user._id)) as IUser | null;
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.isPasswordCorrect(oldPassword);
  if (!isPasswordValid) {
    throw new ApiError(401, "Incorrect password");
  }

  user.password = newPassword;
  await user.save();

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const forgetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email) {
    throw new ApiError(400, "Email is required.");
  }

  const user = (await User.findOne({ email })) as IUser | null;

  if (!user) {
    throw new ApiError(404, "No user found with this email.");
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes

  otpStore.set(email, {
    user: {
      username: user.username,
      email: user.email,
      password: user.password,
    },
    otp,
    expiry,
  });

  try {
    await sendOtpEmail(email, otp);
  } catch (error) {
    otpStore.delete(email);
    console.error("Error sending OTP email:", error);
    throw new ApiError(
      500,
      "Failed to send OTP email. Please try again later."
    );
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        null,
        "OTP sent successfully. Please check your email."
      )
    );
});

const verifyResetPasswordOTP = asyncHandler(
  async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
      throw new ApiError(400, "Email and OTP are required");
    }

    const stored = otpStore.get(email);

    if (!stored) {
      throw new ApiError(400, "No OTP found for this email");
    }

    if (Date.now() > stored.expiry) {
      otpStore.delete(email);
      throw new ApiError(400, "OTP expired");
    }

    if (stored.otp !== otp) {
      throw new ApiError(401, "Invalid OTP");
    }

    otpStore.set(email, { ...stored, otpVerified: true });

    res.status(200).json(new ApiResponse(200, {}, "OTP verified successfully"));
  }
);

const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    throw new ApiError(400, "Email and new password are required");
  }

  const stored = otpStore.get(email);

  if (!stored || !stored.otpVerified) {
    throw new ApiError(
      400,
      "OTP verification is required before updating the password"
    );
  }

  const user = (await User.findOne({ email })) as IUser | null;
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (user.password === newPassword) {
    throw new ApiError(
      400,
      "New password cannot be the same as the old password"
    );
  }

  user.password = newPassword;
  await user.save();
  otpStore.delete(email);

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Password updated successfully"));
});

const getUserData = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user._id;

  const user = await User.aggregate([
    { $match: { _id: userId } },
    // Preserve the original contestsParticipated array
    { $addFields: { userContestsParticipated: "$contestsParticipated" } },
    {
      $lookup: {
        from: "contests",
        localField: "contestsParticipated.contestId",
        foreignField: "_id",
        as: "contestsParticipated",
      },
    },
    // Merge user's score and rank into each contestParticipated object
    {
      $addFields: {
        contestsParticipated: {
          $map: {
            input: "$contestsParticipated",
            as: "contest",
            in: {
              $mergeObjects: [
                "$$contest",
                {
                  score: {
                    $let: {
                      vars: {
                        userContest: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$userContestsParticipated",
                                as: "uc",
                                cond: {
                                  $eq: ["$$uc.contestId", "$$contest._id"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: "$$userContest.score",
                    },
                  },
                  rank: {
                    $let: {
                      vars: {
                        userContest: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$userContestsParticipated",
                                as: "uc",
                                cond: {
                                  $eq: ["$$uc.contestId", "$$contest._id"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: "$$userContest.rank",
                    },
                  },
                  contestProblems: {
                    $let: {
                      vars: {
                        userContest: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: "$userContestsParticipated",
                                as: "uc",
                                cond: {
                                  $eq: ["$$uc.contestId", "$$contest._id"],
                                },
                              },
                            },
                            0,
                          ],
                        },
                      },
                      in: "$$userContest.contestProblems",
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    // Unwind contestsParticipated and contestProblems for lookup
    {
      $unwind: {
        path: "$contestsParticipated",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$contestsParticipated.contestProblems",
        preserveNullAndEmptyArrays: true,
      },
    },
    // Lookup problem details
    {
      $lookup: {
        from: "problems",
        localField: "contestsParticipated.contestProblems.problemId",
        foreignField: "_id",
        as: "contestsParticipated.contestProblems.problemDetails",
      },
    },
    // Flatten problemDetails array
    {
      $addFields: {
        "contestsParticipated.contestProblems.problemDetails": {
          $arrayElemAt: [
            "$contestsParticipated.contestProblems.problemDetails",
            0,
          ],
        },
      },
    },
    // Group back contestProblems
    {
      $group: {
        _id: {
          userId: "$_id",
          contestId: "$contestsParticipated._id",
        },
        doc: { $first: "$$ROOT" },
        contest: { $first: "$contestsParticipated" },
        contestProblems: { $push: "$contestsParticipated.contestProblems" },
      },
    },
    {
      $addFields: {
        "contest.contestProblems": "$contestProblems",
      },
    },
    // Group back contestsParticipated
    {
      $group: {
        _id: "$doc._id",
        doc: { $first: "$doc" },
        contestsParticipated: { $push: "$contest" },
      },
    },
    {
      $addFields: {
        "doc.contestsParticipated": "$contestsParticipated",
      },
    },
    {
      $replaceRoot: { newRoot: "$doc" },
    },
    {
      $project: {
        password: 0,
        refreshToken: 0,
        userContestsParticipated: 0, // Hide the helper field
      },
    },
  ]);

  if (!user || user.length === 0) {
    throw new ApiError(404, "User not found");
  }

  res
    .status(200)
    .json(new ApiResponse(200, user[0], "User data retrieved successfully"));
});

// Update googleLogin to set the Google flags
const googleLogin = asyncHandler(async (req: Request, res: Response) => {
  const idToken = req.body.idToken;
  if (!idToken) {
    throw new ApiError(400, "ID token is required");
  }

  const googleUser = await getGoogleUser(idToken);

  if (!googleUser || !googleUser.email) {
    throw new ApiError(401, "Invalid Google ID token");
  }

  const { email, name, picture } = googleUser;

  let user = await User.findOne({ email });

  if (!user) {
    const generateUniqueUsername = async (baseName: string): Promise<string> => {
      let baseUsername = baseName.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      if (baseUsername.length < 3) {
        baseUsername = baseUsername + 'user';
      }
      
      let username = baseUsername;
      let counter = 1;
      
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }
      
      return username;
    };

    const username = await generateUniqueUsername(name || email.split('@')[0]);

    user = await User.create({
      username,
      email,
      profile: { avatarUrl: picture },
      password: "", // Empty password initially
      isGoogleAccount: true,
      hasPassword: false,
    });
  }

  try {
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id!.toString()
    );

    const loggedInUser = await User.findById(user._id).select(
      "-password -refreshToken -contestsCreated"
    );

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    };

    const message =
      user.createdAt.getTime() === user.updatedAt.getTime()
        ? "User registered successfully"
        : "User logged in successfully";

    res
      .cookie("accessToken", accessToken, cookieOptions)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .json(
        new ApiResponse(
          200,
          { user: loggedInUser, accessToken, refreshToken },
          message
        )
      );
  } catch (error) {
    console.error("Error during Google login:", error);
    throw new ApiError(
      500,
      "An error occurred during Google login. Please try again."
    );
  }
});

// Add new function to create password for Google users
const createPasswordForGoogleUser = asyncHandler(async (req: Request, res: Response) => {
  const { newPassword } = req.body;
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  if (!newPassword) {
    throw new ApiError(400, "New password is required");
  }

  if (newPassword.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters long");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (!user.isGoogleAccount) {
    throw new ApiError(400, "This feature is only available for Google accounts");
  }

  if (user.hasPassword) {
    throw new ApiError(400, "Password already exists. Use change password instead.");
  }

  user.password = newPassword;
  user.hasPassword = true;
  await user.save();

  res
    .status(200)
    .json(new ApiResponse(200, {}, "Password created successfully"));
});

const getManageableContests = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id as mongoose.Types.ObjectId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Define fields to select - only include what's needed for the contests list
    const contestFields =
      "title description startTime endTime organizer moderators createdAt";

    // Get contests where the user is an organizer
    const organizedContests = await Contest.find({ organizer: userId })
      .select(contestFields)
      .sort({ createdAt: -1 });

    // Get contests where the user is a moderator
    const moderatedContests = await Contest.find({
      moderators: { $in: [userId] },
    })
      .select(contestFields)
      .sort({ createdAt: -1 });

    // If user is admin, get all contests
    let allContests: any[] = [];
    if (user.role === "admin") {
      allContests = await Contest.find()
        .select(contestFields)
        .sort({ createdAt: -1 });
    }

    // Prepare response with role context for each contest
    const managedContests = {
      asOrganizer: organizedContests,
      asModerator: moderatedContests,
      asAdmin: user.role === "admin" ? allContests : [],
    };

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          managedContests,
          "Manageable contests retrieved successfully"
        )
      );
  }
);

const updateProfilePicture = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?._id;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    if (!req.file) {
      throw new ApiError(400, "No image file provided");
    }

    try {
      // The file has already been uploaded to Cloudinary by the middleware
      const imageUrl =
        (req.file as any).path ||
        (req.file as Express.Multer.File & { path: string }).path;

      if (!imageUrl) {
        throw new ApiError(500, "Failed to upload image");
      }

      // Find the user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found");
      }

      // If user already has a profile picture in Cloudinary, delete the old one
      if (user.profilePicture && user.profilePicture.includes("cloudinary")) {
        try {
          // Extract the public ID from the Cloudinary URL
          const publicId = user.profilePicture.split("/").pop()?.split(".")[0];

          if (publicId) {
            await cloudinary.uploader.destroy(
              `code-up-profile-pictures/${publicId}`
            );
          }
        } catch (err) {
          console.error("Error deleting old profile picture:", err);
          // Continue even if deletion fails
        }
      }

      // Update the user's profile picture URL
      user.profilePicture = imageUrl;
      await user.save();

      res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { profilePicture: imageUrl },
            "Profile picture updated successfully"
          )
        );
    } catch (error) {
      console.error("Error updating profile picture:", error);

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
        "Failed to update profile picture. Please try again."
      );
    }
  }
);

const followAndUnfollow = asyncHandler(async (req: Request, res: Response) => {
  const { idOfWhomWeAreFollowing } = req.body;
  const userId = (req as any).user?._id;

  console.log('Follow/Unfollow - Current User ID:', userId);
  console.log('Follow/Unfollow - Target User ID:', idOfWhomWeAreFollowing);

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  if (!idOfWhomWeAreFollowing) {
    throw new ApiError(400, "Target user ID is required");
  }

  // Validate both user IDs
  const currentUserIdString = userId.toString();
  const targetUserIdString = idOfWhomWeAreFollowing.toString();

  if (!mongoose.Types.ObjectId.isValid(currentUserIdString) || 
      !mongoose.Types.ObjectId.isValid(targetUserIdString)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  if (currentUserIdString === targetUserIdString) {
    throw new ApiError(400, "Cannot follow yourself");
  }

  // Check if target user exists
  const targetUser = await User.findById(targetUserIdString);
  if (!targetUser) {
    throw new ApiError(404, "Target user not found");
  }

  const currentUser = await User.findById(currentUserIdString);
  if (!currentUser) {
    throw new ApiError(404, "Current user not found");
  }

  // Check if already following
  const isAlreadyFollowing = currentUser.following.some((f: any) => {
    const followingId = f.userId ? f.userId.toString() : f.toString();
    return followingId === targetUserIdString;
  });

  if (isAlreadyFollowing) {
    // Unfollow
    currentUser.following = currentUser.following.filter((f: any) => {
      const followingId = f.userId ? f.userId.toString() : f.toString();
      return followingId !== targetUserIdString;
    });

    targetUser.followers = targetUser.followers.filter((f: any) => {
      const followerId = f.userId ? f.userId.toString() : f.toString();
      return followerId !== currentUserIdString;
    });

    await currentUser.save();
    await targetUser.save();

    res.status(200).json(new ApiResponse(200, {}, "Unfollowed successfully"));
  } else {
    // Follow
    currentUser.following.push({ userId: targetUserIdString, followedAt: new Date() });
    targetUser.followers.push({ userId: currentUserIdString, followedAt: new Date() });

    await currentUser.save();
    await targetUser.save();

    res.status(200).json(new ApiResponse(200, {}, "Followed successfully"));
  }
});

const searchFriendByName = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.body;
  const userId = (req as any).user?._id;
  
  console.log('Search friends - User ID:', userId);
  console.log('Search friends - Username:', username);
  
  if (!username) {
    throw new ApiError(400, "Username is required for search");
  }

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  // Convert to string and validate
  const userIdString = userId.toString();
  if (!mongoose.Types.ObjectId.isValid(userIdString)) {
    throw new ApiError(400, "Invalid user ID format");
  }

  // Get current user's following list
  const currentUser = await User.findById(userIdString).select('following');
  if (!currentUser) {
    throw new ApiError(404, "Current user not found");
  }

  const followingIds = currentUser.following.map((f: any) => {
    if (f.userId) {
      return f.userId.toString();
    } else if (mongoose.Types.ObjectId.isValid(f.toString())) {
      return f.toString();
    }
    return null;
  }).filter(Boolean);

  const listOfUsers = await User.find({
    username: { $regex: username, $options: "i" },
  }).select("_id username firstName lastName profile profilePicture");

  // Add isFollowing flag to each user
  const usersWithFollowingStatus = listOfUsers.map((user: any) => ({
    _id: user._id,
    username: user.username,
    firstName: user.firstName || user.profile?.name || user.username,
    lastName: user.lastName || '',
    profilePicture: user.profilePicture,
    profile: user.profile,
    isFollowing: followingIds.includes(user._id.toString())
  }));

  res.status(200).json(new ApiResponse(200, usersWithFollowingStatus, "Users found"));
});

const suggestedUsersToFollow = asyncHandler(
  async (req: Request, res: Response) => {
    console.log('=== Suggested Users Controller Called ===');
    
    const userId = (req as any).user?._id;
    console.log('Raw user ID from request:', userId);
    console.log('User ID type:', typeof userId);
    
    if (!userId) {
      console.error('No user ID found in request');
      throw new ApiError(401, "User not authenticated");
    }

    // Convert to string and validate MongoDB ObjectId format
    const userIdString = userId.toString();
    console.log('User ID as string:', userIdString);
    
    if (!mongoose.Types.ObjectId.isValid(userIdString)) {
      console.error('Invalid user ID format:', userIdString);
      throw new ApiError(400, "Invalid user ID format");
    }

    const user = await User.findById(userIdString);
    console.log('Found user:', user ? user.username : 'null');

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Get the list of users that the current user is already following
    const followingIds = user.following.map((f: any) => {
      if (f.userId) {
        return f.userId.toString();
      } else if (mongoose.Types.ObjectId.isValid(f.toString())) {
        return f.toString();
      }
      return null;
    }).filter(Boolean); // Remove null values
    
    // Add current user's ID to exclude from suggestions
    followingIds.push(userIdString);
    
    console.log('Following IDs to exclude:', followingIds);

    try {
      // Find users that are not in the following list
      const suggestions = await User.find({
        _id: { $nin: followingIds },
      })
        .select("_id username firstName lastName profile profilePicture followers")
        .sort({ "followers.length": -1 })
        .limit(10);

      console.log('Found suggestions:', suggestions.length);

      // Format the response to match frontend expectations
      const suggestionsWithStatus = suggestions.map((user: any) => ({
        _id: user._id,
        username: user.username,
        firstName: user.firstName || user.profile?.name || user.username,
        lastName: user.lastName || '',
        profilePicture: user.profilePicture,
        profile: user.profile,
        isFollowing: false // These are suggestions, so user is not following them yet
      }));

      console.log('Returning suggestions with status:', suggestionsWithStatus.length);

      res
        .status(200)
        .json(new ApiResponse(200, suggestionsWithStatus, "Suggested users to follow"));
        
    } catch (dbError) {
      console.error('Database error in suggestions query:', dbError);
      throw new ApiError(500, "Failed to fetch suggested users");
    }
  }
);

const getProfileOfUser = asyncHandler(async (req: Request, res: Response) => {
  //TODO:
  //1. get the userId of the profile to be searching from the params
  //2. find the user in the database
  //3. check if the user is the same as the logged in user
  //4. if the user is the same as the logged in user, return the user profile
  //5. if the user is not the same as the logged in user, return the user profile without the refresh token and password
  const searchUserId = req.params.userId;
  const loggedInUserId = (req as any).user._id;
  const user = await User.findById(searchUserId).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  const currentUser = await User.findById(loggedInUserId);
  if (!currentUser) {
    throw new ApiError(404, "User not found(unauthorized)");
  }
  const isSameUser = loggedInUserId.toString() === searchUserId.toString();
  if (isSameUser) {
    res
      .status(200)
      .json(new ApiResponse(200, user, "User profile retrieved successfully"));
    return;
  }
  const userWithoutSensitiveData = {
    ...user.toObject(),
    password: undefined,
    refreshToken: undefined,
  };
  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        userWithoutSensitiveData,
        "User profile retrieved successfully"
      )
    );
});

const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid User ID format");
  }

  const requesterId = req.user?._id as mongoose.Types.ObjectId;
  const requester = await User.findById(requesterId);

  if (!requester) {
    throw new ApiError(404, "Requester not found");
  }

  // Find the requested user with basic info
  const user = await User.findById(userId).select(
    "-password -refreshToken"
  );

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // For admins and contest organizers, provide more detailed information
  // For regular users, provide limited information
  let userData;

  if (requester.role === "admin") {
    // Admin users get full profile info except sensitive data
    userData = {
      _id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      profilePicture: user.profilePicture,
      profile: user.profile,
      rating: user.rating,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // Include participation data but filter out unnecessary details
      contestsParticipated: user.contestsParticipated?.map(contest => ({
        contestId: contest.contestId,
        rank: contest.rank,
        score: contest.score
      }))
    };
  } else {
    // Regular users see limited profile information
    userData = {
      _id: user._id,
      username: user.username,
      role: user.role,
      profilePicture: user.profilePicture,
      profile: {
        name: user.profile?.name,
        institution: user.profile?.institution,
        country: user.profile?.country,
        bio: user.profile?.bio
      },
      rating: user.rating,
      createdAt: user.createdAt
    };
  }

  res.status(200).json(
    new ApiResponse(
      200,
      userData,
      "User profile retrieved successfully"
    )
  );
});

export {
  registerUser,
  loginUser,
  verifyLoginOTP,
  logoutUser,
  refreshAccessToken,
  changePassword,
  forgetPassword,
  verifyResetPasswordOTP,
  updatePassword,
  getUserData,
  googleLogin,
  getManageableContests,
  updateProfilePicture,
  getUserById,
  followAndUnfollow,
  searchFriendByName,
  suggestedUsersToFollow,
  getProfileOfUser,
  createPasswordForGoogleUser, // Add this new export
};