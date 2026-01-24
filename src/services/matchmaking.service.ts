import { Socket } from "socket.io";

// Constants
const RATING_RANGE = 200;
const DEFAULT_RATING = 1000;
const MATCHMAKING_TIMEOUT_MS = 30 * 1000; // 30 seconds timeout for finding a match

// Player waiting in queue
interface QueuedPlayer {
  userId: string;
  username: string;
  rating: number;
  socket: Socket;
  joinedAt: number;
  timeoutId?: NodeJS.Timeout;
}

// Matchmaking queue - sorted by rating for efficient matching
class MatchmakingQueue {
  private queue: Map<string, QueuedPlayer> = new Map();

  // Add player to queue
  add(player: QueuedPlayer): void {
    // Remove if already in queue (prevent duplicates)
    this.remove(player.userId);
    this.queue.set(player.userId, player);
    console.log(`Player ${player.username} (rating: ${player.rating}) added to matchmaking queue. Queue size: ${this.queue.size}`);
  }

  // Remove player from queue
  remove(userId: string): QueuedPlayer | undefined {
    const player = this.queue.get(userId);
    if (player) {
      // Clear timeout if exists
      if (player.timeoutId) {
        clearTimeout(player.timeoutId);
      }
      this.queue.delete(userId);
      console.log(`Player ${player.username} removed from matchmaking queue. Queue size: ${this.queue.size}`);
    }
    return player;
  }

  // Check if player is in queue
  has(userId: string): boolean {
    return this.queue.has(userId);
  }

  // Get player from queue
  get(userId: string): QueuedPlayer | undefined {
    return this.queue.get(userId);
  }

  // Find a match for the given player within rating range
  findMatch(player: QueuedPlayer): QueuedPlayer | null {
    const minRating = player.rating - RATING_RANGE;
    const maxRating = player.rating + RATING_RANGE;

    let bestMatch: QueuedPlayer | null = null;
    let smallestRatingDiff = Infinity;

    for (const [userId, candidate] of this.queue) {
      // Skip self
      if (userId === player.userId) continue;

      // Check if within rating range
      if (candidate.rating >= minRating && candidate.rating <= maxRating) {
        const ratingDiff = Math.abs(candidate.rating - player.rating);
        
        // Prefer closer rating match, or if same, prefer who waited longer
        if (ratingDiff < smallestRatingDiff || 
            (ratingDiff === smallestRatingDiff && bestMatch && candidate.joinedAt < bestMatch.joinedAt)) {
          bestMatch = candidate;
          smallestRatingDiff = ratingDiff;
        }
      }
    }

    return bestMatch;
  }

  // Get queue size
  size(): number {
    return this.queue.size;
  }

  // Get all players (for debugging)
  getAll(): QueuedPlayer[] {
    return Array.from(this.queue.values());
  }

  // Clear all players
  clear(): void {
    for (const player of this.queue.values()) {
      if (player.timeoutId) {
        clearTimeout(player.timeoutId);
      }
    }
    this.queue.clear();
  }
}

// Singleton matchmaking queue instance
const matchmakingQueue = new MatchmakingQueue();

export {
  matchmakingQueue,
  QueuedPlayer,
  RATING_RANGE,
  DEFAULT_RATING,
  MATCHMAKING_TIMEOUT_MS,
};
