import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../app/theme/app_colors.dart';
import '../../core/websocket/ws_connection_state.dart';
import '../../features/auth/state/auth_notifier.dart';

class ConnectionBadge extends ConsumerWidget {
  final WsConnectionStatus? status;
  final int retryCount;

  const ConnectionBadge({
    super.key,
    this.status,
    this.retryCount = 0,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final liveState = ref.watch(wsConnectionStreamProvider).asData?.value;
    final effectiveStatus = status ?? liveState?.status ?? WsConnectionStatus.disconnected;
    final effectiveRetries = status != null ? retryCount : (liveState?.retryCount ?? 0);

    Color dotColor = AppColors.rose;
    String label = 'Offline';

    switch (effectiveStatus) {
      case WsConnectionStatus.connected:
        dotColor = AppColors.emerald;
        label = 'Online';
        break;
      case WsConnectionStatus.connecting:
      case WsConnectionStatus.authenticating:
        dotColor = AppColors.amber;
        label = 'Connecting...';
        break;
      case WsConnectionStatus.reconnecting:
        dotColor = AppColors.amber;
        label = 'Reconnecting ($effectiveRetries)...';
        break;
      case WsConnectionStatus.failed:
      case WsConnectionStatus.disconnected:
        dotColor = AppColors.rose;
        label = 'Offline';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surfaceElevated,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: dotColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: AppColors.textMain,
            ),
          ),
        ],
      ),
    );
  }
}
