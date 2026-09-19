plugins {
    id("com.android.application")
}

android {
    namespace = "com.wakz.status"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "com.wakz.status"
        minSdk = 24
        targetSdk = 36
        versionCode = 5
        versionName = "1.4.0"
        resourceConfigurations += listOf("ar", "en")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // No third-party dependencies: the interface is the bundled web build.
}
