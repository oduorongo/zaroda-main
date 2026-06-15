// ============================================================
// ZARODA SMS MOBILE — Core Layer
// lib/core/theme/zaroda_theme.dart
// lib/core/constants/app_constants.dart
// lib/core/config/app_flavor.dart
// ============================================================

// ── lib/core/theme/zaroda_theme.dart ─────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

class ZarodaColors {
  // Primary
  static const navy      = Color(0xFF1A2E5A);
  static const navyDeep  = Color(0xFF0F1C38);
  static const navyMid   = Color(0xFF243F7A);
  static const gold      = Color(0xFFD4AF37);
  static const goldLight = Color(0xFFF0D060);
  static const orange    = Color(0xFFF5820A);

  // Semantic
  static const success   = Color(0xFF22C55E);
  static const warning   = Color(0xFFF59E0B);
  static const error     = Color(0xFFEF4444);
  static const info      = Color(0xFF3B82F6);

  // Neutrals
  static const white     = Color(0xFFFFFFFF);
  static const offWhite  = Color(0xFFF7F8FC);
  static const muted     = Color(0xFFF0F2F8);
  static const border    = Color(0xFFE2E6F0);
  static const text      = Color(0xFF1A2040);
  static const textMid   = Color(0xFF4A5278);
  static const textSoft  = Color(0xFF7A82A8);

  // Role accent colours
  static const teacherColor = Color(0xFF22C55E);
  static const hoiColor     = Color(0xFF3B82F6);
  static const parentColor  = Color(0xFFF59E0B);
  static const learnerColor = Color(0xFF8B5CF6);
  static const bursarColor  = Color(0xFF10B981);
}

class ZarodaTheme {
  static ThemeData get light {
    return ThemeData(
      useMaterial3:   true,
      colorScheme:    ColorScheme.fromSeed(
        seedColor:    ZarodaColors.navy,
        primary:      ZarodaColors.navy,
        secondary:    ZarodaColors.gold,
        tertiary:     ZarodaColors.orange,
        surface:      ZarodaColors.white,
        background:   ZarodaColors.offWhite,
        error:        ZarodaColors.error,
        brightness:   Brightness.light,
      ),
      textTheme: GoogleFonts.interTextTheme().copyWith(
        displayLarge:  GoogleFonts.inter(fontWeight: FontWeight.w900, fontSize: 32, color: ZarodaColors.navy),
        displayMedium: GoogleFonts.inter(fontWeight: FontWeight.w800, fontSize: 26, color: ZarodaColors.navy),
        headlineMedium:GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 20, color: ZarodaColors.navy),
        headlineSmall: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 17, color: ZarodaColors.navy),
        titleLarge:    GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15, color: ZarodaColors.text),
        titleMedium:   GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13, color: ZarodaColors.text),
        bodyLarge:     GoogleFonts.inter(fontWeight: FontWeight.w400, fontSize: 14, color: ZarodaColors.text),
        bodyMedium:    GoogleFonts.inter(fontWeight: FontWeight.w400, fontSize: 13, color: ZarodaColors.textMid),
        bodySmall:     GoogleFonts.inter(fontWeight: FontWeight.w400, fontSize: 11, color: ZarodaColors.textSoft),
        labelLarge:    GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 13, color: ZarodaColors.white),
        labelSmall:    GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 10, letterSpacing: 0.8),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor:    ZarodaColors.navy,
        foregroundColor:    ZarodaColors.white,
        elevation:          0,
        scrolledUnderElevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.light,
        titleTextStyle:     GoogleFonts.inter(
          fontWeight: FontWeight.w700, fontSize: 16, color: ZarodaColors.white,
        ),
        iconTheme:    const IconThemeData(color: ZarodaColors.white),
      ),
      cardTheme: CardTheme(
        color:        ZarodaColors.white,
        elevation:    0,
        shape:        RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side:         const BorderSide(color: ZarodaColors.border),
        ),
        margin:       const EdgeInsets.symmetric(vertical: 4),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ZarodaColors.navy,
          foregroundColor: ZarodaColors.white,
          elevation:       0,
          padding:         const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle:       GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 14),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ZarodaColors.navy,
          side:            const BorderSide(color: ZarodaColors.navy),
          padding:         const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape:           RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle:       GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled:           true,
        fillColor:        ZarodaColors.offWhite,
        border:           OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: ZarodaColors.border),
        ),
        enabledBorder:    OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: ZarodaColors.border),
        ),
        focusedBorder:    OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:   const BorderSide(color: ZarodaColors.navy, width: 2),
        ),
        labelStyle:       GoogleFonts.inter(fontSize: 13, color: ZarodaColors.textSoft),
        hintStyle:        GoogleFonts.inter(fontSize: 13, color: ZarodaColors.textSoft),
        contentPadding:   const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor:      ZarodaColors.white,
        selectedItemColor:    ZarodaColors.navy,
        unselectedItemColor:  ZarodaColors.textSoft,
        elevation:            8,
        type:                 BottomNavigationBarType.fixed,
      ),
      chipTheme: ChipThemeData(
        backgroundColor:      ZarodaColors.muted,
        selectedColor:        ZarodaColors.navy,
        labelStyle:           GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600),
        padding:              const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        shape:                RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      dividerTheme: const DividerThemeData(color: ZarodaColors.border, thickness: 1, space: 0),
      scaffoldBackgroundColor: ZarodaColors.offWhite,
    );
  }
}


// ── lib/core/constants/app_constants.dart ─────────────────────
class AppConstants {
  static const appName    = 'ZARODA SMS';
  static const baseUrl    = 'https://api.zarodasolutions.app/api/v1';
  static const wsUrl      = 'wss://api.zarodasolutions.app/ws';
  static const supportWA  = 'https://wa.me/254781230805';
  static const website    = 'https://www.zarodasolutions.app';
  static const tagline    = 'INNOVATIVE. RELIABLE. FORWARD.';
  static const version    = '1.0.0';

  // Storage keys
  static const kAccessToken  = 'zaroda_access_token';
  static const kRefreshToken = 'zaroda_refresh_token';
  static const kUserProfile  = 'zaroda_user_profile';
  static const kTenantId     = 'zaroda_tenant_id';
  static const kSchoolId     = 'zaroda_school_id';

  // CBC Performance levels
  static const cbcLevels = ['EE', 'ME', 'AE', 'BE'];
  static const cbcLevelsLabels = {
    'EE': 'Exceeding Expectation',
    'ME': 'Meeting Expectation',
    'AE': 'Approaching Expectation',
    'BE': 'Below Expectation',
  };
}


// ── lib/core/config/app_flavor.dart ──────────────────────────
// Controls which role-persona the app shows
// One binary, four flavors set at build time
enum AppFlavor {
  teacher,
  hoi,        // Head of Institution (includes Admin/Bursar modes)
  parent,
  learner,
}

class FlavorConfig {
  final AppFlavor flavor;
  final String    appName;
  final String    appId;
  final String    primaryRole;

  const FlavorConfig({
    required this.flavor,
    required this.appName,
    required this.appId,
    required this.primaryRole,
  });

  static FlavorConfig get current => _instance!;
  static FlavorConfig? _instance;

  static void init(AppFlavor flavor) {
    _instance = switch (flavor) {
      AppFlavor.teacher => const FlavorConfig(
        flavor:      AppFlavor.teacher,
        appName:     'ZARODA — Teacher',
        appId:       'app.zarodasolutions.teacher',
        primaryRole: 'class_teacher',
      ),
      AppFlavor.hoi => const FlavorConfig(
        flavor:      AppFlavor.hoi,
        appName:     'ZARODA — Admin',
        appId:       'app.zarodasolutions.admin',
        primaryRole: 'hoi',
      ),
      AppFlavor.parent => const FlavorConfig(
        flavor:      AppFlavor.parent,
        appName:     'ZARODA — Parent',
        appId:       'app.zarodasolutions.parent',
        primaryRole: 'parent',
      ),
      AppFlavor.learner => const FlavorConfig(
        flavor:      AppFlavor.learner,
        appName:     'ZARODA — Learner',
        appId:       'app.zarodasolutions.learner',
        primaryRole: 'learner',
      ),
    };
  }
}
