import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../app/theme/app_colors.dart';
import '../../../shared/widgets/connection_badge.dart';
import '../../auth/state/auth_notifier.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authNotifierProvider);
    final user = authState.user;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: AppColors.surfaceElevated,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('♞', style: TextStyle(fontSize: 18, color: AppColors.textMain)),
            ),
            const SizedBox(width: 10),
            const Text('Stockfish Chess'),
          ],
        ),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: ConnectionBadge()),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // User Welcome Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.2),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 24,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.2),
                    child: Text(
                      (user?.username.isNotEmpty == true)
                          ? user!.username[0].toUpperCase()
                          : 'G',
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          user?.username ?? 'Guest Player',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: AppColors.textMain,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Rapid Rating: ${user?.rating ?? 1200}',
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (authState.isAuthenticated)
                    IconButton(
                      icon: const Icon(Icons.logout, size: 20, color: AppColors.textMuted),
                      tooltip: 'Sign Out',
                      onPressed: () => ref.read(authNotifierProvider.notifier).logout(),
                    )
                  else
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      ),
                      onPressed: () => context.push('/login'),
                      child: const Text('Sign In', style: TextStyle(fontSize: 13)),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            const Text(
              'Play Modes',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            // Online Matchmaking Card
            _buildModeCard(
              context: context,
              title: 'Play Online',
              subtitle: 'Server-Authoritative Matchmaking & Rated Games',
              icon: Icons.public,
              iconColor: AppColors.emerald,
              route: '/online',
            ),
            const SizedBox(height: 10),

            // Pass & Play (Local 2P)
            _buildModeCard(
              context: context,
              title: 'Local 2-Player',
              subtitle: 'Offline pass-and-play with clocks & flip board',
              icon: Icons.people_outline,
              iconColor: AppColors.primary,
              route: '/local',
            ),
            const SizedBox(height: 10),

            // Play vs Computer
            _buildModeCard(
              context: context,
              title: 'Play Computer',
              subtitle: 'Challenge Stockfish 18 across difficulty levels 1-8',
              icon: Icons.memory,
              iconColor: AppColors.amber,
              route: '/computer',
            ),
            const SizedBox(height: 10),

            // Analysis Board
            _buildModeCard(
              context: context,
              title: 'Analysis Board',
              subtitle: 'Explore positions, variations, and engine evaluations',
              icon: Icons.insights,
              iconColor: const Color(0xFF38BDF8), // Light Blue
              route: '/analysis',
            ),
            const SizedBox(height: 20),

            const Text(
              'Community & Competition',
              style: TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            // Tournaments
            _buildModeCard(
              context: context,
              title: 'Tournaments',
              subtitle: 'Compete in Arena & Swiss tournaments',
              icon: Icons.emoji_events_outlined,
              iconColor: Colors.amber,
              route: '/tournaments',
            ),
            const SizedBox(height: 10),

            // Social & Challenges
            _buildModeCard(
              context: context,
              title: 'Friends & Challenges',
              subtitle: 'Challenge friends, direct messages, and private rooms',
              icon: Icons.chat_bubble_outline,
              iconColor: const Color(0xFFA855F7), // Purple
              route: '/social',
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildModeCard({
    required BuildContext context,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color iconColor,
    required String route,
  }) {
    return InkWell(
      onTap: () => context.push(route),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              alignment: Alignment.center,
              child: Icon(icon, color: iconColor, size: 26),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textMain,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    subtitle,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textDisabled, size: 20),
          ],
        ),
      ),
    );
  }
}
