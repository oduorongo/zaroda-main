// ============================================================
// ZARODA SMS MOBILE — Services Layer
// lib/core/services/api_service.dart
// lib/core/services/auth_service.dart
// lib/core/services/notification_service.dart
// lib/core/services/offline_service.dart
// ============================================================

// ── lib/core/services/api_service.dart ───────────────────────
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final apiServiceProvider = Provider<ApiService>((ref) => ApiService());

class ApiService {
  late final Dio _dio;
  final _storage = const FlutterSecureStorage();

  ApiService() {
    _dio = Dio(BaseOptions(
      baseUrl:        AppConstants.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers:        {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.addAll([
      _AuthInterceptor(_storage, _dio),
      _LoggingInterceptor(),
    ]);
  }

  // ── GET ──────────────────────────────────────────────────
  Future<T> get<T>(String path, {
    Map<String, dynamic>? params,
    T Function(dynamic)? fromJson,
  }) async {
    final res = await _dio.get(path, queryParameters: params);
    return fromJson != null ? fromJson(res.data) : res.data as T;
  }

  // ── POST ─────────────────────────────────────────────────
  Future<T> post<T>(String path, {
    dynamic body,
    T Function(dynamic)? fromJson,
  }) async {
    final res = await _dio.post(path, data: body);
    return fromJson != null ? fromJson(res.data) : res.data as T;
  }

  // ── PATCH ────────────────────────────────────────────────
  Future<T> patch<T>(String path, {
    dynamic body,
    T Function(dynamic)? fromJson,
  }) async {
    final res = await _dio.patch(path, data: body);
    return fromJson != null ? fromJson(res.data) : res.data as T;
  }

  // ── Download PDF ─────────────────────────────────────────
  Future<List<int>> downloadPdf(String path) async {
    final res = await _dio.get<List<int>>(
      path,
      options: Options(responseType: ResponseType.bytes),
    );
    return res.data!;
  }
}

// Auto-inject Bearer token + refresh on 401
class _AuthInterceptor extends Interceptor {
  final FlutterSecureStorage _storage;
  final Dio                  _dio;
  _AuthInterceptor(this._storage, this._dio);

  @override
  Future<void> onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final token = await _storage.read(key: AppConstants.kAccessToken);
    if (token != null) options.headers['Authorization'] = 'Bearer $token';
    handler.next(options);
  }

  @override
  Future<void> onError(DioException err, ErrorInterceptorHandler handler) async {
    if (err.response?.statusCode == 401) {
      try {
        final refreshToken = await _storage.read(key: AppConstants.kRefreshToken);
        if (refreshToken == null) { handler.next(err); return; }

        final res = await _dio.post('/auth/refresh', data: {'refreshToken': refreshToken});
        final newToken = res.data['accessToken'];
        await _storage.write(key: AppConstants.kAccessToken, value: newToken);

        // Retry original request
        err.requestOptions.headers['Authorization'] = 'Bearer $newToken';
        final retried = await _dio.fetch(err.requestOptions);
        handler.resolve(retried);
      } catch (_) {
        handler.next(err);
      }
    } else {
      handler.next(err);
    }
  }
}

class _LoggingInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    debugPrint('❌ API Error ${err.response?.statusCode}: ${err.requestOptions.path}');
    handler.next(err);
  }
}


// ── lib/core/services/auth_service.dart ──────────────────────
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dart:convert';

final authServiceProvider = Provider<AuthService>((ref) => AuthService(ref.read(apiServiceProvider)));
final currentUserProvider = StateNotifierProvider<CurrentUserNotifier, AppUser?>((ref) {
  return CurrentUserNotifier(ref.read(authServiceProvider));
});

class AppUser {
  final String id;
  final String tenantId;
  final String schoolId;
  final String firstName;
  final String lastName;
  final String email;
  final String role;
  final String? streamId;
  final String? streamName;

  const AppUser({
    required this.id,        required this.tenantId,   required this.schoolId,
    required this.firstName, required this.lastName,   required this.email,
    required this.role,      this.streamId,            this.streamName,
  });

  String get fullName => '$firstName $lastName';
  bool get isTeacher  => ['class_teacher','subject_teacher','overall_class_teacher'].contains(role);
  bool get isHoi      => ['hoi','dhois','school_admin','tenant_owner','bursar'].contains(role);
  bool get isParent   => role == 'parent';
  bool get isLearner  => role == 'learner';

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
    id:         j['id'],         tenantId:  j['tenantId'],  schoolId:  j['schoolId'],
    firstName:  j['firstName'],  lastName:  j['lastName'],  email:     j['email'],
    role:       j['role'],       streamId:  j['streamId'],  streamName:j['streamName'],
  );

  Map<String, dynamic> toJson() => {
    'id': id, 'tenantId': tenantId, 'schoolId': schoolId,
    'firstName': firstName, 'lastName': lastName, 'email': email,
    'role': role, 'streamId': streamId, 'streamName': streamName,
  };
}

class CurrentUserNotifier extends StateNotifier<AppUser?> {
  final AuthService _auth;
  CurrentUserNotifier(this._auth) : super(null) { _tryAutoLogin(); }

  Future<void> _tryAutoLogin() async {
    final user = await _auth.getCachedUser();
    if (user != null) state = user;
  }

  Future<bool> login(String email, String password) async {
    final user = await _auth.login(email, password);
    if (user != null) { state = user; return true; }
    return false;
  }

  Future<void> logout() async {
    await _auth.logout();
    state = null;
  }
}

class AuthService {
  final ApiService        _api;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  AuthService(this._api);

  Future<AppUser?> login(String email, String password) async {
    try {
      final res = await _api.post<Map<String, dynamic>>('/auth/login', body: {
        'email': email, 'password': password,
      });
      await _storage.write(key: AppConstants.kAccessToken,  value: res['accessToken']);
      await _storage.write(key: AppConstants.kRefreshToken, value: res['refreshToken']);
      final user = AppUser.fromJson(res['user']);
      await _storage.write(key: AppConstants.kUserProfile,  value: jsonEncode(user.toJson()));
      return user;
    } catch (_) { return null; }
  }

  Future<AppUser?> getCachedUser() async {
    final json = await _storage.read(key: AppConstants.kUserProfile);
    if (json == null) return null;
    return AppUser.fromJson(jsonDecode(json));
  }

  Future<void> logout() async {
    await _storage.deleteAll();
  }
}


// ── lib/core/services/notification_service.dart ──────────────
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final _fcm   = FirebaseMessaging.instance;
  static final _local = FlutterLocalNotificationsPlugin();

  static Future<void> init(ApiService api, String userId) async {
    await _fcm.requestPermission(alert: true, badge: true, sound: true);

    // Android + iOS channel setup
    const androidChannel = AndroidNotificationChannel(
      'zaroda_high', 'ZARODA Notifications',
      description: 'School alerts, fee reminders, and announcements',
      importance:  Importance.max,
    );
    await _local.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>()?.createNotificationChannel(androidChannel);

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS:     DarwinInitializationSettings(),
      ),
    );

    // Register FCM token with backend
    final token = await _fcm.getToken();
    if (token != null) {
      await api.post('/notifications/register-device', body: {
        'userId': userId, 'fcmToken': token, 'platform': Platform.isAndroid ? 'android' : 'ios',
      });
    }

    // Handle foreground messages
    FirebaseMessaging.onMessage.listen((msg) {
      final n = msg.notification;
      if (n != null) _showLocal(n.title ?? 'ZARODA', n.body ?? '', msg.data);
    });

    // Token refresh
    _fcm.onTokenRefresh.listen((newToken) async {
      await api.post('/notifications/register-device', body: {
        'userId': userId, 'fcmToken': newToken, 'platform': Platform.isAndroid ? 'android' : 'ios',
      });
    });
  }

  static Future<void> _showLocal(String title, String body, Map<String, dynamic> data) async {
    await _local.show(
      DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title, body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          'zaroda_high', 'ZARODA Notifications',
          importance:     Importance.max,
          priority:       Priority.high,
          icon:           '@mipmap/ic_launcher',
          color:          const Color(0xFF1A2E5A),
          styleInformation: BigTextStyleInformation(body),
        ),
        iOS: const DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
      ),
    );
  }
}
