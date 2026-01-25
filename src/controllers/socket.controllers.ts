import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Room from "../models/room.model.js";
import Problem from "../models/problem.model.js";
import mongoose from "mongoose";
import { evaluateSolution } from "../utils/evaluateSolution.js";
import { Socket, Server } from "socket.io";
import {
  matchmakingQueue,
  QueuedPlayer,
  DEFAULT_RATING,
  MATCHMAKING_TIMEOUT_MS,
} from "../services/matchmaking.service.js";
import {
  calculateEloRatings,
  getMatchResultScores,
  EloResult,
} from "../utils/eloRating.js";

const SUPPORTED_LANGUAGES = ["cpp", "python", "javascript", "c", "java"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Constants for room configuration
const MATCH_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Track active match timers for cleanup
const matchTimers = new Map<string, NodeJS.Timeout>();

// Track match start times for accurate remaining time calculation
const matchStartTimes = new Map<string, number>();

// Helper function to safely emit callback responses
const safeCallback = (
  callback: ((response: any) => void) | undefined,
  response: { success: boolean; message?: string; [key: string]: any }
) => {
  if (typeof callback === "function") {
    callback(response);
  }
};

// Helper to parse cookies from header
const parseCookies = (cookieHeader: string): Record<string, string> => {
  return Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [key, ...v] = cookie.trim().split("=");
      return [key, v.join("=")];
    })
  );
};

// Extract token from socket handshake
const extractToken = (socket: Socket): string | undefined => {
  let token: string | undefined;

  // Try cookies first
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader);
    token = cookies.accessToken;
  }

  // Fallback to Authorization header
  if (!token) {
    const authHeader = socket.handshake.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    }
  }

  return token;
};

// Export a function that initializes socket handlers
export const initializeSocketHandlers = (io: Server) => {
  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      console.log("Socket middleware triggered for:", socket.id);

      const token = extractToken(socket);

      if (!token) {
        return next(new Error("Unauthorized: No token provided"));
      }

      const secret = process.env.ACCESS_TOKEN_SECRET;
      if (!secret) {
        console.error("ACCESS_TOKEN_SECRET is not configured");
        return next(new Error("Server configuration error"));
      }

      const decoded = jwt.verify(token, secret) as { _id: string };
      const user = await User.findById(decoded._id).select("-password -refreshToken");

      if (!user) {
        return next(new Error("Unauthorized: Invalid token"));
      }

      socket.data.userId = (user._id as mongoose.Types.ObjectId).toString();
      socket.data.user = user;
      next();
    } catch (err) {
      console.error("Socket middleware error:", err);
      if (err instanceof jwt.TokenExpiredError) {
        return next(new Error("Unauthorized: Token expired"));
      }
      if (err instanceof jwt.JsonWebTokenError) {
        return next(new Error("Unauthorized: Invalid token"));
      }
      next(new Error("Unauthorized: Authentication failed"));
    }
  });

  // Helper function to create a match between two players
  const createMatch = async (player1: QueuedPlayer, player2: QueuedPlayer): Promise<void> => {
    try {
      // Get a random problem for the match
      const problem = await Problem.aggregate([{ $sample: { size: 1 } }]);
      if (!problem.length) {
        // Notify both players that match creation failed
        player1.socket.emit("matchmakingError", { message: "No problems available for the match" });
        player2.socket.emit("matchmakingError", { message: "No problems available for the match" });
        return;
      }

      const roomId = new mongoose.Types.ObjectId().toString();
      const matchStartTime = Date.now();

      // Create the room with both players
      const room = await Room.create({
        roomId,
        problemId: problem[0]._id,
        users: [
          {
            userId: new mongoose.Types.ObjectId(player1.userId),
            username: player1.username,
            score: 0,
            submissionStatus: "pending",
            rating: player1.rating,
            isCreator: false,
          },
          {
            userId: new mongoose.Types.ObjectId(player2.userId),
            username: player2.username,
            score: 0,
            submissionStatus: "pending",
            rating: player2.rating,
            isCreator: false,
          },
        ],
        isActive: true,
        roomStatus: "Live", // Start immediately
      });

      // Join both sockets to the room
      player1.socket.join(roomId);
      player2.socket.join(roomId);

      // Track match start time for accurate remaining time
      matchStartTimes.set(roomId, matchStartTime);

      // Set a timer to auto-end the match after duration
      const timer = setTimeout(() => endMatch(roomId, "timeout"), MATCH_DURATION_MS);
      matchTimers.set(roomId, timer);

      // Notify both players about the match with problem details
      const matchData = {
        roomId,
        problemId: problem[0]._id.toString(),
        problem: {
          _id: problem[0]._id.toString(),
          title: problem[0].title,
          description: problem[0].description,
          difficulty: problem[0].difficulty,
          examples: problem[0].examples,
          constraints: problem[0].constraints,
        },
        users: room.users,
        duration: MATCH_DURATION_MS,
        startedAt: matchStartTime,
        endsAt: matchStartTime + MATCH_DURATION_MS,
        message: "Match found! Good luck!",
      };

      player1.socket.emit("matchFound", matchData);
      player2.socket.emit("matchFound", matchData);

      console.log(`Match created: ${player1.username} (${player1.rating}) vs ${player2.username} (${player2.rating}) in room ${roomId}`);
    } catch (err) {
      console.error("createMatch error:", err);
      player1.socket.emit("matchmakingError", { message: "Failed to create match" });
      player2.socket.emit("matchmakingError", { message: "Failed to create match" });
    }
  };

  // Helper function to end a match (used by timer and when all submit)
  const endMatch = async (roomId: string, reason: "timeout" | "allSubmitted" | "forfeit" = "allSubmitted") => {
    try {
      // Clear any existing timer
      const timer = matchTimers.get(roomId);
      if (timer) {
        clearTimeout(timer);
        matchTimers.delete(roomId);
      }

      // Clean up start time tracking
      matchStartTimes.delete(roomId);

      const room = await Room.findOne({ roomId, isActive: true });
      if (!room || room.roomStatus === "completed") return;

      // Calculate winner based on scores
      const sortedUsers = [...room.users].sort((a: any, b: any) => {
        // Sort by score (descending), then by submission time (ascending)
        if (b.score !== a.score) return b.score - a.score;
        if (a.submissionTime && b.submissionTime) {
          return new Date(a.submissionTime).getTime() - new Date(b.submissionTime).getTime();
        }
        // If one submitted and other didn't, submitted user wins
        if (a.submissionTime && !b.submissionTime) return -1;
        if (!a.submissionTime && b.submissionTime) return 1;
        return 0;
      });

      room.roomStatus = "completed";
      room.isActive = false;
      await room.save();

      // Determine winner
      const winner = sortedUsers.length > 0 ? sortedUsers[0] : null;
      const isDraw = sortedUsers.length >= 2 && sortedUsers[0].score === sortedUsers[1].score;

      // ==================== ELO RATING CALCULATION ====================
      let ratingChanges: { [key: string]: { oldRating: number; newRating: number; ratingChange: number } } = {};

      if (sortedUsers.length >= 2) {
        const playerA = sortedUsers[0];
        const playerB = sortedUsers[1];

        // Determine match result for Elo calculation
        let matchWinner: 'A' | 'B' | 'draw';
        if (isDraw) {
          matchWinner = 'draw';
        } else if (playerA.score > playerB.score) {
          matchWinner = 'A';
        } else {
          matchWinner = 'B';
        }

        // Get the match result scores
        const resultScores = getMatchResultScores(matchWinner);

        // Calculate new Elo ratings
        const ratingA = playerA.rating || DEFAULT_RATING;
        const ratingB = playerB.rating || DEFAULT_RATING;

        const eloResult: EloResult = calculateEloRatings(
          ratingA,
          ratingB,
          resultScores
        );

        // Store rating changes for response
        const playerAId = playerA.userId?.toString();
        const playerBId = playerB.userId?.toString();

        if (playerAId) {
          ratingChanges[playerAId] = {
            oldRating: ratingA,
            newRating: eloResult.newRatingA,
            ratingChange: eloResult.ratingChangeA,
          };
        }
        if (playerBId) {
          ratingChanges[playerBId] = {
            oldRating: ratingB,
            newRating: eloResult.newRatingB,
            ratingChange: eloResult.ratingChangeB,
          };
        }

        // Update ratings in the database
        try {
          const updatePromises = [];
          if (playerAId) {
            updatePromises.push(
              User.findByIdAndUpdate(playerA.userId, { 
                rating: eloResult.newRatingA 
              })
            );
          }
          if (playerBId) {
            updatePromises.push(
              User.findByIdAndUpdate(playerB.userId, { 
                rating: eloResult.newRatingB 
              })
            );
          }
          await Promise.all(updatePromises);

          console.log(`Rating updated: ${playerA.username} ${ratingA} → ${eloResult.newRatingA} (${eloResult.ratingChangeA >= 0 ? '+' : ''}${eloResult.ratingChangeA})`);
          console.log(`Rating updated: ${playerB.username} ${ratingB} → ${eloResult.newRatingB} (${eloResult.ratingChangeB >= 0 ? '+' : ''}${eloResult.ratingChangeB})`);
        } catch (dbError) {
          console.error("Failed to update ratings in database:", dbError);
        }
      }
      // ==================== END ELO RATING CALCULATION ====================

      // Get appropriate end message based on reason
      let message: string;
      if (isDraw) {
        message = "Match ended in a draw!";
      } else {
        switch (reason) {
          case "timeout":
            message = "Time's up! Match completed.";
            break;
          case "allSubmitted":
            message = "All players submitted! Match completed.";
            break;
          case "forfeit":
            message = "Opponent forfeited. You win!";
            break;
          default:
            message = "Match completed!";
        }
      }

      io.to(roomId).emit("matchFinished", {
        message,
        reason,
        users: sortedUsers,
        winner: isDraw ? null : winner,
        isDraw,
        ratingChanges, // Include rating changes in the response
      });

      console.log(`Match ${roomId} finished. Reason: ${reason}. Winner: ${isDraw ? "Draw" : winner?.username}`);
    } catch (err) {
      console.error("endMatch error:", err);
    }
  };

  io.on("connection", async (socket) => {
    console.log("New socket connection:", socket.id);
    const userId = socket.data.userId;
    const user = socket.data.user;

    if (!userId || !user) {
      console.log("Socket disconnected - no user data");
      return socket.disconnect(true);
    }

    // Track which rooms this socket has joined
    const joinedRooms = new Set<string>();

    // ==================== MATCHMAKING ====================

    // Find a match - this is the main event for matchmaking
    socket.on("findMatch", async (callback) => {
      try {
        // Check if user is already in queue
        if (matchmakingQueue.has(userId)) {
          return safeCallback(callback, { 
            success: false, 
            message: "Already searching for a match" 
          });
        }

        // Check if user is already in an active match
        const existingRoom = await Room.findOne({
          "users.userId": new mongoose.Types.ObjectId(userId),
          isActive: true,
          roomStatus: "Live",
        });

        if (existingRoom) {
          return safeCallback(callback, { 
            success: false, 
            message: "You are already in an active match",
            roomId: existingRoom.roomId,
          });
        }

        const playerRating = user.rating || DEFAULT_RATING;

        // Create player entry for queue
        const queuedPlayer: QueuedPlayer = {
          userId,
          username: user.username,
          rating: playerRating,
          socket,
          joinedAt: Date.now(),
        };

        // Try to find a match immediately
        const opponent = matchmakingQueue.findMatch(queuedPlayer);

        if (opponent) {
          // Match found! Remove opponent from queue and create match
          matchmakingQueue.remove(opponent.userId);
          
          // Don't add current player to queue, create match directly
          await createMatch(queuedPlayer, opponent);

          safeCallback(callback, { 
            success: true, 
            message: "Match found!",
            status: "matched",
          });
        } else {
          // No match found, add to queue
          // Set timeout to notify player if no match found
          const timeoutId = setTimeout(() => {
            if (matchmakingQueue.has(userId)) {
              matchmakingQueue.remove(userId);
              socket.emit("matchmakingTimeout", { 
                message: "No match found. Please try again.",
              });
            }
          }, MATCHMAKING_TIMEOUT_MS);

          queuedPlayer.timeoutId = timeoutId;
          matchmakingQueue.add(queuedPlayer);

          safeCallback(callback, { 
            success: true, 
            message: "Searching for opponent...",
            status: "searching",
            queuePosition: matchmakingQueue.size(),
          });

          // Emit searching status
          socket.emit("matchmakingStatus", {
            status: "searching",
            rating: playerRating,
            queueSize: matchmakingQueue.size(),
          });
        }
      } catch (err) {
        console.error("findMatch error:", err);
        safeCallback(callback, { success: false, message: "Failed to search for match" });
      }
    });

    // Cancel matchmaking search
    socket.on("cancelMatchmaking", (callback) => {
      try {
        const removed = matchmakingQueue.remove(userId);
        
        if (removed) {
          safeCallback(callback, { success: true, message: "Matchmaking cancelled" });
          socket.emit("matchmakingStatus", { status: "cancelled" });
        } else {
          safeCallback(callback, { success: false, message: "Not currently searching" });
        }
      } catch (err) {
        console.error("cancelMatchmaking error:", err);
        safeCallback(callback, { success: false, message: "Failed to cancel matchmaking" });
      }
    });

    // Get matchmaking status
    socket.on("getMatchmakingStatus", (callback) => {
      try {
        const inQueue = matchmakingQueue.has(userId);
        const player = matchmakingQueue.get(userId);

        safeCallback(callback, {
          success: true,
          inQueue,
          queueSize: matchmakingQueue.size(),
          waitTime: player ? Date.now() - player.joinedAt : 0,
        });
      } catch (err) {
        console.error("getMatchmakingStatus error:", err);
        safeCallback(callback, { success: false, message: "Failed to get status" });
      }
    });

    // ==================== ROOM MANAGEMENT ====================

    // Submit solution for evaluation
    socket.on("submitSolution", async ({ roomId, code, language }, callback) => {
      try {
        // Validate input
        if (!roomId || !code || !language) {
          return safeCallback(callback, { success: false, message: "Missing required fields" });
        }

        if (!SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
          return safeCallback(callback, { 
            success: false, 
            message: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(", ")}` 
          });
        }

        const room = await Room.findOne({ roomId });
        if (!room) {
          return safeCallback(callback, { success: false, message: "Room not found" });
        }

        if (room.roomStatus !== "Live") {
          return safeCallback(callback, { success: false, message: "Match is not active" });
        }

        const roomUser = room.users.find((u: any) => u.userId.toString() === userId);
        if (!roomUser) {
          return safeCallback(callback, { success: false, message: "User not in room" });
        }

        if (roomUser.submissionStatus === "submitted") {
          return safeCallback(callback, { success: false, message: "Already submitted a solution" });
        }

        // Notify room that user is submitting
        io.to(roomId).emit("userSubmitting", { 
          userId, 
          username: roomUser.username,
        });

        // Evaluate the solution
        const { score, passedTestcases } = await evaluateSolution(
          room.problemId.toString(),
          code,
          language
        );

        roomUser.score = score;
        roomUser.submissionStatus = "submitted";
        roomUser.submissionTime = new Date();

        await room.save();

        // Notify all users about the submission
        io.to(room.roomId).emit("scoreUpdate", { users: room.users });
        io.to(room.roomId).emit("submissionUpdate", {
          userId,
          username: roomUser.username,
          submissionStatus: "submitted",
          score,
          passedTestcases,
        });

        // Check if all users have submitted (or forfeited)
        const allSubmitted = room.users.every(
          (u: any) => u.submissionStatus === "submitted" || u.submissionStatus === "forfeited"
        );
        if (allSubmitted) {
          await endMatch(roomId, "allSubmitted");
        }

        safeCallback(callback, { success: true, score, passedTestcases });
      } catch (err) {
        console.error("submitSolution error:", err);
        safeCallback(callback, { success: false, message: "Failed to evaluate solution" });
      }
    });

    // Leave a room/match voluntarily (forfeit)
    socket.on("leaveMatch", async ({ roomId }, callback) => {
      try {
        if (!roomId) {
          return safeCallback(callback, { success: false, message: "Room ID required" });
        }

        socket.leave(roomId);
        joinedRooms.delete(roomId);

        const room = await Room.findOne({ roomId, isActive: true });
        if (!room) {
          return safeCallback(callback, { success: true, message: "Match not found" });
        }

        // Find user in room
        const userIndex = room.users.findIndex((u: any) => u.userId.toString() === userId);
        if (userIndex === -1) {
          return safeCallback(callback, { success: true, message: "Not in this match" });
        }

        const leavingUser = room.users[userIndex];

        // Mark user as forfeited
        room.users[userIndex].submissionStatus = "forfeited";
        room.users[userIndex].score = 0;

        // Check if match should end
        const remainingPlayers = room.users.filter(
          (u: any) => u.submissionStatus !== "forfeited"
        );

        let ratingChanges: { [key: string]: { oldRating: number; newRating: number; ratingChange: number } } = {};

        if (remainingPlayers.length <= 1) {
          // End match - remaining player wins by default
          room.roomStatus = "completed";
          room.isActive = false;
          
          // Clear match timer
          const timer = matchTimers.get(roomId);
          if (timer) {
            clearTimeout(timer);
            matchTimers.delete(roomId);
          }

          // Clean up start time tracking
          matchStartTimes.delete(roomId);

          // Calculate Elo rating changes for forfeit
          if (remainingPlayers.length === 1 && room.users.length >= 2) {
            const winner = remainingPlayers[0];
            const loser = leavingUser;

            const winnerRating = winner.rating || DEFAULT_RATING;
            const loserRating = loser.rating || DEFAULT_RATING;

            // Winner gets full win, loser gets full loss
            const resultScores = getMatchResultScores('A'); // Winner is 'A'
            const eloResult = calculateEloRatings(winnerRating, loserRating, resultScores);

            const winnerId = winner.userId?.toString();
            const loserId = loser.userId?.toString();

            if (winnerId) {
              ratingChanges[winnerId] = {
                oldRating: winnerRating,
                newRating: eloResult.newRatingA,
                ratingChange: eloResult.ratingChangeA,
              };
            }
            if (loserId) {
              ratingChanges[loserId] = {
                oldRating: loserRating,
                newRating: eloResult.newRatingB,
                ratingChange: eloResult.ratingChangeB,
              };
            }

            // Update ratings in database
            try {
              const updatePromises = [];
              if (winnerId) {
                updatePromises.push(
                  User.findByIdAndUpdate(winner.userId, { rating: eloResult.newRatingA })
                );
              }
              if (loserId) {
                updatePromises.push(
                  User.findByIdAndUpdate(loser.userId, { rating: eloResult.newRatingB })
                );
              }
              await Promise.all(updatePromises);

              console.log(`Forfeit rating update: ${winner.username} ${winnerRating} → ${eloResult.newRatingA} (${eloResult.ratingChangeA >= 0 ? '+' : ''}${eloResult.ratingChangeA})`);
              console.log(`Forfeit rating update: ${loser.username} ${loserRating} → ${eloResult.newRatingB} (${eloResult.ratingChangeB >= 0 ? '+' : ''}${eloResult.ratingChangeB})`);
            } catch (dbError) {
              console.error("Failed to update ratings in database (forfeit):", dbError);
            }
          }
        }

        await room.save();

        // Notify other player
        io.to(roomId).emit("opponentLeft", {
          userId,
          username: leavingUser.username,
          matchEnded: room.roomStatus === "completed",
          winner: remainingPlayers.length === 1 ? remainingPlayers[0] : null,
          ratingChanges, // Include rating changes in the response
        });

        safeCallback(callback, { success: true, message: "Left the match" });
      } catch (err) {
        console.error("leaveMatch error:", err);
        safeCallback(callback, { success: false, message: "Failed to leave match" });
      }
    });

    // Get current room/match status
    socket.on("getRoomStatus", async ({ roomId }, callback) => {
      try {
        const room = await Room.findOne({ roomId });
        if (!room) {
          return safeCallback(callback, { success: false, message: "Room not found" });
        }

        // Calculate remaining time if match is live
        let remainingTime = null;
        if (room.roomStatus === "Live") {
          const startTime = matchStartTimes.get(roomId) || new Date(room.createdAt).getTime();
          const elapsed = Date.now() - startTime;
          remainingTime = Math.max(0, MATCH_DURATION_MS - elapsed);
        }

        safeCallback(callback, {
          success: true,
          roomId: room.roomId,
          problemId: room.problemId.toString(),
          roomStatus: room.roomStatus,
          users: room.users,
          isActive: room.isActive,
          remainingTime,
        });
      } catch (err) {
        console.error("getRoomStatus error:", err);
        safeCallback(callback, { success: false, message: "Failed to get room status" });
      }
    });

    // Get user's active matches
    socket.on("getActiveMatches", async (callback) => {
      try {
        const activeRooms = await Room.find({
          "users.userId": new mongoose.Types.ObjectId(userId),
          isActive: true,
        }).select("roomId roomStatus users problemId createdAt");

        safeCallback(callback, {
          success: true,
          matches: activeRooms.map((room) => ({
            roomId: room.roomId,
            roomStatus: room.roomStatus,
            problemId: room.problemId.toString(),
            users: room.users,
            createdAt: room.createdAt,
          })),
        });
      } catch (err) {
        console.error("getActiveMatches error:", err);
        safeCallback(callback, { success: false, message: "Failed to get active matches" });
      }
    });

    // Rejoin an existing match (e.g., after reconnection)
    socket.on("rejoinMatch", async ({ roomId }, callback) => {
      try {
        const room = await Room.findOne({ 
          roomId, 
          isActive: true,
          "users.userId": new mongoose.Types.ObjectId(userId),
        });

        if (!room) {
          return safeCallback(callback, { success: false, message: "Match not found or not a participant" });
        }

        socket.join(roomId);
        joinedRooms.add(roomId);

        // Calculate remaining time
        let remainingTime = null;
        if (room.roomStatus === "Live") {
          const startTime = matchStartTimes.get(roomId) || new Date(room.createdAt).getTime();
          const elapsed = Date.now() - startTime;
          remainingTime = Math.max(0, MATCH_DURATION_MS - elapsed);
        }

        safeCallback(callback, {
          success: true,
          roomId: room.roomId,
          problemId: room.problemId.toString(),
          roomStatus: room.roomStatus,
          users: room.users,
          remainingTime,
        });

        // Notify opponent about reconnection
        socket.to(roomId).emit("opponentReconnected", {
          userId,
          username: user.username,
        });
      } catch (err) {
        console.error("rejoinMatch error:", err);
        safeCallback(callback, { success: false, message: "Failed to rejoin match" });
      }
    });

    // ==================== DISCONNECT HANDLING ====================

    socket.on("disconnect", async (reason) => {
      console.log(`Socket ${socket.id} disconnected:`, reason);

      try {
        // Remove from matchmaking queue
        matchmakingQueue.remove(userId);

        // Notify opponents in active matches about disconnection
        for (const roomId of joinedRooms) {
          const room = await Room.findOne({ roomId, isActive: true });
          if (!room) continue;

          // Notify other users about temporary disconnection
          socket.to(roomId).emit("opponentDisconnected", {
            userId,
            username: user.username,
            temporary: true,
            message: "Opponent disconnected. Waiting for reconnection...",
          });
        }
      } catch (err) {
        console.error("disconnect cleanup error:", err);
      }
    });

    // ==================== CHAT (Optional) ====================

    socket.on("sendMessage", async ({ roomId, message }, callback) => {
      try {
        if (!roomId || !message) {
          return safeCallback(callback, { success: false, message: "Missing required fields" });
        }

        // Verify user is in the room
        const room = await Room.findOne({ 
          roomId, 
          "users.userId": new mongoose.Types.ObjectId(userId) 
        });

        if (!room) {
          return safeCallback(callback, { success: false, message: "Not in this room" });
        }

        // Broadcast message to room
        io.to(roomId).emit("newMessage", {
          userId,
          username: user.username,
          message: message.substring(0, 500), // Limit message length
          timestamp: new Date(),
        });

        safeCallback(callback, { success: true });
      } catch (err) {
        console.error("sendMessage error:", err);
        safeCallback(callback, { success: false, message: "Failed to send message" });
      }
    });
  });
};
