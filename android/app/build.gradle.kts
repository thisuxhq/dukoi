plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
}

android {
  namespace = "com.thisux.droidhost"
  compileSdk = 37
  defaultConfig {
    applicationId = "com.thisux.droidhost"
    minSdk = 29
    targetSdk = 37
    versionCode = 1
    versionName = "0.1.0"
    // Phase 1 is arm64 only. The bundled Node binary is arm64.
    ndk { abiFilters += "arm64-v8a" }
  }

  buildTypes {
    release {
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
