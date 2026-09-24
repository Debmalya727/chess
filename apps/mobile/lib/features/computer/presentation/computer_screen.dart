import 'package:flutter/material.dart';
import '../../../app/theme/app_colors.dart';

class ComputerScreen extends StatefulWidget {
  const ComputerScreen({super.key});

  @override
  State<ComputerScreen> createState() => _ComputerScreenState();
}

class _ComputerScreenState extends State<ComputerScreen> {
  int _selectedLevel = 3;
  String _selectedColor = 'white';

  final List<(int, String, int)> _levels = [
    (1, 'Beginner', 800),
    (2, 'Casual', 1100),
    (3, 'Intermediate', 1400),
    (4, 'Advanced', 1700),
    (5, 'Expert', 2000),
    (6, 'Master', 2200),
    (7, 'Grandmaster', 2400),
    (8, 'Maximum Stockfish', 2700),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Play Computer'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // Strict Fair-Play Banner
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
                  const Icon(Icons.verified_user_outlined, color: AppColors.amber, size: 22),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Strict Fair-Play Invariant',
                          style: TextStyle(
                            color: AppColors.textMain,
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                          ),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'No engine evaluations, best-move arrows, or evaluation bars are exposed to the player during games. Stockfish operates solely on the computer’s turn.',
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
              'Select Difficulty',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 12),

            ..._levels.map((lvl) {
              final isSelected = _selectedLevel == lvl.$1;
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: InkWell(
                  onTap: () => setState(() => _selectedLevel = lvl.$1),
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? AppColors.primary.withValues(alpha: 0.15)
                          : AppColors.surface,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isSelected ? AppColors.primary : AppColors.border,
                        width: isSelected ? 1.5 : 1.0,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 32,
                              height: 32,
                              decoration: BoxDecoration(
                                color: isSelected ? AppColors.primary : AppColors.surfaceElevated,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              alignment: Alignment.center,
                              child: Text(
                                '${lvl.$1}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  lvl.$2,
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isSelected ? AppColors.textMain : AppColors.textMuted,
                                  ),
                                ),
                                Text(
                                  '~${lvl.$3} Elo',
                                  style: const TextStyle(fontSize: 12, color: AppColors.textDisabled),
                                ),
                              ],
                            ),
                          ],
                        ),
                        if (isSelected)
                          const Icon(Icons.check_circle, color: AppColors.primary, size: 20),
                      ],
                    ),
                  ),
                ),
              );
            }),

            const SizedBox(height: 16),
            const Text(
              'Play As',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'white', label: Text('White')),
                ButtonSegment(value: 'random', label: Text('Random')),
                ButtonSegment(value: 'black', label: Text('Black')),
              ],
              selected: {_selectedColor},
              onSelectionChanged: (val) => setState(() => _selectedColor = val.first),
            ),

            const SizedBox(height: 20),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                minimumSize: const Size(double.infinity, 50),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Starting game vs Stockfish Level $_selectedLevel as $_selectedColor'),
                  ),
                );
              },
              child: const Text('Start Game', style: TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
