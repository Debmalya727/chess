import 'package:flutter/material.dart';

abstract class AppColors {
  // Brand Backgrounds
  static const Color background = Color(0xFF090D16);
  static const Color surface = Color(0xFF111827);
  static const Color surfaceElevated = Color(0xFF1E293B);
  static const Color cardBackground = Color(0xFF1E293B);
  static const Color border = Color(0x1FFFFFFF); // 12% white border

  // Accent Colors
  static const Color primary = Color(0xFF6366F1); // Indigo
  static const Color primaryHover = Color(0xFF4F46E5);
  static const Color accent = Color(0xFF6366F1);
  static const Color emerald = Color(0xFF10B981); // Online / Active
  static const Color success = Color(0xFF10B981);
  static const Color amber = Color(0xFFF59E0B); // Warning / Thinking
  static const Color warning = Color(0xFFF59E0B);
  static const Color rose = Color(0xFFEF4444); // Error / In Check
  static const Color error = Color(0xFFEF4444);

  // Text Colors
  static const Color textMain = Color(0xFFF9FAFB);
  static const Color textPrimary = Color(0xFFF9FAFB);
  static const Color textMuted = Color(0xFF9CA3AF);
  static const Color textDisabled = Color(0xFF64748B);

  // Chess Board Colors (Classic Lichess / Chess.com styling)
  static const Color sqLight = Color(0xFFEEEED2);
  static const Color sqDark = Color(0xFF769656);
  static const Color sqHighlight = Color(0xD8F7F769);
  static const Color sqLastMove = Color(0xB2CDD26A);
  static const Color sqCheck = Color(0xD8EF4444);

  // Piece Colors
  static const Color pieceWhite = Color(0xFFFFFFFF);
  static const Color pieceBlack = Color(0xFF18181B);
}
