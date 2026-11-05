# VinceZone ProGuard Rules

# Keep model classes for Gson serialization
-keepclassmembers class com.vincezone.app.** {
    <fields>;
}

# Keep Room entities
-keep class com.vincezone.app.data.** { *; }

# Keep PreferencesManager
-keep class com.vincezone.app.utils.PreferencesManager { *; }

# Keep network client
-keep class com.vincezone.app.network.** { *; }

# Keep Room database
-keep class com.vincezone.app.data.ChatDatabase { *; }
-keep class com.vincezone.app.data.ChatDao { *; }
-keep class com.vincezone.app.data.ChatEntity { *; }

# Keep adapter
-keep class com.vincezone.app.adapter.** { *; }

# Keep MainActivity
-keep class com.vincezone.app.MainActivity { *; }

# Keep VinceZoneApplication
-keep class com.vincezone.app.VinceZoneApplication { *; }

# OkHttp
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

# Okio
-keep class okio.** { *; }
-dontwarn okio.**

# Gson
-keep class com.google.gson.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Room
-keep class androidx.room.** { *; }

# Coroutines
-keep class kotlinx.coroutines.** { *; }

# Glide
-keep class com.bumptech.glide.** { *; }
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep public class * extends com.bumptech.glide.module.AppGlideModule
-keep public enum com.bumptech.glide.load.resource.bitmap.ImageHeaderParser$** {
    **[] $VALUES;
    public *;
}

# OkHttp3 logging interceptor (if used)
-dontwarn okhttp3.logging.HttpLoggingInterceptor

# Kotlin
-keep class kotlin.** { *; }

# Coroutines debug
-dontwarn kotlinx.coroutines.debug.**

# Okio
-dontwarn okio.**

# Suppress warnings for internal APIs
-dontwarn java.nio.file.**
-dontwarn java.lang.invoke.**

# Keep names of classes implementing Parcelable
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}