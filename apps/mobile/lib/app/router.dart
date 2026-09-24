import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'theme/app_colors.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/home/presentation/home_screen.dart';
import '../features/local/presentation/local_game_screen.dart';
import '../features/online/presentation/online_lobby_screen.dart';
import '../features/computer/presentation/computer_screen.dart';
import '../features/analysis/presentation/analysis_screen.dart';
import '../features/tournaments/presentation/tournaments_screen.dart';
import '../features/social/presentation/social_screen.dart';
import '../features/profile/presentation/profile_screen.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'root');
final GlobalKey<NavigatorState> _shellNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'shell');

final GoRouter appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  routes: [
    // ShellRoute with persistent bottom navigation bar
    ShellRoute(
      navigatorKey: _shellNavigatorKey,
      builder: (context, state, child) {
        return _AppScaffold(child: child);
      },
      routes: [
        GoRoute(
          path: '/',
          builder: (context, state) => const HomeScreen(),
        ),
        GoRoute(
          path: '/online',
          builder: (context, state) => const OnlineLobbyScreen(),
        ),
        GoRoute(
          path: '/local',
          builder: (context, state) => const LocalGameScreen(),
        ),
        GoRoute(
          path: '/tournaments',
          builder: (context, state) => const TournamentsScreen(),
        ),
        GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfileScreen(),
        ),
      ],
    ),

    // Fullscreen / standalone routes
    GoRoute(
      path: '/login',
      parentNavigatorKey: _rootNavigatorKey,
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/computer',
      parentNavigatorKey: _rootNavigatorKey,
      builder: (context, state) => const ComputerScreen(),
    ),
    GoRoute(
      path: '/analysis',
      parentNavigatorKey: _rootNavigatorKey,
      builder: (context, state) => const AnalysisScreen(),
    ),
    GoRoute(
      path: '/social',
      parentNavigatorKey: _rootNavigatorKey,
      builder: (context, state) => const SocialScreen(),
    ),
  ],
);

class _AppScaffold extends StatelessWidget {
  final Widget child;

  const _AppScaffold({required this.child});

  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith('/online')) return 1;
    if (location.startsWith('/local')) return 2;
    if (location.startsWith('/tournaments')) return 3;
    if (location.startsWith('/profile')) return 4;
    return 0; // Home
  }

  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/online');
        break;
      case 2:
        context.go('/local');
        break;
      case 3:
        context.go('/tournaments');
        break;
      case 4:
        context.go('/profile');
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final selectedIndex = _calculateSelectedIndex(context);

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.border, width: 1)),
        ),
        child: NavigationBar(
          selectedIndex: selectedIndex,
          onDestinationSelected: (idx) => _onItemTapped(idx, context),
          backgroundColor: AppColors.surface,
          indicatorColor: AppColors.primary.withValues(alpha: 0.2),
          destinations: const [
            NavigationDestination(
              icon: Icon(Icons.home_outlined),
              selectedIcon: Icon(Icons.home, color: AppColors.primary),
              label: 'Home',
            ),
            NavigationDestination(
              icon: Icon(Icons.public_outlined),
              selectedIcon: Icon(Icons.public, color: AppColors.primary),
              label: 'Play',
            ),
            NavigationDestination(
              icon: Icon(Icons.people_outline),
              selectedIcon: Icon(Icons.people, color: AppColors.primary),
              label: 'Local',
            ),
            NavigationDestination(
              icon: Icon(Icons.emoji_events_outlined),
              selectedIcon: Icon(Icons.emoji_events, color: AppColors.primary),
              label: 'Events',
            ),
            NavigationDestination(
              icon: Icon(Icons.person_outline),
              selectedIcon: Icon(Icons.person, color: AppColors.primary),
              label: 'Profile',
            ),
          ],
        ),
      ),
    );
  }
}
