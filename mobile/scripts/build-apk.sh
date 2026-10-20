#!/usr/bin/env bash
# Builds the NovaPlay release APK exactly the way the published APKs are built
# (see mobile/BUILD-APK.md). Run from anywhere:
#
#   bash mobile/scripts/build-apk.sh
#
# Needs Node 22 + npm and Java 17 or newer. The Android SDK is installed into
# $ANDROID_HOME (default ~/android-sdk) the first time and reused after that.
# The APK lands in mobile/apk-output/NovaPlay-<version>.apk.
set -euo pipefail

MOBILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
# The exact SDK pieces the project builds against (android/build.gradle).
PACKAGES=("platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1")

# 1. Android SDK, installed once.
if [ ! -x "$SDKMANAGER" ]; then
  echo "==> Installing the Android command-line tools into $SDK"
  mkdir -p "$SDK/cmdline-tools"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/clt.zip" https://dl.google.com/android/repository/commandlinetools-linux-14742923_latest.zip
  unzip -q "$tmp/clt.zip" -d "$tmp"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -rf "$tmp"
fi
echo "==> Android SDK packages"
yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
"$SDKMANAGER" --sdk_root="$SDK" "${PACKAGES[@]}" >/dev/null

# 2. JavaScript dependencies, exactly as locked in package-lock.json.
echo "==> npm ci"
cd "$MOBILE"
npm ci --no-audit --no-fund

# 3. The release build. The JS bundle and its images are always regenerated:
#    a stale copy would otherwise ship old icons after an asset-only change.
echo "==> Gradle release build"
rm -rf android/app/build/generated/assets/react android/app/build/generated/res/react
cd android
ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK" NODE_ENV=production ./gradlew assembleRelease \
  --init-script "$MOBILE/scripts/maven-mirror.gradle" \
  -PreactNativeArchitectures=arm64-v8a \
  -Pandroid.enableMinifyInReleaseBuilds=true \
  -Pandroid.enableShrinkResourcesInReleaseBuilds=true \
  --no-daemon -q

# 4. Copy it out under its version name.
VERSION="$(node -p "require('$MOBILE/app.json').expo.version")"
mkdir -p "$MOBILE/apk-output"
OUT="$MOBILE/apk-output/NovaPlay-$VERSION.apk"
cp app/build/outputs/apk/release/app-release.apk "$OUT"
echo "==> Built $OUT"
"$SDK/build-tools/36.0.0/aapt" dump badging "$OUT" | head -1
