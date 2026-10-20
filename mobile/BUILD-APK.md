# NovaPlay APK kaise banaye (Build guide)

Is repo ke `main` branch se, kisi bhi naye session ya computer me, bilkul wahi
APK banta hai jo players ko diya jata hai.

## Ek command

```bash
bash mobile/scripts/build-apk.sh
```

APK yahan milega: `mobile/apk-output/NovaPlay-<version>.apk`

Pehli baar Android SDK download hoga, isliye 10-20 minute lag sakte hain.
Uske baad build 3-5 minute me ho jata hai.

## Kya chahiye

| Cheez | Version |
|---|---|
| Node.js | 22 (npm 10) |
| Java (JDK) | 17 ya naya (21 pe test kiya) |
| Android SDK | script khud install karta hai: platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1 |
| Internet | npm, Google Maven aur Gradle ke liye |

Android SDK pehle se hai to `ANDROID_HOME` set kar do. Script usi ko use karega.

## Build kaise hota hai

1. `npm ci`: `package-lock.json` ke exact versions install hote hain.
2. `mobile/android/` project (repo me hi hai) se Gradle `assembleRelease`
   chalta hai:
   - **Phone type:** sirf `arm64-v8a`, jo saare naye phones hain.
   - **Size chhota:** minify aur shrink resources on.
   - **Maven mirror:** `scripts/maven-mirror.gradle` se Maven Central ki jagah
     Google ka mirror use hota hai, taaki rate-limit se build na tute.
3. **Purana JS bundle hataya jata hai:** har build pe naya banta hai, warna
   sirf icon/image badalne pe purana dikh sakta hai.

## Naya version banane se pehle

Teen jagah version badhao, teeno ek jaise hone chahiye:

- `mobile/app.json` → `expo.version` (jaise `1.0.22`) aur `expo.android.versionCode` (jaise `23`)
- `mobile/android/app/build.gradle` → `versionCode 23` aur `versionName "1.0.22"`

`versionCode` hamesha pichhle se bada hona chahiye, warna phone update nahi lega.

## Signing key (zaroori baat)

Abhi APK React Native ki standard **debug key** se sign hota hai
(`mobile/android/app/debug.keystore`, SHA1 `5E:8F:16:06:…:F6:25`).
Isi wajah se kisi bhi session me bana APK purane app ke upar seedha update
ho jata hai.

Ye key public hai, yaani koi bhi isse "NovaPlay" naam ka APK sign kar sakta
hai. Play Store ya bade public launch se pehle ek apni private release key
banani hogi. Wo key is public repo me kabhi nahi rakhni. Key badalne ke baad
players ko ek baar purana app hata ke naya install karna padega.

## `expo prebuild` mat chalana

`mobile/android/` folder hi build ka source hai. `npx expo prebuild --clean`
chalane se ye folder dobara ban jata hai aur version, signing ya settings
badal sakte hain. Native setting badalni ho to seedha `mobile/android/` me
badlo aur commit karo.
