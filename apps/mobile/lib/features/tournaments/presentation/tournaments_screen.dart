import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';
import '../../../shared/widgets/connection_badge.dart';

class TournamentsScreen extends StatefulWidget {
  const TournamentsScreen({super.key});

  @override
  State<TournamentsScreen> createState() => _TournamentsScreenState();
}

class _TournamentsScreenState extends State<TournamentsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Tournaments'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: ConnectionBadge()),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: AppColors.primary,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Arena Tournaments'),
            Tab(text: 'Swiss Tournaments'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildTournamentList(isArena: true),
          _buildTournamentList(isArena: false),
        ],
      ),
    );
  }

  Widget _buildTournamentList({required bool isArena}) {
    final typeName = isArena ? 'Arena' : 'Swiss';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Icon(Icons.emoji_events, color: Colors.amber.shade400, size: 28),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Live $typeName Competitions',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppColors.textMain,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 2),
                    const Text(
                      'Server-authoritative standings, tie-breaks, and ratings.',
                      style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),

        _buildTournamentCard(
          title: '$typeName Blitz Open',
          timeControl: '3+0 Blitz',
          duration: isArena ? '50m duration' : '5 rounds',
          players: 18,
          status: 'In Progress',
          isLive: true,
        ),
        const SizedBox(height: 10),

        _buildTournamentCard(
          title: '$typeName Super Rapid',
          timeControl: '10+0 Rapid',
          duration: isArena ? '90m duration' : '7 rounds',
          players: 32,
          status: 'Starts in 25m',
          isLive: false,
        ),
        const SizedBox(height: 10),

        _buildTournamentCard(
          title: '$typeName Bullet Championship',
          timeControl: '1+0 Bullet',
          duration: isArena ? '30m duration' : '9 rounds',
          players: 45,
          status: 'Starts in 1h 10m',
          isLive: false,
        ),
      ],
    );
  }

  Widget _buildTournamentCard({
    required String title,
    required String timeControl,
    required String duration,
    required int players,
    required String status,
    required bool isLive,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (isLive) ...[
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: AppColors.emerald,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                    ],
                    Text(
                      title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                        color: AppColors.textMain,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  '$timeControl • $duration • $players players',
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: isLive ? AppColors.emerald : AppColors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Joined $title queue')),
              );
            },
            child: Text(isLive ? 'Watch' : 'Join', style: const TextStyle(fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
