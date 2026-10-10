import java.util.Properties

plugins {
    id("com.android.application")
}

// The Play upload key lives OUTSIDE the repo (~/.android-keys, see README).
// Without it the release build is simply unsigned.
val uploadKey = Properties().apply {
    val path = System.getenv("FIELDDAY_UPLOAD_KEY_PROPERTIES")
        ?: "${System.getProperty("user.home")}/.android-keys/fieldday-scoreboard-upload.properties"
    val f = file(path)
    if (f.exists()) f.inputStream().use { load(it) }
}

android {
    namespace = "ca.fielddayapp.scoreboard"
    compileSdk = 36

    defaultConfig {
        applicationId = "ca.fielddayapp.scoreboard"
        minSdk = 24
        targetSdk = 36
        // Bump versionCode for every upload to Play; versionName is what people see.
        versionCode = 1
        versionName = "1.0"
    }

    signingConfigs {
        if (uploadKey.isNotEmpty()) {
            create("upload") {
                storeFile = file(uploadKey.getProperty("storeFile"))
                storePassword = uploadKey.getProperty("storePassword")
                keyAlias = uploadKey.getProperty("keyAlias")
                keyPassword = uploadKey.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            if (uploadKey.isNotEmpty()) signingConfig = signingConfigs.getByName("upload")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // Trusted Web Activity launcher: opens the web scoreboard full-screen in
    // the user's browser engine, verified against /.well-known/assetlinks.json.
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
