import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../app/theme/app_colors.dart';
import '../../../shared/widgets/connection_badge.dart';
import '../../auth/state/auth_notifier.dart';

class OnlineLobbyScreen extends ConsumerWidget {
  const OnlineLobbyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wsState = ref.watch(wsConnectionStreamProvider).asData?.value;
    final isOnline = wsState?.isConnected ?? false;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Play Online'),
        actions: const [
          Padding(
            padding: EdgeInsets.only(right: 16),
            child: Center(child: ConnectionBadge()),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Server Authoritative Notice
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: AppColors.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.shield_outlined, color: AppColors.primary, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Server-Authoritative Fastify Engine',
                          style: TextStyle(
                            color: AppColors.textMain,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'All move validations, clocks, stateVersion reconciliation, and ratings are enforced authoritatively by the backend server.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            const Text(
              'Quick Matchmaking',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            _buildPoolItem(
              context: context,
              name: 'Bullet 1+0',
              time: '1 min',
              icon: Icons.flash_on,
              color: Colors.amber,
              isOnline: isOnline,
            ),
            const SizedBox(height: 8),

            _buildPoolItem(
              context: context,
              name: 'Blitz 3+0',
              time: '3 min',
              icon: Icons.bolt,
              color: Colors.orange,
              isOnline: isOnline,
            ),
            const SizedBox(height: 8),

            _buildPoolItem(
              context: context,
              name: 'Rapid 10+0',
              time: '10 min',
              icon: Icons.timer_outlined,
              color: AppColors.emerald,
              isOnline: isOnline,
            ),
            const SizedBox(height: 8),

            _buildPoolItem(
              context: context,
              name: 'Classical 15+10',
              time: '15 min + 10s',
              icon: Icons.hourglass_bottom,
              color: AppColors.primary,
              isOnline: isOnline,
            ),
            const SizedBox(height: 24),

            const Text(
              'Custom Game & Rooms',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            OutlinedButton.icon(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.textMain,
                side: const BorderSide(color: AppColors.border),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: isOnline
                  ? () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Custom game room creation (M1 feature)')),
                      );
                    }
                  : null,
              icon: const Icon(Icons.add_circle_outline, size: 20),
              label: const Text('Create Private Room'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPoolItem({
    required BuildContext context,
    required String name,
    required String time,
    required IconData icon,
    required Color color,
    required bool isOnline,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.border),
      ),
      child: ListTile(
        leading: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(10),
          ),
          alignment: Alignment.center,
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(
          name,
          style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textMain),
        ),
        subtitle: Text(time, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
        trailing: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: isOnline
              ? () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Matchmaking for $name queued on server')),
                  );
                }
              : null,
          child: const Text('Play', style: TextStyle(fontSize: 13)),
        ),
      ),
    );
  }
}
