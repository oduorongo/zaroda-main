// ============================================================
// ZARODA SMS MOBILE — Shared Widgets
// lib/shared/widgets/zaroda_widgets.dart
// ============================================================
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Z-branded App Bar ────────────────────────────────────────
class ZarodaAppBar extends StatelessWidget implements PreferredSizeWidget {
  final String     title;
  final String?    subtitle;
  final List<Widget>? actions;
  final bool       showBack;
  final Widget?    leading;
  final Color?     backgroundColor;

  const ZarodaAppBar({
    super.key,
    required this.title,
    this.subtitle,
    this.actions,
    this.showBack   = true,
    this.leading,
    this.backgroundColor,
  });

  @override
  Size get preferredSize => Size.fromHeight(subtitle != null ? 68 : 56);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor:     backgroundColor ?? ZarodaColors.navy,
      systemOverlayStyle:  SystemUiOverlayStyle.light,
      elevation:           0,
      automaticallyImplyLeading: showBack,
      leading:             leading,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize:       MainAxisSize.min,
        children: [
          Text(title, style: GoogleFonts.inter(
            fontWeight: FontWeight.w700, fontSize: 16, color: ZarodaColors.white,
          )),
          if (subtitle != null)
            Text(subtitle!, style: GoogleFonts.inter(
              fontWeight: FontWeight.w400, fontSize: 11, color: ZarodaColors.white.withOpacity(0.65),
            )),
        ],
      ),
      actions: actions,
      iconTheme: const IconThemeData(color: ZarodaColors.white),
    );
  }
}

// ── ZARODA Logo + brand widget ────────────────────────────────
class ZarodaBrand extends StatelessWidget {
  final double size;
  final bool   showTagline;
  final bool   dark;

  const ZarodaBrand({
    super.key,
    this.size       = 60,
    this.showTagline = false,
    this.dark       = false,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = dark ? ZarodaColors.white : ZarodaColors.navy;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Logo image with Z fallback
        Image.asset('assets/images/zaroda_logo.png',
          height: size, fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Container(
            width: size, height: size,
            decoration: BoxDecoration(
              color:        dark ? ZarodaColors.gold : ZarodaColors.navy,
              borderRadius: BorderRadius.circular(size * 0.18),
            ),
            child: Center(child: Text('Z',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w900,
                fontSize:   size * 0.5,
                color:      dark ? ZarodaColors.navyDeep : ZarodaColors.gold,
              ),
            )),
          ),
        ),
        const SizedBox(height: 8),
        Text('ZARODA', style: GoogleFonts.inter(
          fontWeight: FontWeight.w900, fontSize: size * 0.32, color: textColor, letterSpacing: 2,
        )),
        Text('SCHOOL MANAGEMENT', style: GoogleFonts.inter(
          fontWeight: FontWeight.w500, fontSize: size * 0.14, color: textColor.withOpacity(0.6), letterSpacing: 1.2,
        )),
        if (showTagline) ...[
          const SizedBox(height: 4),
          Text(AppConstants.tagline, style: GoogleFonts.inter(
            fontWeight: FontWeight.w600, fontSize: size * 0.12,
            color:      ZarodaColors.gold, letterSpacing: 0.8,
          )),
        ],
      ],
    );
  }
}

// ── Stat card ─────────────────────────────────────────────────
class ZarodaStatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData? icon;
  final Color?    color;
  final VoidCallback? onTap;

  const ZarodaStatCard({
    super.key,
    required this.label,
    required this.value,
    this.icon,
    this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final accent = color ?? ZarodaColors.navy;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color:        ZarodaColors.white,
          borderRadius: BorderRadius.circular(14),
          border:       Border.all(color: ZarodaColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize:       MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Container(
                width: 34, height: 34,
                decoration: BoxDecoration(
                  color:        accent.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, size: 18, color: accent),
              ),
              const SizedBox(height: 10),
            ],
            Text(value, style: GoogleFonts.inter(
              fontWeight: FontWeight.w800, fontSize: 24, color: accent,
            )),
            const SizedBox(height: 2),
            Text(label, style: GoogleFonts.inter(
              fontWeight: FontWeight.w500, fontSize: 11,
              color:      ZarodaColors.textSoft,
            )),
          ],
        ),
      ),
    );
  }
}

// ── CBC Performance level badge ───────────────────────────────
class CbcLevelBadge extends StatelessWidget {
  final String level;
  final double? fontSize;

  const CbcLevelBadge({super.key, required this.level, this.fontSize});

  Color get _color => switch (level) {
    'EE' || 'EE1' || 'EE2' => ZarodaColors.success,
    'ME' || 'ME1' || 'ME2' => ZarodaColors.info,
    'AE' || 'AE1' || 'AE2' => ZarodaColors.warning,
    'BE' || 'BE1' || 'BE2' => ZarodaColors.error,
    _                       => ZarodaColors.textSoft,
  };

  String get _label => switch (level) {
    'EE'  => 'Exceeding',
    'ME'  => 'Meeting',
    'AE'  => 'Approaching',
    'BE'  => 'Below',
    _     => level,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color:        _color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(20),
        border:       Border.all(color: _color.withOpacity(0.3)),
      ),
      child: Text(level, style: GoogleFonts.inter(
        fontWeight: FontWeight.w700,
        fontSize:   fontSize ?? 12,
        color:      _color,
      )),
    );
  }
}

// ── Loading shimmer placeholder ───────────────────────────────
class ZarodaShimmer extends StatelessWidget {
  final double width;
  final double height;
  final double radius;

  const ZarodaShimmer({
    super.key,
    required this.width,
    required this.height,
    this.radius = 8,
  });

  @override
  Widget build(BuildContext context) {
    return Shimmer.fromColors(
      baseColor:      ZarodaColors.border,
      highlightColor: ZarodaColors.muted,
      child:          Container(
        width:       width,
        height:      height,
        decoration:  BoxDecoration(
          color:        ZarodaColors.border,
          borderRadius: BorderRadius.circular(radius),
        ),
      ),
    );
  }
}

// ── Empty state ───────────────────────────────────────────────
class ZarodaEmptyState extends StatelessWidget {
  final IconData icon;
  final String   title;
  final String?  subtitle;
  final Widget?  action;

  const ZarodaEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(
                color:        ZarodaColors.muted,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Icon(icon, size: 36, color: ZarodaColors.textSoft),
            ),
            const SizedBox(height: 16),
            Text(title, style: Theme.of(context).textTheme.titleLarge, textAlign: TextAlign.center),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium, textAlign: TextAlign.center),
            ],
            if (action != null) ...[
              const SizedBox(height: 20),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}

// ── Section header ─────────────────────────────────────────────
class ZarodaSectionHeader extends StatelessWidget {
  final String    title;
  final String?   actionLabel;
  final VoidCallback? onAction;

  const ZarodaSectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Text(title, style: GoogleFonts.inter(
            fontWeight: FontWeight.w700, fontSize: 15, color: ZarodaColors.navy,
          )),
          const Spacer(),
          if (actionLabel != null)
            GestureDetector(
              onTap: onAction,
              child: Text(actionLabel!, style: GoogleFonts.inter(
                fontWeight: FontWeight.w600, fontSize: 12, color: ZarodaColors.orange,
              )),
            ),
        ],
      ),
    );
  }
}

// ── Error snackbar helper ─────────────────────────────────────
void showZarodaSnackbar(BuildContext context, String message, {bool isError = false}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    content:          Text(message),
    backgroundColor:  isError ? ZarodaColors.error : ZarodaColors.success,
    behavior:         SnackBarBehavior.floating,
    shape:            RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    margin:           const EdgeInsets.all(12),
  ));
}
