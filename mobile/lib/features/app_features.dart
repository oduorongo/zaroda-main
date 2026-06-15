// ============================================================
// ZARODA SMS MOBILE — Four App Entry Points + Feature Screens
// main_teacher.dart  · main_hoi.dart
// main_parent.dart   · main_learner.dart
// + Full feature screens for each role
// ============================================================

// ─────────────────────────────────────────────────────────────
// lib/main_teacher.dart
// ─────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';

Future<void> mainTeacher() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FlavorConfig.init(AppFlavor.teacher);
  runApp(const ProviderScope(child: ZarodaApp()));
}

// lib/main_hoi.dart
Future<void> mainHoi() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FlavorConfig.init(AppFlavor.hoi);
  runApp(const ProviderScope(child: ZarodaApp()));
}

// lib/main_parent.dart
Future<void> mainParent() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FlavorConfig.init(AppFlavor.parent);
  runApp(const ProviderScope(child: ZarodaApp()));
}

// lib/main_learner.dart
Future<void> mainLearner() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  FlavorConfig.init(AppFlavor.learner);
  runApp(const ProviderScope(child: ZarodaApp()));
}

// ─────────────────────────────────────────────────────────────
// lib/app.dart — Root widget + router
// ─────────────────────────────────────────────────────────────
class ZarodaApp extends ConsumerWidget {
  const ZarodaApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return MaterialApp.router(
      title:          FlavorConfig.current.appName,
      theme:          ZarodaTheme.light,
      debugShowCheckedModeBanner: false,
      routerConfig:   AppRouter.router(user, FlavorConfig.current.flavor),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// lib/core/router/app_router.dart
// ─────────────────────────────────────────────────────────────
import 'package:go_router/go_router.dart';

class AppRouter {
  static GoRouter router(AppUser? user, AppFlavor flavor) {
    return GoRouter(
      initialLocation: user == null ? '/login' : '/home',
      redirect: (context, state) {
        final loggedIn = user != null;
        final onLogin  = state.matchedLocation == '/login';
        if (!loggedIn && !onLogin) return '/login';
        if (loggedIn  &&  onLogin) return '/home';
        return null;
      },
      routes: [
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child, flavor: flavor),
          routes: _routesForFlavor(flavor),
        ),
      ],
    );
  }

  static List<RouteBase> _routesForFlavor(AppFlavor flavor) {
    return switch (flavor) {
      AppFlavor.teacher => [
        GoRoute(path: '/home',           builder: (_, __) => const TeacherHomeScreen()),
        GoRoute(path: '/attendance',     builder: (_, __) => const AttendanceScreen()),
        GoRoute(path: '/schemes',        builder: (_, __) => const SchemesScreen()),
        GoRoute(path: '/report-cards',   builder: (_, __) => const ReportCardsScreen()),
        GoRoute(path: '/messages',       builder: (_, __) => const MessagesScreen()),
        GoRoute(path: '/invite',         builder: (_, __) => const TeacherInviteScreen()),
        GoRoute(path: '/discipline',     builder: (_, __) => const DisciplineScreen()),
      ],
      AppFlavor.hoi => [
        GoRoute(path: '/home',           builder: (_, __) => const HoiHomeScreen()),
        GoRoute(path: '/learners',       builder: (_, __) => const LearnersScreen()),
        GoRoute(path: '/finance',        builder: (_, __) => const FinanceScreen()),
        GoRoute(path: '/staff',          builder: (_, __) => const StaffScreen()),
        GoRoute(path: '/approvals',      builder: (_, __) => const ApprovalsScreen()),
        GoRoute(path: '/analytics',      builder: (_, __) => const AnalyticsScreen()),
        GoRoute(path: '/announcements',  builder: (_, __) => const AnnouncementsScreen()),
        GoRoute(path: '/discipline',     builder: (_, __) => const DisciplineScreen()),
      ],
      AppFlavor.parent => [
        GoRoute(path: '/home',           builder: (_, __) => const ParentHomeScreen()),
        GoRoute(path: '/results',        builder: (_, __) => const ResultsScreen()),
        GoRoute(path: '/fees',           builder: (_, __) => const FeesScreen()),
        GoRoute(path: '/attendance',     builder: (_, __) => const LearnerAttendanceScreen()),
        GoRoute(path: '/messages',       builder: (_, __) => const MessagesScreen()),
        GoRoute(path: '/report-cards',   builder: (_, __) => const ReportCardsScreen()),
      ],
      AppFlavor.learner => [
        GoRoute(path: '/home',           builder: (_, __) => const LearnerHomeScreen()),
        GoRoute(path: '/timetable',      builder: (_, __) => const TimetableScreen()),
        GoRoute(path: '/results',        builder: (_, __) => const ResultsScreen()),
        GoRoute(path: '/library',        builder: (_, __) => const LibraryScreen()),
        GoRoute(path: '/announcements',  builder: (_, __) => const AnnouncementsScreen()),
      ],
    };
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/auth/login_screen.dart
// ─────────────────────────────────────────────────────────────
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool  _loading      = false;
  bool  _obscure      = true;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ZarodaColors.navy,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(children: [
            const SizedBox(height: 24),
            const ZarodaBrand(size: 80, showTagline: true, dark: true),
            const SizedBox(height: 48),

            // Card
            Container(
              padding:     const EdgeInsets.all(24),
              decoration:  BoxDecoration(
                color:        ZarodaColors.white,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(children: [
                Text('Welcome back', style: Theme.of(context).textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text('Sign in to ${FlavorConfig.current.appName}',
                  style: Theme.of(context).textTheme.bodyMedium),
                const SizedBox(height: 24),

                if (_error != null) ...[
                  Container(
                    padding:     const EdgeInsets.all(12),
                    decoration:  BoxDecoration(
                      color:        ZarodaColors.error.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                      border:       Border.all(color: ZarodaColors.error.withOpacity(0.3)),
                    ),
                    child: Text(_error!, style: const TextStyle(color: ZarodaColors.error, fontSize: 13)),
                  ),
                  const SizedBox(height: 16),
                ],

                TextFormField(
                  controller:   _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration:   const InputDecoration(labelText: 'Email address', prefixIcon: Icon(Icons.email_outlined)),
                ),
                const SizedBox(height: 14),
                TextFormField(
                  controller:     _passwordCtrl,
                  obscureText:    _obscure,
                  decoration: InputDecoration(
                    labelText:   'Password',
                    prefixIcon:  const Icon(Icons.lock_outline),
                    suffixIcon:  IconButton(
                      icon:      Icon(_obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _handleLogin,
                    child:     _loading
                      ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Sign In'),
                  ),
                ),
              ]),
            ),

            const SizedBox(height: 24),
            TextButton(
              onPressed: () => launchUrl(Uri.parse(AppConstants.supportWA)),
              child:     Text('Need help? WhatsApp support',
                style: GoogleFonts.inter(color: ZarodaColors.gold, fontWeight: FontWeight.w600)),
            ),
          ]),
        ),
      ),
    );
  }

  Future<void> _handleLogin() async {
    setState(() { _loading = true; _error = null; });
    final ok = await ref.read(currentUserProvider.notifier).login(
      _emailCtrl.text.trim(), _passwordCtrl.text,
    );
    if (mounted) {
      setState(() => _loading = false);
      if (!ok) setState(() => _error = 'Invalid email or password. Please try again.');
    }
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/teacher/teacher_home_screen.dart
// ─────────────────────────────────────────────────────────────
class TeacherHomeScreen extends ConsumerWidget {
  const TeacherHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user  = ref.watch(currentUserProvider)!;
    final today = DateTime.now();

    return Scaffold(
      backgroundColor: ZarodaColors.offWhite,
      appBar: ZarodaAppBar(
        title:    'Good ${_greeting()}, ${user.firstName}',
        subtitle: user.streamName ?? 'Class Teacher',
        showBack: false,
        actions: [
          IconButton(
            icon:      const Icon(Icons.notifications_outlined),
            onPressed: () {},
            color:     ZarodaColors.gold,
          ),
        ],
      ),
      body: RefreshIndicator(
        color:      ZarodaColors.navy,
        onRefresh:  () async {},
        child:      ListView(
          padding:  const EdgeInsets.all(16),
          children: [
            // Date banner
            Container(
              padding:     const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration:  BoxDecoration(
                gradient:     const LinearGradient(colors: [ZarodaColors.navy, ZarodaColors.navyMid]),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(children: [
                const Icon(Icons.calendar_today, color: ZarodaColors.gold, size: 18),
                const SizedBox(width: 10),
                Text(
                  '${_weekday(today.weekday)}, ${today.day} ${_month(today.month)} ${today.year}',
                  style: GoogleFonts.inter(color: ZarodaColors.white, fontWeight: FontWeight.w600, fontSize: 13),
                ),
              ]),
            ),
            const SizedBox(height: 16),

            // Quick actions
            ZarodaSectionHeader(title: 'Quick Actions'),
            GridView.count(
              crossAxisCount: 3, shrinkWrap: true,
              physics:        const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10, crossAxisSpacing: 10,
              childAspectRatio: 1.0,
              children: [
                _QuickAction(icon: Icons.how_to_reg,     label: 'Attendance',   route: '/attendance',   color: ZarodaColors.success),
                _QuickAction(icon: Icons.description,    label: 'Schemes',      route: '/schemes',      color: ZarodaColors.navy),
                _QuickAction(icon: Icons.grading,        label: 'Report Cards', route: '/report-cards', color: ZarodaColors.orange),
                _QuickAction(icon: Icons.chat_outlined,  label: 'Messages',     route: '/messages',     color: ZarodaColors.info),
                _QuickAction(icon: Icons.share,          label: 'Invite',       route: '/invite',       color: ZarodaColors.gold),
                _QuickAction(icon: Icons.gavel,          label: 'Discipline',   route: '/discipline',   color: ZarodaColors.error),
              ],
            ),
            const SizedBox(height: 16),

            // Today's timetable preview
            ZarodaSectionHeader(title: "Today's Lessons", actionLabel: 'Full timetable →', onAction: () {}),
            _TodaysTimetableCard(),
            const SizedBox(height: 16),

            // Pending items
            _PendingItemsCard(),
          ],
        ),
      ),
    );
  }

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  String _weekday(int w) => ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][w - 1];
  String _month(int m)   => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1];
}

class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String   label;
  final String   route;
  final Color    color;

  const _QuickAction({required this.icon, required this.label, required this.route, required this.color});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => context.go(route),
      child: Container(
        decoration: BoxDecoration(
          color:        ZarodaColors.white,
          borderRadius: BorderRadius.circular(14),
          border:       Border.all(color: ZarodaColors.border),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 44, height: 44,
              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(height: 8),
            Text(label, textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 11, color: ZarodaColors.textMid),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/parent/parent_home_screen.dart
// ─────────────────────────────────────────────────────────────
class ParentHomeScreen extends ConsumerWidget {
  const ParentHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider)!;

    return Scaffold(
      appBar: ZarodaAppBar(
        title:    'Hello, ${user.firstName}',
        subtitle: 'Parent Portal',
        showBack: false,
        actions: [
          IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () {}, color: ZarodaColors.gold),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Child summary card
          Container(
            padding:     const EdgeInsets.all(18),
            decoration:  BoxDecoration(
              gradient:     const LinearGradient(colors: [ZarodaColors.navy, ZarodaColors.navyMid], begin: Alignment.topLeft, end: Alignment.bottomRight),
              borderRadius: BorderRadius.circular(18),
            ),
            child: Row(children: [
              CircleAvatar(
                radius:          28,
                backgroundColor: ZarodaColors.gold.withOpacity(0.2),
                child:           const Icon(Icons.school, color: ZarodaColors.gold, size: 28),
              ),
              const SizedBox(width: 14),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Your Child', style: GoogleFonts.inter(color: ZarodaColors.white.withOpacity(0.6), fontSize: 11)),
                  Text('Loading…',  style: GoogleFonts.inter(color: ZarodaColors.white, fontWeight: FontWeight.w700, fontSize: 16)),
                  Text('ZARODA School', style: GoogleFonts.inter(color: ZarodaColors.gold, fontSize: 12)),
                ],
              )),
            ]),
          ),
          const SizedBox(height: 16),

          // Stats row
          Row(children: [
            Expanded(child: ZarodaStatCard(label: 'Term Balance', value: 'KES 0',   icon: Icons.account_balance_wallet, color: ZarodaColors.error,   onTap: () => context.go('/fees'))),
            const SizedBox(width: 10),
            Expanded(child: ZarodaStatCard(label: 'Attendance',   value: '—%',      icon: Icons.check_circle_outline,   color: ZarodaColors.success, onTap: () => context.go('/attendance'))),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: ZarodaStatCard(label: 'Performance',  value: '—',       icon: Icons.bar_chart,              color: ZarodaColors.info,    onTap: () => context.go('/results'))),
            const SizedBox(width: 10),
            Expanded(child: ZarodaStatCard(label: 'Messages',     value: '0 new',   icon: Icons.chat_bubble_outline,    color: ZarodaColors.navy,    onTap: () => context.go('/messages'))),
          ]),
          const SizedBox(height: 16),

          // Pay fees CTA
          ZarodaSectionHeader(title: 'Fee Payment'),
          _FeePaymentCard(),
          const SizedBox(height: 16),

          // Recent activity
          ZarodaSectionHeader(title: 'Recent Updates', actionLabel: 'View all', onAction: () {}),
          _RecentActivityList(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/hoi/hoi_home_screen.dart
// ─────────────────────────────────────────────────────────────
class HoiHomeScreen extends ConsumerWidget {
  const HoiHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider)!;

    return Scaffold(
      appBar: ZarodaAppBar(
        title:    'Dashboard',
        subtitle: '${user.firstName} ${user.lastName} · HOI',
        showBack: false,
        actions: [
          IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () {}, color: ZarodaColors.gold),
          IconButton(icon: const Icon(Icons.settings_outlined),      onPressed: () {}),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // KPI grid
          GridView.count(
            crossAxisCount: 2, shrinkWrap: true,
            physics:        const NeverScrollableScrollPhysics(),
            mainAxisSpacing: 10, crossAxisSpacing: 10,
            childAspectRatio: 1.5,
            children: [
              ZarodaStatCard(label: 'Total Learners',  value: '—',   icon: Icons.people_outline,         color: ZarodaColors.navy,    onTap: () => context.go('/learners')),
              ZarodaStatCard(label: 'Outstanding Fees',value: 'KES—',icon: Icons.account_balance_wallet, color: ZarodaColors.error,   onTap: () => context.go('/finance')),
              ZarodaStatCard(label: 'Staff Members',   value: '—',   icon: Icons.badge_outlined,         color: ZarodaColors.success, onTap: () => context.go('/staff')),
              ZarodaStatCard(label: 'Pending Approvals',value: '0',  icon: Icons.pending_actions,        color: ZarodaColors.orange,  onTap: () => context.go('/approvals')),
            ],
          ),
          const SizedBox(height: 16),
          ZarodaSectionHeader(title: 'Pending Approvals', actionLabel: 'See all', onAction: () => context.go('/approvals')),
          _ApprovalsPreviewList(),
          const SizedBox(height: 16),
          ZarodaSectionHeader(title: 'Recent Incidents', actionLabel: 'See all', onAction: () => context.go('/discipline')),
          _IncidentsPreviewList(),
          const SizedBox(height: 16),
          ZarodaSectionHeader(title: 'Quick Send', actionLabel: ''),
          _AnnouncementComposer(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/learner/learner_home_screen.dart
// ─────────────────────────────────────────────────────────────
class LearnerHomeScreen extends ConsumerWidget {
  const LearnerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider)!;

    return Scaffold(
      backgroundColor: ZarodaColors.offWhite,
      appBar: ZarodaAppBar(
        title:    'Hi, ${user.firstName}!',
        subtitle: 'Your school dashboard',
        showBack: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Today's timetable
          ZarodaSectionHeader(title: "Today's Timetable", actionLabel: 'Full →', onAction: () => context.go('/timetable')),
          _TodaysTimetableCard(),
          const SizedBox(height: 16),

          // Results preview
          ZarodaSectionHeader(title: 'Recent Results', actionLabel: 'View all →', onAction: () => context.go('/results')),
          _LearnerResultsPreview(),
          const SizedBox(height: 16),

          // Library loans
          ZarodaSectionHeader(title: 'Library', actionLabel: 'Browse →', onAction: () => context.go('/library')),
          _LibraryLoansCard(),
          const SizedBox(height: 16),

          // Announcements
          ZarodaSectionHeader(title: 'School Notices', actionLabel: 'All →', onAction: () => context.go('/announcements')),
          _AnnouncementsList(compact: true),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// lib/features/attendance/attendance_screen.dart
// ─────────────────────────────────────────────────────────────
class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});
  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  final Map<String, String> _attendance = {};  // learnerId → 'present'|'absent'|'late'|'excused'
  List<dynamic> _learners = [];
  bool          _loading  = true;
  bool          _saving   = false;

  @override
  void initState() {
    super.initState();
    _loadLearners();
  }

  Future<void> _loadLearners() async {
    try {
      final user = ref.read(currentUserProvider)!;
      final data = await ref.read(apiServiceProvider).get<List>(
        '/attendance/learners/${user.streamId}',
      );
      setState(() { _learners = data; _loading = false; });
      for (final l in data) { _attendance[l['id']] = 'present'; }
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _submit() async {
    setState(() => _saving = true);
    try {
      await ref.read(apiServiceProvider).post('/attendance/bulk', body: {
        'date':    DateTime.now().toIso8601String().split('T')[0],
        'records': _attendance.entries.map((e) => {'learnerId': e.key, 'status': e.value}).toList(),
      });
      if (mounted) showZarodaSnackbar(context, 'Attendance saved successfully!');
    } catch (_) {
      if (mounted) showZarodaSnackbar(context, 'Failed to save. Please try again.', isError: true);
    } finally { setState(() => _saving = false); }
  }

  @override
  Widget build(BuildContext context) {
    final totalPresent = _attendance.values.where((v) => v == 'present').length;

    return Scaffold(
      appBar: ZarodaAppBar(
        title:    'Attendance',
        subtitle: DateTime.now().toString().split(' ')[0],
        actions: [
          TextButton(
            onPressed: _saving ? null : _submit,
            child:     _saving
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : Text('Save', style: GoogleFonts.inter(color: ZarodaColors.gold, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: Column(children: [
        // Summary bar
        Container(
          color:   ZarodaColors.navy.withOpacity(0.05),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child:   Row(children: [
            _AttendanceStat('Present', totalPresent.toString(),                                          ZarodaColors.success),
            const SizedBox(width: 16),
            _AttendanceStat('Absent',  _attendance.values.where((v) => v == 'absent').length.toString(),  ZarodaColors.error),
            const SizedBox(width: 16),
            _AttendanceStat('Late',    _attendance.values.where((v) => v == 'late').length.toString(),    ZarodaColors.warning),
            const Spacer(),
            Text('${_learners.length} learners', style: Theme.of(context).textTheme.bodySmall),
          ]),
        ),
        if (_loading)
          const Expanded(child: Center(child: CircularProgressIndicator()))
        else
          Expanded(child: ListView.separated(
            padding:     const EdgeInsets.all(12),
            itemCount:   _learners.length,
            separatorBuilder: (_, __) => const SizedBox(height: 6),
            itemBuilder: (context, i) {
              final l      = _learners[i];
              final status = _attendance[l['id']] ?? 'present';
              return Container(
                decoration: BoxDecoration(
                  color:        ZarodaColors.white,
                  borderRadius: BorderRadius.circular(12),
                  border:       Border.all(color: ZarodaColors.border),
                ),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
                  leading: CircleAvatar(
                    backgroundColor: ZarodaColors.navy.withOpacity(0.1),
                    child: Text(
                      l['firstName']?[0] ?? '?',
                      style: GoogleFonts.inter(color: ZarodaColors.navy, fontWeight: FontWeight.w700),
                    ),
                  ),
                  title: Text('${l['firstName']} ${l['lastName']}',
                    style: GoogleFonts.inter(fontWeight: FontWeight.w600, fontSize: 14)),
                  subtitle: Text(l['admissionNumber'] ?? '', style: Theme.of(context).textTheme.bodySmall),
                  trailing: _AttendanceToggle(
                    status:   status,
                    onChanged: (s) => setState(() => _attendance[l['id']] = s),
                  ),
                ),
              );
            },
          )),
      ]),
    );
  }
}

class _AttendanceStat extends StatelessWidget {
  final String label, value;
  final Color  color;
  const _AttendanceStat(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(width: 10, height: 10, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
    const SizedBox(width: 5),
    Text('$value $label', style: GoogleFonts.inter(fontSize: 12, fontWeight: FontWeight.w600, color: ZarodaColors.textMid)),
  ]);
}

class _AttendanceToggle extends StatelessWidget {
  final String  status;
  final void Function(String) onChanged;
  const _AttendanceToggle({required this.status, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    const statuses = ['present','absent','late','excused'];
    const colors   = [ZarodaColors.success, ZarodaColors.error, ZarodaColors.warning, ZarodaColors.info];
    const labels   = ['P','A','L','E'];
    return Row(mainAxisSize: MainAxisSize.min, children: List.generate(4, (i) {
      final s = statuses[i];
      final selected = status == s;
      return GestureDetector(
        onTap: () => onChanged(s),
        child: Container(
          width: 30, height: 30, margin: const EdgeInsets.symmetric(horizontal: 2),
          decoration: BoxDecoration(
            color:        selected ? colors[i] : colors[i].withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(child: Text(labels[i],
            style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 11,
              color: selected ? ZarodaColors.white : colors[i]))),
        ),
      );
    }));
  }
}

// ─────────────────────────────────────────────────────────────
// Bottom nav shell
// ─────────────────────────────────────────────────────────────
class AppShell extends StatefulWidget {
  final Widget    child;
  final AppFlavor flavor;
  const AppShell({super.key, required this.child, required this.flavor});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  List<_NavItem> get _items => switch (widget.flavor) {
    AppFlavor.teacher => [
      _NavItem('Home',       Icons.home_outlined,       Icons.home,         '/home'),
      _NavItem('Attendance', Icons.how_to_reg_outlined, Icons.how_to_reg,   '/attendance'),
      _NavItem('Schemes',    Icons.description_outlined,Icons.description,  '/schemes'),
      _NavItem('Messages',   Icons.chat_outlined,       Icons.chat,         '/messages'),
    ],
    AppFlavor.hoi => [
      _NavItem('Dashboard',  Icons.dashboard_outlined,  Icons.dashboard,    '/home'),
      _NavItem('Learners',   Icons.people_outline,      Icons.people,       '/learners'),
      _NavItem('Finance',    Icons.account_balance_wallet_outlined, Icons.account_balance_wallet, '/finance'),
      _NavItem('Approvals',  Icons.pending_actions,     Icons.pending,      '/approvals'),
      _NavItem('Announce',   Icons.campaign_outlined,   Icons.campaign,     '/announcements'),
    ],
    AppFlavor.parent => [
      _NavItem('Home',       Icons.home_outlined,       Icons.home,         '/home'),
      _NavItem('Results',    Icons.bar_chart_outlined,  Icons.bar_chart,    '/results'),
      _NavItem('Fees',       Icons.wallet_outlined,     Icons.wallet,       '/fees'),
      _NavItem('Messages',   Icons.chat_outlined,       Icons.chat,         '/messages'),
    ],
    AppFlavor.learner => [
      _NavItem('Home',       Icons.home_outlined,       Icons.home,         '/home'),
      _NavItem('Timetable',  Icons.calendar_month_outlined, Icons.calendar_month, '/timetable'),
      _NavItem('Results',    Icons.bar_chart_outlined,  Icons.bar_chart,    '/results'),
      _NavItem('Library',    Icons.menu_book_outlined,  Icons.menu_book,    '/library'),
    ],
  };

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final idx = _items.indexWhere((i) => i.route == location);

    return Scaffold(
      body: widget.child,
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
          color: ZarodaColors.white,
          border: Border(top: BorderSide(color: ZarodaColors.border)),
        ),
        child: SafeArea(
          child: Row(children: _items.asMap().entries.map((entry) {
            final i       = entry.key;
            final item    = entry.value;
            final active  = i == idx;
            return Expanded(child: GestureDetector(
              onTap: () => context.go(item.route),
              behavior: HitTestBehavior.opaque,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child:   Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(active ? item.activeIcon : item.icon,
                    color: active ? ZarodaColors.navy : ZarodaColors.textSoft, size: 22),
                  const SizedBox(height: 3),
                  Text(item.label, style: GoogleFonts.inter(
                    fontSize: 10, fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: active ? ZarodaColors.navy : ZarodaColors.textSoft,
                  )),
                ]),
              ),
            ));
          }).toList()),
        ),
      ),
    );
  }
}

class _NavItem {
  final String   label, route;
  final IconData icon, activeIcon;
  const _NavItem(this.label, this.icon, this.activeIcon, this.route);
}

// Placeholder widgets — implemented in their own files in production:
class _TodaysTimetableCard       extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Timetable loading…'); }
class _PendingItemsCard          extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Pending items loading…'); }
class _FeePaymentCard            extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Fee balance loading…'); }
class _RecentActivityList        extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Recent activity loading…'); }
class _ApprovalsPreviewList      extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Approvals loading…'); }
class _IncidentsPreviewList      extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Recent incidents loading…'); }
class _AnnouncementComposer      extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Announcement composer…'); }
class _LearnerResultsPreview     extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Results loading…'); }
class _LibraryLoansCard          extends StatelessWidget { @override Widget build(BuildContext c) => const _PlaceholderCard('Library loans loading…'); }
class _AnnouncementsList extends StatelessWidget {
  final bool compact;
  const _AnnouncementsList({this.compact = false});
  @override Widget build(BuildContext c) => const _PlaceholderCard('Announcements loading…');
}

class _PlaceholderCard extends StatelessWidget {
  final String label;
  const _PlaceholderCard(this.label);
  @override
  Widget build(BuildContext context) => Container(
    margin:      const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    padding:     const EdgeInsets.all(16),
    decoration:  BoxDecoration(color: ZarodaColors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: ZarodaColors.border)),
    child:       Shimmer.fromColors(
      baseColor: ZarodaColors.border, highlightColor: ZarodaColors.muted,
      child:     Container(height: 16, width: double.infinity, decoration: BoxDecoration(color: ZarodaColors.border, borderRadius: BorderRadius.circular(6))),
    ),
  );
}

// These screens are declared for routing — implemented in their own feature files:
class SchemesScreen              extends StatelessWidget { const SchemesScreen();              @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Schemes of Work'), body: const _PlaceholderCard('Schemes…')); }
class ReportCardsScreen          extends StatelessWidget { const ReportCardsScreen();          @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Report Cards'),    body: const _PlaceholderCard('Report cards…')); }
class MessagesScreen             extends StatelessWidget { const MessagesScreen();             @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Messages'),         body: const _PlaceholderCard('Messages…')); }
class TeacherInviteScreen        extends StatelessWidget { const TeacherInviteScreen();        @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Share Invite'),     body: const _PlaceholderCard('Invite…')); }
class DisciplineScreen           extends StatelessWidget { const DisciplineScreen();           @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Discipline'),       body: const _PlaceholderCard('Discipline…')); }
class LearnersScreen             extends StatelessWidget { const LearnersScreen();             @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Learners'),         body: const _PlaceholderCard('Learners…')); }
class FinanceScreen              extends StatelessWidget { const FinanceScreen();              @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Finance'),          body: const _PlaceholderCard('Finance…')); }
class StaffScreen                extends StatelessWidget { const StaffScreen();                @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Staff'),            body: const _PlaceholderCard('Staff…')); }
class ApprovalsScreen            extends StatelessWidget { const ApprovalsScreen();            @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Approvals'),       body: const _PlaceholderCard('Approvals…')); }
class AnalyticsScreen            extends StatelessWidget { const AnalyticsScreen();            @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Analytics'),       body: const _PlaceholderCard('Analytics…')); }
class AnnouncementsScreen        extends StatelessWidget { const AnnouncementsScreen();        @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Announcements'),   body: const _PlaceholderCard('Announcements…')); }
class ResultsScreen              extends StatelessWidget { const ResultsScreen();              @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Results'),          body: const _PlaceholderCard('Results…')); }
class FeesScreen                 extends StatelessWidget { const FeesScreen();                 @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Fee Account'),     body: const _PlaceholderCard('Fees…')); }
class LearnerAttendanceScreen    extends StatelessWidget { const LearnerAttendanceScreen();    @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Attendance'),      body: const _PlaceholderCard('Attendance…')); }
class TimetableScreen            extends StatelessWidget { const TimetableScreen();            @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Timetable'),       body: const _PlaceholderCard('Timetable…')); }
class LibraryScreen              extends StatelessWidget { const LibraryScreen();              @override Widget build(BuildContext c) => Scaffold(appBar: ZarodaAppBar(title:'Library'),         body: const _PlaceholderCard('Library…')); }
