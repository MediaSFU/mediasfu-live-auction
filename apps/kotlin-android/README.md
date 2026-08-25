# Kotlin/Android live-auction app

`AuctionActivity` provides a Compose-owned auction interface over `MediaSfuEngine`. The app creates and joins rooms through the shared backend, requests native media permissions, produces MediaSFU audio and video, prioritizes screen content, renders participant identity when cameras are off, and keeps bidding state synchronized with the auction service.

The project resolves `com.mediasfu:mediasfu-sdk-android:1.0.5` from Maven Central and uses the SDK-compatible Kotlin 2.2 toolchain.

## Run on Android

Start the shared backend, launch an emulator, and run:

```powershell
.\gradlew.bat :app:installDebug
```

The emulator reaches the backend through `http://10.0.2.2:8791`. MediaSFU account credentials stay server-side and are never packaged in the APK.

See [platform support](../../docs/PLATFORM_PARITY.md) and [tested compatibility](../../docs/VALIDATION.md).
