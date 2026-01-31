/**
 * Contest Rating System Implementation (CodeChef-like)
 * 
 * This implements a rating system for competitive programming contests
 * similar to CodeChef, Codeforces, etc.
 */

interface ContestParticipant {
  userId: string;
  rank: number;
  score: number;
  currentRating: number;
  contestsParticipated: number;
}

interface RatingChange {
  userId: string;
  oldRating: number;
  newRating: number;
  ratingChange: number;
  rank: number;
  score: number;
}

// K-Factor for rating calculation
// Higher for new users, lower for experienced ones
const getKFactor = (contestsPlayed: number, currentRating: number): number => {
  if (contestsPlayed < 6) return 40; // New users
  if (currentRating < 1400) return 32;
  if (currentRating < 1800) return 24;
  if (currentRating < 2200) return 16;
  return 8; // Highly rated users
};

/**
 * Calculate expected rank for a user based on ratings
 */
const calculateExpectedRank = (
  userRating: number,
  allRatings: number[]
): number => {
  let expectedRank = 1;
  
  for (const otherRating of allRatings) {
    const probability = 1 / (1 + Math.pow(10, (otherRating - userRating) / 400));
    expectedRank += (1 - probability);
  }
  
  return expectedRank;
};

/**
 * Calculate rating change based on performance
 */
const calculateRatingChange = (
  actualRank: number,
  expectedRank: number,
  kFactor: number
): number => {
  // Rating change is based on how much better/worse the actual rank is compared to expected
  const performanceFactor = (expectedRank - actualRank) / expectedRank;
  const ratingChange = kFactor * performanceFactor;
  
  // Cap the rating change
  return Math.max(-100, Math.min(100, Math.round(ratingChange)));
};

/**
 * Calculate volatility (uncertainty in rating)
 * New users have higher volatility
 */
const calculateVolatility = (contestsPlayed: number): number => {
  if (contestsPlayed < 6) return 200; // High volatility for new users
  if (contestsPlayed < 15) return 150;
  if (contestsPlayed < 30) return 100;
  return 80; // Stable for experienced users
};

/**
 * Main function to calculate rating changes for all participants
 */
export const calculateContestRatings = (
  participants: ContestParticipant[]
): RatingChange[] => {
  const ratingChanges: RatingChange[] = [];
  
  // Extract all ratings for expected rank calculation
  const allRatings = participants.map(p => p.currentRating);
  
  for (const participant of participants) {
    const kFactor = getKFactor(
      participant.contestsParticipated,
      participant.currentRating
    );
    
    const expectedRank = calculateExpectedRank(
      participant.currentRating,
      allRatings.filter(r => r !== participant.currentRating)
    );
    
    const volatility = calculateVolatility(participant.contestsParticipated);
    
    let ratingChange = calculateRatingChange(
      participant.rank,
      expectedRank,
      kFactor
    );
    
    // Apply volatility bonus for new users performing well
    if (participant.contestsParticipated < 6 && ratingChange > 0) {
      ratingChange = Math.round(ratingChange * 1.2); // 20% bonus
    }
    
    // Calculate new rating
    let newRating = participant.currentRating + ratingChange;
    
    // Ensure rating doesn't go below minimum
    newRating = Math.max(0, Math.min(4000, newRating));
    
    ratingChanges.push({
      userId: participant.userId,
      oldRating: participant.currentRating,
      newRating,
      ratingChange,
      rank: participant.rank,
      score: participant.score,
    });
  }
  
  return ratingChanges;
};

/**
 * Get rating color/tier based on rating value (CodeChef-like)
 */
export const getRatingTier = (rating: number): {
  tier: string;
  color: string;
  minRating: number;
} => {
  if (rating >= 2500) return { tier: '7★ Grandmaster', color: '#FF0000', minRating: 2500 };
  if (rating >= 2200) return { tier: '6★ Master', color: '#FF7F00', minRating: 2200 };
  if (rating >= 2000) return { tier: '5★ Expert', color: '#FFFF00', minRating: 2000 };
  if (rating >= 1800) return { tier: '4★ Specialist', color: '#00FF00', minRating: 1800 };
  if (rating >= 1600) return { tier: '3★ Intermediate', color: '#00FFFF', minRating: 1600 };
  if (rating >= 1400) return { tier: '2★ Pupil', color: '#0000FF', minRating: 1400 };
  if (rating >= 1200) return { tier: '1★ Newbie', color: '#999999', minRating: 1200 };
  return { tier: 'Unrated', color: '#000000', minRating: 0 };
};

/**
 * Calculate global rank for a user based on their rating
 */
export const calculateGlobalRank = async (
  userRating: number,
  totalUsers: number,
  usersWithHigherRating: number
): Promise<number> => {
  return usersWithHigherRating + 1;
};
