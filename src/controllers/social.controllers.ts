import { Request, Response } from "express";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";

const getSuggestedUsers = asyncHandler(async (req: Request, res: Response) => {
  console.log('=== Social: Get Suggested Users ===');
  
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  const userIdString = userId.toString();
  console.log('User ID:', userIdString);

  try {
    const user = await User.findById(userIdString).select('following');
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    console.log('Raw following data:', JSON.stringify(user.following, null, 2));

    // Enhanced extraction of following user IDs to handle malformed data
    let followingUserIds: string[] = [];
    if (user.following && Array.isArray(user.following)) {
      followingUserIds = user.following
        .map((f: any) => {
          try {
            // Handle different possible formats
            if (f && typeof f === 'object') {
              // If it has userId property
              if (f.userId) {
                if (mongoose.Types.ObjectId.isValid(f.userId)) {
                  return f.userId.toString();
                }
              }
  
              if (f._id) {
                if (mongoose.Types.ObjectId.isValid(f._id)) {
                  return f._id.toString();
                }
              }
            }
            // If it's a direct ObjectId or string
            if (f && mongoose.Types.ObjectId.isValid(f.toString())) {
              return f.toString();
            }
            // Try to extract ObjectId from stringified objects
            if (typeof f === 'string' && f.includes('ObjectId')) {
              const match = f.match(/ObjectId\('([a-f0-9]{24})'\)/);
              if (match && match[1]) {
                return match[1];
              }
            }
            return null;
          } catch (error) {
            console.log('Error processing following item:', f, error);
            return null;
          }
        })
        .filter(Boolean); // Remove null values
    }
    
    console.log('Extracted following IDs:', followingUserIds);
    
    // Convert all IDs to ObjectId format for MongoDB query
    const validFollowingIds = followingUserIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));
    
    // Add current user's ID to exclude
    validFollowingIds.push(new mongoose.Types.ObjectId(userIdString));
    
    console.log('Valid following ObjectIds:', validFollowingIds);

    // Find suggested users
    const suggestions = await User.find({
      _id: { $nin: validFollowingIds },
    })
      .select("_id username firstName lastName profile profilePicture")
      .limit(10);

    console.log('Found suggestions:', suggestions.length);

    // Format response
    const suggestionsWithStatus = suggestions.map((user: any) => ({
      _id: user._id,
      username: user.username,
      firstName: user.firstName || user.profile?.name || user.username,
      lastName: user.lastName || '',
      profilePicture: user.profilePicture || user.profile?.avatarUrl,
      profile: user.profile,
      isFollowing: false
    }));

    console.log('Returning suggestions:', suggestionsWithStatus.length);

    res.status(200).json(
      new ApiResponse(200, suggestionsWithStatus, "Suggested users retrieved successfully")
    );
        
  } catch (error) {
    console.error('Error in getSuggestedUsers:', error);
    throw new ApiError(500, "Failed to fetch suggested users");
  }
});

const searchUsers = asyncHandler(async (req: Request, res: Response) => {
  console.log('=== Social: Search Users ===');
  
  const { username } = req.body;
  const userId = req.user?._id;
  
  if (!username) {
    throw new ApiError(400, "Username is required for search");
  }

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  const userIdString = userId.toString();

  try {
    // Get current user's following list
    const currentUser = await User.findById(userIdString).select('following');
    if (!currentUser) {
      throw new ApiError(404, "Current user not found");
    }

    // Enhanced extraction similar to getSuggestedUsers
    let followingIds: string[] = [];
    if (currentUser.following && Array.isArray(currentUser.following)) {
      followingIds = currentUser.following
        .map((f: any) => {
          try {
            if (f && typeof f === 'object') {
              if (f.userId && mongoose.Types.ObjectId.isValid(f.userId)) {
                return f.userId.toString();
              }
              if (f._id && mongoose.Types.ObjectId.isValid(f._id)) {
                return f._id.toString();
              }
            }
            if (f && mongoose.Types.ObjectId.isValid(f.toString())) {
              return f.toString();
            }
            // Handle stringified ObjectIds
            if (typeof f === 'string' && f.includes('ObjectId')) {
              const match = f.match(/ObjectId\('([a-f0-9]{24})'\)/);
              if (match && match[1]) {
                return match[1];
              }
            }
            return null;
          } catch (error) {
            console.log('Error processing following item in search:', f, error);
            return null;
          }
        })
        .filter(Boolean);
    }

    const listOfUsers = await User.find({
      username: { $regex: username, $options: "i" },
    }).select("_id username firstName lastName profile profilePicture");

    // Add isFollowing flag to each user
    const usersWithFollowingStatus = listOfUsers.map((user: any) => ({
      _id: user._id,
      username: user.username,
      firstName: user.firstName || user.profile?.name || user.username,
      lastName: user.lastName || '',
      profilePicture: user.profilePicture || user.profile?.avatarUrl,
      profile: user.profile,
      isFollowing: followingIds.includes(user._id.toString())
    }));

    res.status(200).json(
      new ApiResponse(200, usersWithFollowingStatus, "Users found successfully")
    );
  } catch (error) {
    console.error('Error in searchUsers:', error);
    throw new ApiError(500, "Failed to search users");
  }
});

const followUnfollowUser = asyncHandler(async (req: Request, res: Response) => {
  console.log('=== Social: Follow/Unfollow User ===');
  
  const { targetUserId } = req.body;
  const userId = req.user?._id;

  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  if (!targetUserId) {
    throw new ApiError(400, "Target user ID is required");
  }

  const currentUserIdString = userId.toString();
  const targetUserIdString = targetUserId.toString();

  if (currentUserIdString === targetUserIdString) {
    throw new ApiError(400, "Cannot follow yourself");
  }

  try {
    // Check if target user exists
    const targetUser = await User.findById(targetUserIdString);
    if (!targetUser) {
      throw new ApiError(404, "Target user not found");
    }

    const currentUser = await User.findById(currentUserIdString);
    if (!currentUser) {
      throw new ApiError(404, "Current user not found");
    }

    // Enhanced check for already following with better error handling
    let isAlreadyFollowing = false;
    try {
      isAlreadyFollowing = currentUser.following.some((f: any) => {
        try {
          if (f && typeof f === 'object') {
            if (f.userId) {
              return f.userId.toString() === targetUserIdString;
            }
            if (f._id) {
              return f._id.toString() === targetUserIdString;
            }
          }
          if (f) {
            return f.toString() === targetUserIdString;
          }
          return false;
        } catch (error) {
          console.log('Error checking following status:', error);
          return false;
        }
      });
    } catch (error) {
      console.log('Error in isAlreadyFollowing check:', error);
      isAlreadyFollowing = false;
    }

    if (isAlreadyFollowing) {
      // Unfollow - Remove from both arrays
      currentUser.following = currentUser.following.filter((f: any) => {
        try {
          if (f && typeof f === 'object') {
            if (f.userId) {
              return f.userId.toString() !== targetUserIdString;
            }
            if (f._id) {
              return f._id.toString() !== targetUserIdString;
            }
          }
          if (f) {
            return f.toString() !== targetUserIdString;
          }
          return true;
        } catch (error) {
          console.log('Error filtering following:', error);
          return true;
        }
      });

      targetUser.followers = targetUser.followers.filter((f: any) => {
        try {
          if (f && typeof f === 'object') {
            if (f.userId) {
              return f.userId.toString() !== currentUserIdString;
            }
            if (f._id) {
              return f._id.toString() !== currentUserIdString;
            }
          }
          if (f) {
            return f.toString() !== currentUserIdString;
          }
          return true;
        } catch (error) {
          console.log('Error filtering followers:', error);
          return true;
        }
      });

      await currentUser.save();
      await targetUser.save();

      res.status(200).json(
        new ApiResponse(200, { action: 'unfollowed' }, "Unfollowed successfully")
      );
    } else {
      // Follow - Add to both arrays
      currentUser.following.push({ 
        userId: new mongoose.Types.ObjectId(targetUserIdString), 
        followedAt: new Date() 
      });
      targetUser.followers.push({ 
        userId: new mongoose.Types.ObjectId(currentUserIdString), 
        followedAt: new Date() 
      });

      await currentUser.save();
      await targetUser.save();

      res.status(200).json(
        new ApiResponse(200, { action: 'followed' }, "Followed successfully")
      );
    }
  } catch (error) {
    console.error('Error in followUnfollowUser:', error);
    throw new ApiError(500, "Failed to update follow status");
  }
});

const getFollowers = asyncHandler(async (req: Request, res: Response) => {
  console.log('=== Social: Get Followers ===');
  
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  const userIdString = userId.toString();

  try {
    const user = await User.findById(userIdString)
      .populate('followers.userId', '_id username firstName lastName profilePicture profile')
      .select('followers');
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    // Extract follower information
    const followers = user.followers.map((f: any) => {
      const followerUser = f.userId;
      return {
        _id: followerUser._id,
        username: followerUser.username,
        firstName: followerUser.firstName || followerUser.profile?.name,
        lastName: followerUser.lastName,
        profilePicture: followerUser.profilePicture || followerUser.profile?.avatarUrl,
        profile: followerUser.profile,
      };
    });

    res.status(200).json(
      new ApiResponse(200, followers, "Followers retrieved successfully")
    );
        
  } catch (error) {
    console.error('Error in getFollowers:', error);
    throw new ApiError(500, "Failed to fetch followers");
  }
});

const getFollowing = asyncHandler(async (req: Request, res: Response) => {
  console.log('=== Social: Get Following ===');
  
  const userId = req.user?._id;
  
  if (!userId) {
    throw new ApiError(401, "User not authenticated");
  }

  const userIdString = userId.toString();

  try {
    const user = await User.findById(userIdString).select('following');
    
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    console.log('Raw following data:', JSON.stringify(user.following, null, 2));

    // Handle the following data similar to getSuggestedUsers
    let followingUserIds: string[] = [];
    if (user.following && Array.isArray(user.following)) {
      followingUserIds = user.following
        .map((f: any) => {
          try {
            // Handle different possible formats
            if (f && typeof f === 'object') {
              // If it has userId property
              if (f.userId) {
                if (mongoose.Types.ObjectId.isValid(f.userId)) {
                  return f.userId.toString();
                }
              }
              // If it has _id property
              if (f._id) {
                if (mongoose.Types.ObjectId.isValid(f._id)) {
                  return f._id.toString();
                }
              }
            }
            // If it's a direct ObjectId or string
            if (f && mongoose.Types.ObjectId.isValid(f.toString())) {
              return f.toString();
            }
            // Try to extract ObjectId from stringified objects
            if (typeof f === 'string' && f.includes('ObjectId')) {
              const match = f.match(/ObjectId\('([a-f0-9]{24})'\)/);
              if (match && match[1]) {
                return match[1];
              }
            }
            return null;
          } catch (error) {
            console.log('Error processing following item:', f, error);
            return null;
          }
        })
        .filter(Boolean); // Remove null values
    }

    console.log('Extracted following IDs:', followingUserIds);

    // If no following users, return empty array
    if (followingUserIds.length === 0) {
      res.status(200).json(
        new ApiResponse(200, [], "Following retrieved successfully")
      );
      return;
    }

    // Fetch user details for following users
    const followingUsers = await User.find({
      _id: { $in: followingUserIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).select('_id username firstName lastName profilePicture profile');

    console.log('Found following users:', followingUsers.length);

    // Format the response
    const following = followingUsers.map((followingUser: any) => ({
      _id: followingUser._id,
      username: followingUser.username,
      firstName: followingUser.firstName || followingUser.profile?.name,
      lastName: followingUser.lastName,
      profilePicture: followingUser.profilePicture || followingUser.profile?.avatarUrl,
      profile: followingUser.profile,
      isFollowing: true, // They are in the following list
    }));

    console.log('Returning following users:', following.length);

    res.status(200).json(
      new ApiResponse(200, following, "Following retrieved successfully")
    );
        
  } catch (error) {
    console.error('Error in getFollowing:', error);
    throw new ApiError(500, "Failed to fetch following");
  }
});

export {
  getSuggestedUsers,
  searchUsers,
  followUnfollowUser,
  getFollowers,
  getFollowing,
};