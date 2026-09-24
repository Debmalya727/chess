class EngineDifficulty {
  final int level;
  final String label;
  final int estimatedElo;
  final int skillLevel; // UCI Option "Skill Level" (0 to 20)
  final int depth;
  final int moveTimeMs;

  const EngineDifficulty({
    required this.level,
    required this.label,
    required this.estimatedElo,
    required this.skillLevel,
    required this.depth,
    required this.moveTimeMs,
  });

  static const List<EngineDifficulty> all = [
    EngineDifficulty(
      level: 1,
      label: 'Beginner',
      estimatedElo: 800,
      skillLevel: 1,
      depth: 2,
      moveTimeMs: 250,
    ),
    EngineDifficulty(
      level: 2,
      label: 'Casual',
      estimatedElo: 1100,
      skillLevel: 4,
      depth: 4,
      moveTimeMs: 350,
    ),
    EngineDifficulty(
      level: 3,
      label: 'Intermediate',
      estimatedElo: 1400,
      skillLevel: 8,
      depth: 6,
      moveTimeMs: 500,
    ),
    EngineDifficulty(
      level: 4,
      label: 'Advanced',
      estimatedElo: 1700,
      skillLevel: 11,
      depth: 8,
      moveTimeMs: 650,
    ),
    EngineDifficulty(
      level: 5,
      label: 'Expert',
      estimatedElo: 2000,
      skillLevel: 14,
      depth: 11,
      moveTimeMs: 800,
    ),
    EngineDifficulty(
      level: 6,
      label: 'Master',
      estimatedElo: 2200,
      skillLevel: 17,
      depth: 14,
      moveTimeMs: 1000,
    ),
    EngineDifficulty(
      level: 7,
      label: 'Grandmaster',
      estimatedElo: 2400,
      skillLevel: 19,
      depth: 18,
      moveTimeMs: 1400,
    ),
    EngineDifficulty(
      level: 8,
      label: 'Maximum Stockfish',
      estimatedElo: 2700,
      skillLevel: 20,
      depth: 22,
      moveTimeMs: 2000,
    ),
  ];

  static EngineDifficulty fromLevel(int level) {
    return all.firstWhere(
      (d) => d.level == level,
      orElse: () => all[2], // default Intermediate (Level 3)
    );
  }
}
