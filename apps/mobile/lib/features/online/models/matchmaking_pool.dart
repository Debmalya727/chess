class MatchmakingPool {
  final String id;
  final String name;
  final String timeControl;
  final String category; // 'bullet', 'blitz', 'rapid'
  final int baseSeconds;
  final int incrementSeconds;
  final String subtitle;

  const MatchmakingPool({
    required this.id,
    required this.name,
    required this.timeControl,
    required this.category,
    required this.baseSeconds,
    required this.incrementSeconds,
    required this.subtitle,
  });

  static const List<MatchmakingPool> pools = [
    MatchmakingPool(
      id: '1+0',
      name: 'Bullet 1+0',
      timeControl: '1+0',
      category: 'bullet',
      baseSeconds: 60,
      incrementSeconds: 0,
      subtitle: '1 min',
    ),
    MatchmakingPool(
      id: '3+0',
      name: 'Blitz 3+0',
      timeControl: '3+0',
      category: 'blitz',
      baseSeconds: 180,
      incrementSeconds: 0,
      subtitle: '3 min',
    ),
    MatchmakingPool(
      id: '3+2',
      name: 'Blitz 3+2',
      timeControl: '3+2',
      category: 'blitz',
      baseSeconds: 180,
      incrementSeconds: 2,
      subtitle: '3 min + 2s',
    ),
    MatchmakingPool(
      id: '5+0',
      name: 'Blitz 5+0',
      timeControl: '5+0',
      category: 'blitz',
      baseSeconds: 300,
      incrementSeconds: 0,
      subtitle: '5 min',
    ),
    MatchmakingPool(
      id: '5+3',
      name: 'Blitz 5+3',
      timeControl: '5+3',
      category: 'blitz',
      baseSeconds: 300,
      incrementSeconds: 3,
      subtitle: '5 min + 3s',
    ),
    MatchmakingPool(
      id: '10+0',
      name: 'Rapid 10+0',
      timeControl: '10+0',
      category: 'rapid',
      baseSeconds: 600,
      incrementSeconds: 0,
      subtitle: '10 min',
    ),
    MatchmakingPool(
      id: '15+10',
      name: 'Rapid 15+10',
      timeControl: '15+10',
      category: 'rapid',
      baseSeconds: 900,
      incrementSeconds: 10,
      subtitle: '15 min + 10s',
    ),
    MatchmakingPool(
      id: '30+0',
      name: 'Rapid 30+0',
      timeControl: '30+0',
      category: 'rapid',
      baseSeconds: 1800,
      incrementSeconds: 0,
      subtitle: '30 min',
    ),
  ];

  static MatchmakingPool fromTimeControl(String tc) {
    return pools.firstWhere(
      (p) => p.timeControl == tc,
      orElse: () => pools[5], // default 10+0
    );
  }
}
