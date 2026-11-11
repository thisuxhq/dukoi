plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
}

// The version lives in shared/src/version.ts, so the app, agent and CLI always match.
val dukoiVersion: String =
  Regex("DUKOI_VERSION = '([0-9]+\\.[0-9]+\\.[0-9]+)'")
    .find(rootDir.resolve("../shared/src/version.ts").readText())
    ?.groupValues?.get(1)
    ?: error("Couldn't read DUKOI_VERSION from shared/src/version.ts")

// 1.2.3 becomes 10203, so every release installs over the last one.
val dukoiVersionCode: Int =
  dukoiVersion.split(".").map(String::toInt).let { (major, minor, patch) -> major * 10000 + minor * 100 + patch }

// Release builds are signed with the release key, given by scripts/release.sh.
// See docs/releasing.md. Without it, assembleRelease makes an unsigned APK.
val releaseKeystore: String? = System.getenv("DUKOI_KEYSTORE")

android {
  namespace = "com.thisux.dukoi"
  compileSdk = 37
  defaultConfig {
    applicationId = "com.thisux.dukoi"
    minSdk = 29
    targetSdk = 37
    versionCode = dukoiVersionCode
    versionName = dukoiVersion
    // Phase 1 is arm64 only. The bundled Node binary is arm64.
    ndk { abiFilters += "arm64-v8a" }
  }

  signingConfigs {
    if (releaseKeystore != null) {
      create("release") {
        storeFile = file(releaseKeystore)
        storePassword = System.getenv("DUKOI_KEYSTORE_PASSWORD")
        keyAlias = System.getenv("DUKOI_KEY_ALIAS") ?: "dukoi"
        keyPassword = System.getenv("DUKOI_KEY_PASSWORD") ?: System.getenv("DUKOI_KEYSTORE_PASSWORD")
      }
    }
  }

  buildTypes {
    release {
      if (releaseKeystore != null) signingConfig = signingConfigs.getByName("release")
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    aidl = false
    buildConfig = false
    shaders = false
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
    // Same as extractNativeLibs="true": Android unpacks lib*.so files into
    // nativeLibraryDir, the one place Android 10+ lets an app run a binary from.
    jniLibs { useLegacyPackaging = true }
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)

  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.activity.compose)

  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Draws the illustrations and Hugeicons straight from their SVG files.
  implementation(libs.androidsvg)
  // Opens app links in an in-app browser tab.
  implementation(libs.androidx.browser)
  debugImplementation(libs.androidx.compose.ui.tooling)
}
