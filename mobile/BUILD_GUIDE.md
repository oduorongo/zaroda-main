# ============================================================
# ZARODA SMS MOBILE — Build Guide
# Four app flavors from one codebase
# ============================================================

# ─────────────────────────────────────────────────────────────
# FLAVOR BUILD COMMANDS
# ─────────────────────────────────────────────────────────────

# Teacher App
# flutter run  --target lib/main_teacher.dart --flavor teacher
# flutter build apk  --target lib/main_teacher.dart --flavor teacher --release
# flutter build ipa  --target lib/main_teacher.dart --flavor teacher --release

# HOI / Admin App
# flutter run  --target lib/main_hoi.dart --flavor hoi
# flutter build apk  --target lib/main_hoi.dart --flavor hoi --release
# flutter build ipa  --target lib/main_hoi.dart --flavor hoi --release

# Parent App
# flutter run  --target lib/main_parent.dart --flavor parent
# flutter build apk  --target lib/main_parent.dart --flavor parent --release
# flutter build ipa  --target lib/main_parent.dart --flavor parent --release

# Learner App
# flutter run  --target lib/main_learner.dart --flavor learner
# flutter build apk  --target lib/main_learner.dart --flavor learner --release
# flutter build ipa  --target lib/main_learner.dart --flavor learner --release

---

# ─────────────────────────────────────────────────────────────
# android/app/build.gradle — Flavor configuration
# ─────────────────────────────────────────────────────────────
android_build_gradle: |
  android {
      flavorDimensions "app"

      productFlavors {
          teacher {
              dimension        "app"
              applicationId    "app.zarodasolutions.teacher"
              resValue         "string", "app_name", "ZARODA Teacher"
          }
          hoi {
              dimension        "app"
              applicationId    "app.zarodasolutions.admin"
              resValue         "string", "app_name", "ZARODA Admin"
          }
          parent {
              dimension        "app"
              applicationId    "app.zarodasolutions.parent"
              resValue         "string", "app_name", "ZARODA Parent"
          }
          learner {
              dimension        "app"
              applicationId    "app.zarodasolutions.learner"
              resValue         "string", "app_name", "ZARODA Learner"
          }
      }

      buildTypes {
          release {
              signingConfig    signingConfigs.release
              minifyEnabled    true
              shrinkResources  true
          }
      }
  }

---

# ─────────────────────────────────────────────────────────────
# ios/Runner.xcodeproj — Scheme configuration
# ─────────────────────────────────────────────────────────────
# Four Xcode schemes, one per flavor:
#   ZarodaTeacher  → Bundle ID: app.zarodasolutions.teacher
#   ZarodaAdmin    → Bundle ID: app.zarodasolutions.admin
#   ZarodaParent   → Bundle ID: app.zarodasolutions.parent
#   ZarodaLearner  → Bundle ID: app.zarodasolutions.learner
#
# Each scheme has its own GoogleService-Info.plist
# (different FCM sender IDs per app for notification routing)

---

# ─────────────────────────────────────────────────────────────
# PROJECT STRUCTURE
# ─────────────────────────────────────────────────────────────
structure: |
  zaroda-sms/mobile/
  ├── pubspec.yaml                        # All dependencies
  ├── lib/
  │   ├── main_teacher.dart               # Teacher app entry point
  │   ├── main_hoi.dart                   # HOI/Admin app entry point
  │   ├── main_parent.dart                # Parent app entry point
  │   ├── main_learner.dart               # Learner app entry point
  │   │
  │   ├── core/
  │   │   ├── zaroda_core.dart            # Theme · Colors · FlavorConfig
  │   │   ├── services.dart               # ApiService · AuthService · NotificationService
  │   │   └── router/
  │   │       └── app_router.dart         # GoRouter configuration per flavor
  │   │
  │   ├── shared/
  │   │   └── zaroda_widgets.dart         # ZarodaAppBar · ZarodaBrand · ZarodaStatCard
  │   │                                   # CbcLevelBadge · ZarodaEmptyState · ZarodaShimmer
  │   │
  │   └── features/
  │       ├── app_features.dart           # All screens (auth + 4 role homes + attendance)
  │       ├── auth/                       # LoginScreen (shared)
  │       ├── teacher/                    # Schemes · Attendance · Invite · Report Cards
  │       ├── hoi/                        # Dashboard · Finance · Staff · Approvals
  │       ├── parent/                     # Child results · Fees · M-Pesa · Messages
  │       └── learner/                    # Timetable · Results · Library · Announcements
  │
  ├── android/
  │   └── app/build.gradle               # 4 product flavors
  ├── ios/
  │   └── Runner.xcodeproj               # 4 Xcode schemes
  └── assets/
      ├── images/zaroda_logo.png
      ├── images/zaroda_sports_logo.png
      └── icons/

---

# ─────────────────────────────────────────────────────────────
# SCREENS PER APP
# ─────────────────────────────────────────────────────────────

TEACHER APP (6 bottom nav items):
  Home          - Greeting · today's lessons · quick actions · pending items
  Attendance    - Mark P/A/L/E per learner · bulk save · summary bar
  Schemes       - AI-generated SOW list · generate new · PDF download
  Report Cards  - Learner list · enter CBC levels · generate PDF
  Messages      - Parent-teacher thread per learner
  [+ Discipline, Invite accessible from Home quick actions]

HOI / ADMIN APP (5 bottom nav items):
  Dashboard     - KPI grid · pending approvals · recent incidents · send announcement
  Learners      - Search · per-learner profile · attendance · fee account
  Finance       - Income summary · outstanding · M-Pesa STK push · payroll
  Approvals     - Scheme approval queue · discipline actions · professional records
  Announcements - Compose · audience targeting · SMS/push/email send

PARENT APP (4 bottom nav items):
  Home          - Child card · balance · attendance % · message count
  Results       - CBC performance levels per subject · term selector
  Fees          - Invoice view · payment history · M-Pesa pay button
  Messages      - Direct thread with class teacher

LEARNER APP (4 bottom nav items):
  Home          - Today's timetable · recent results · library · notices
  Timetable     - Full week view · current lesson highlighted
  Results       - Per-subject CBC levels across terms
  Library       - My borrowed books · due dates · search catalogue

---

# ─────────────────────────────────────────────────────────────
# API INTEGRATION NOTES
# ─────────────────────────────────────────────────────────────

# Base URL: https://api.zarodasolutions.app/api/v1
# Auth: JWT Bearer (auto-refresh via interceptor)
# All existing NestJS endpoints from modules 01–09 are used directly.
# No new backend work needed for the mobile apps.

# Key mobile-specific endpoints:
# POST /auth/login              → returns accessToken + refreshToken + user
# POST /notifications/register-device → FCM token registration
# GET  /attendance/learners/:streamId  → learners for attendance
# POST /attendance/bulk                → bulk attendance save
# GET  /pdf/report-card/:id            → binary PDF download
# GET  /pdf/invoice/:id                → binary PDF download
