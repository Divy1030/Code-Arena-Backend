/**
 * Elo Rating System Implementation
 * 
 * This module implements the Elo rating system for calculating player rating changes
 * after duel matches based on game outcomes.
 */

// K-Factor constants based on player rating and experience
// Higher K means faster rating changes
const K_FACTOR = {
  NEW_PLAYER: 40,      // New/provisional players (< 30 games or rating < 1200)
  ESTABLISHED: 20,     // Established players (1200-2000 rating)
  HIGH_RATED: 10,      // High-rated players (> 2000 rating)
};

// Rating thresholds
const RATING_THRESHOLDS = {
  NEW_PLAYER_MAX: 1200,
  HIGH_RATED_MIN: 2000,
};

// Minimum and maximum rating bounds
const MIN_RATING = 100;
const MAX_RATING = 4000;

// Maximum rating change per game (optional cap)
const MAX_RATING_CHANGE = 50;

export interface EloResult {
  newRatingA: number;
  newRatingB: number;
  ratingChangeA: number;
  ratingChangeB: number;
  expectedScoreA: number;
  expectedScoreB: number;
}

export interface MatchResult {
  scoreA: number;  // 1 for win, 0.5 for draw, 0 for loss
  scoreB: number;  // 1 for win, 0.5 for draw, 0 for loss
}

/**
 * Calculate the expected score for player A against player B
 * E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 * 
 * @param ratingA - Rating of player A
 * @param ratingB - Rating of player B
 * @returns Expected score for player A (between 0 and 1)
 */
export const calculateExpectedScore = (ratingA: number, ratingB: number): number => {
  const exponent = (ratingB - ratingA) / 400;
  return 1 / (1 + Math.pow(10, exponent));
};

/**
 * Determine the K-factor based on player's rating
 * Higher K-factor for new/lower-rated players, lower for established/high-rated
 * 
 * @param rating - Player's current rating
 * @param gamesPlayed - Optional: number of games played (for provisional status)
 * @returns K-factor value
 */
export const getKFactor = (rating: number, gamesPlayed?: number): number => {
  // New players (provisional) get higher K-factor
  if (gamesPlayed !== undefined && gamesPlayed < 30) {
    return K_FACTOR.NEW_PLAYER;
  }
  
  // Rating-based K-factor
  if (rating < RATING_THRESHOLDS.NEW_PLAYER_MAX) {
    return K_FACTOR.NEW_PLAYER;
  } else if (rating >= RATING_THRESHOLDS.HIGH_RATED_MIN) {
    return K_FACTOR.HIGH_RATED;
  }
  
  return K_FACTOR.ESTABLISHED;
};

/**
 * Calculate the rating change for a player
 * ΔR = K × (S - E)
 * 
 * @param kFactor - K-factor for the player
 * @param actualScore - Actual game result (1, 0.5, or 0)
 * @param expectedScore - Expected score from Elo formula
 * @returns Rating change (positive for gain, negative for loss)
 */
export const calculateRatingChange = (
  kFactor: number, 
  actualScore: number, 
  expectedScore: number
): number => {
  const change = kFactor * (actualScore - expectedScore);
  
  // Optional: cap the rating change to prevent extreme swings
  if (change > MAX_RATING_CHANGE) return MAX_RATING_CHANGE;
  if (change < -MAX_RATING_CHANGE) return -MAX_RATING_CHANGE;
  
  return Math.round(change);
};

/**
 * Clamp rating within bounds
 * 
 * @param rating - Rating to clamp
 * @returns Rating within MIN_RATING and MAX_RATING bounds
 */
const clampRating = (rating: number): number => {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, rating));
};

/**
 * Calculate new Elo ratings for both players after a match
 * 
 * @param ratingA - Current rating of player A
 * @param ratingB - Current rating of player B
 * @param result - Match result with scores for both players
 * @param gamesPlayedA - Optional: games played by player A (for K-factor)
 * @param gamesPlayedB - Optional: games played by player B (for K-factor)
 * @returns Object containing new ratings and rating changes for both players
 */
export const calculateEloRatings = (
  ratingA: number,
  ratingB: number,
  result: MatchResult,
  gamesPlayedA?: number,
  gamesPlayedB?: number
): EloResult => {
  // Calculate expected scores
  const expectedScoreA = calculateExpectedScore(ratingA, ratingB);
  const expectedScoreB = 1 - expectedScoreA; // E_B = 1 - E_A
  
  // Get K-factors for each player
  const kFactorA = getKFactor(ratingA, gamesPlayedA);
  const kFactorB = getKFactor(ratingB, gamesPlayedB);
  
  // Calculate rating changes
  const ratingChangeA = calculateRatingChange(kFactorA, result.scoreA, expectedScoreA);
  const ratingChangeB = calculateRatingChange(kFactorB, result.scoreB, expectedScoreB);
  
  // Calculate and clamp new ratings
  const newRatingA = clampRating(ratingA + ratingChangeA);
  const newRatingB = clampRating(ratingB + ratingChangeB);
  
  return {
    newRatingA,
    newRatingB,
    ratingChangeA,
    ratingChangeB,
    expectedScoreA,
    expectedScoreB,
  };
};

/**
 * Determine match result scores from game outcome
 * 
 * @param winner - 'A' if player A won, 'B' if player B won, 'draw' if tied
 * @returns MatchResult with appropriate scores
 */
export const getMatchResultScores = (winner: 'A' | 'B' | 'draw'): MatchResult => {
  switch (winner) {
    case 'A':
      return { scoreA: 1, scoreB: 0 };
    case 'B':
      return { scoreA: 0, scoreB: 1 };
    case 'draw':
      return { scoreA: 0.5, scoreB: 0.5 };
  }
};

/**
 * Process a duel match and calculate rating changes
 * This is the main function to be used after a match ends
 * 
 * @param playerA - Object with userId, rating, and optional gamesPlayed
 * @param playerB - Object with userId, rating, and optional gamesPlayed
 * @param winner - 'A', 'B', or 'draw'
 * @returns Object with player IDs and their new ratings + changes
 */
export const processDuelMatchRating = (
  playerA: { odlRating: number; gamesPlayed?: number },
  playerB: { oldRating: number; gamesPlayed?: number },
  winner: 'A' | 'B' | 'draw'
): {
  playerA: { newRating: number; ratingChange: number };
  playerB: { newRating: number; ratingChange: number };
} => {
  const result = getMatchResultScores(winner);
  
  const eloResult = calculateEloRatings(
    playerA.odlRating,
    playerB.oldRating,
    result,
    playerA.gamesPlayed,
    playerB.gamesPlayed
  );
  
  return {
    playerA: {
      newRating: eloResult.newRatingA,
      ratingChange: eloResult.ratingChangeA,
    },
    playerB: {
      newRating: eloResult.newRatingB,
      ratingChange: eloResult.ratingChangeB,
    },
  };
};

export {
  K_FACTOR,
  RATING_THRESHOLDS,
  MIN_RATING,
  MAX_RATING,
  MAX_RATING_CHANGE,
};
