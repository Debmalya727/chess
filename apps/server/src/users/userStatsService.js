import { getUserRatings, getRatingHistory } from '../db/ratingRepository.js';

export async function getUserStats(userId) {
  const ratingRecords = await getUserRatings(userId);
  const ratingHistory = await getRatingHistory(userId);

  const categories = ['bullet', 'blitz', 'rapid', 'classical'];
  const ratings = {};

  let totalGames = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalDraws = 0;

  for (const cat of categories) {
    const record = ratingRecords.find(r => r.ratingType === cat) || {
      rating: 1500,
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0
    };

    const catHistory = ratingHistory.filter(h => h.ratingType === cat);
    const highestRating = catHistory.reduce((max, h) => Math.max(max, h.newRating), record.rating);

    const winRate = record.gamesPlayed > 0
      ? Math.round((record.wins / record.gamesPlayed) * 1000) / 10
      : 0;

    ratings[cat] = {
      rating: record.rating,
      games: record.gamesPlayed,
      wins: record.wins,
      losses: record.losses,
      draws: record.draws,
      winRate,
      highest: highestRating
    };

    totalGames += record.gamesPlayed;
    totalWins += record.wins;
    totalLosses += record.losses;
    totalDraws += record.draws;
  }

  const overallWinRate = totalGames > 0
    ? Math.round((totalWins / totalGames) * 1000) / 10
    : 0;

  return {
    statistics: {
      games: totalGames,
      wins: totalWins,
      losses: totalLosses,
      draws: totalDraws,
      winRate: overallWinRate
    },
    ratings
  };
}
