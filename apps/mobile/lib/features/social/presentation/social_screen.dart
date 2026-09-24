import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';
import '../../../shared/widgets/connection_badge.dart';

class SocialScreen extends StatefulWidget {
  const SocialScreen({super.key});

  @override
  State<SocialScreen> createState() => _SocialScreenState();
}

class _SocialScreenState extends State<SocialScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
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
        title: const Text('Social & Community'),
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
            Tab(text: 'Friends'),
            Tab(text: 'Challenges'),
            Tab(text: 'Leaderboard'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildFriendsTab(),
          _buildChallengesTab(),
          _buildLeaderboardTab(),
        ],
      ),
    );
  }

  Widget _buildFriendsTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        TextField(
          decoration: InputDecoration(
            hintText: 'Search players by username...',
            prefixIcon: const Icon(Icons.search, size: 20),
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: AppColors.border),
            ),
          ),
        ),
        const SizedBox(height: 16),
        _buildUserTile('MagnusC', '2850 Elo', true),
        _buildUserTile('HikaruN', '2820 Elo', true),
        _buildUserTile('GukeshD', '2790 Elo', false),
      ],
    );
  }

  Widget _buildChallengesTab() {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            children: [
              const Icon(Icons.mail_outline, size: 36, color: AppColors.primary),
              const SizedBox(height: 8),
              const Text(
                'No Incoming Challenges',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.textMain,
                  fontSize: 16,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Challenge a friend from the Friends tab or create a custom room.',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLeaderboardTab() {
    final topPlayers = [
      (1, 'MagnusC', 2855),
      (2, 'HikaruN', 2824),
      (3, 'ErigaisiA', 2802),
      (4, 'GukeshD', 2794),
      (5, 'CaruanaF', 2788),
    ];

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: topPlayers.length,
      separatorBuilder: (context, index) => const SizedBox(height: 8),
      itemBuilder: (context, index) {
        final item = topPlayers[index];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Text(
                '#${item.$1}',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 16,
                  color: item.$1 <= 3 ? Colors.amber : AppColors.textMuted,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Text(
                  item.$2,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain),
                ),
              ),
              Text(
                '${item.$3}',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: AppColors.primary,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildUserTile(String name, String rating, bool isOnline) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          Stack(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                child: Text(
                  name[0],
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.primary),
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: isOnline ? AppColors.emerald : AppColors.rose,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.surface, width: 1.5),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain),
                ),
                Text(
                  rating,
                  style: const TextStyle(fontSize: 12, color: AppColors.textMuted),
                ),
              ],
            ),
          ),
          OutlinedButton(
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              minimumSize: const Size(0, 32),
              side: const BorderSide(color: AppColors.border),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('Challenge sent to $name')),
              );
            },
            child: const Text('Challenge', style: TextStyle(fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
