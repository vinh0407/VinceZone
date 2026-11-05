# VinceZone Android App

Native Android app for VinceZone AI - ChatGPT style interface with kilo-auto/free model.

## Features

- ChatGPT-style UI with black background, white text, gray accents
- kilo-auto/free model via Kilo Gateway
- Real-time streaming responses
- Chat history with local Room database
- Attach files/images (UI ready)
- Settings: Server URL, API Key, Model, Temperature, Max Tokens
- Dark mode only (modern black theme)
- VinceZone logo and branding

## Building

### Prerequisites
- Android Studio Koala (2024.1.1) or later
- JDK 17+
- Android SDK 34
- Gradle 8.4+

### Build Commands

```bash
# Debug build
./gradlew assembleDebug

# Release build (signed)
./gradlew assembleRelease

# Install debug on connected device
./gradlew installDebug
```

### Output
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
- Release APK: `app/build/outputs/apk/release/app-release.apk`
- Release AAB: `app/build/outputs/bundle/release/app-release.aab`

## Configuration

### Server URL
Default: `http://10.0.2.2:3300` (emulator) or `http://<your-ip>:3300` (device)
Change in Settings screen.

### API Key
Enter your Kilo Gateway API key in Settings to enable AI responses.

### Model
Default: `kilo-auto/free` (free tier, fast responses)

## Architecture

- **MVVM** with Repository pattern
- **Room** for local chat history
- **OkHttp** + **Gson** for networking
- **Coroutines** + **Flow** for async
- **Material3** components with custom VinceZone theme

## Project Structure

```
app/
├── src/main/
│   ├── java/com/vincezone/app/
│   │   ├── adapter/        # RecyclerView adapters
│   │   ├── data/           # Room database (entities, DAO, database)
│   │   ├── network/        # OkHttp client, API models
│   │   ├── ui/             # Activities, adapters
│   │   ├── utils/          # Preferences, helpers
│   │   ├── VinceZoneApplication.kt
│   │   └── MainActivity.kt
│   ├── res/
│   │   ├── layout/         # XML layouts
│   │   ├── drawable/       # Vector icons, shapes
│   │   ├── values/         # Colors, strings, themes
│   │   ├── xml/            # Backup rules, file paths
│   │   └── mipmap/         # App icons
│   └── AndroidManifest.xml
└── build.gradle.kts
```

## Signing Release Build

1. Create keystore:
```bash
keytool -genkey -v -keystore vincezone-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias vincezone
```

2. Add to `local.properties`:
```properties
KEYSTORE_PASSWORD=your_keystore_password
KEY_PASSWORD=your_key_password
```

3. Build release:
```bash
./gradlew assembleRelease
```

## Icons

App icon: VinceZone "V" origami logo (white on black)
- `mipmap-hdpi/ic_launcher.png` (72x72)
- `mipmap-mdpi/ic_launcher.png` (48x48)
- `mipmap-xhdpi/ic_launcher.png` (96x96)
- `mipmap-xxhdpi/ic_launcher.png` (144x144)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192)
- `mipmap-xxxhdpi/ic_launcher_round.png` (192x192)

## API Endpoints

The app connects to VinceZone Gateway:
- `POST /v1/chat/completions` - Streaming chat completions
- `GET /v1/models` - List available models
- `POST /api/projects/:id/terminal` - Terminal commands (desktop only)

Default model: `kilo-auto/free` via Kilo Gateway

## License

MIT License - See LICENSE file for details.