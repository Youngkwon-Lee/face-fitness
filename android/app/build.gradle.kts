import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Play upload key, kept outside the repository (for example in ~/.gradle/gradle.properties).
// Without all four properties the release bundle stays unsigned.
val uploadStoreFile = providers.gradleProperty("FACE_FITNESS_UPLOAD_STORE_FILE").orNull
val uploadStorePassword = providers.gradleProperty("FACE_FITNESS_UPLOAD_STORE_PASSWORD").orNull
val uploadKeyAlias = providers.gradleProperty("FACE_FITNESS_UPLOAD_KEY_ALIAS").orNull
val uploadKeyPassword = providers.gradleProperty("FACE_FITNESS_UPLOAD_KEY_PASSWORD").orNull
val hasUploadKey = listOf(uploadStoreFile, uploadStorePassword, uploadKeyAlias, uploadKeyPassword).all { !it.isNullOrBlank() }

android {
    namespace = "kr.co.kinelo.facefitness"
    compileSdk = 36

    defaultConfig {
        // Same identifier as the iOS bundle. Permanent once published on Play.
        applicationId = "kr.co.kinelo.facefitness"
        minSdk = 28
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (hasUploadKey) {
            create("upload") {
                storeFile = file(uploadStoreFile!!)
                storePassword = uploadStorePassword
                keyAlias = uploadKeyAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (hasUploadKey) signingConfig = signingConfigs.getByName("upload")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // The bundled face model must stay uncompressed so MediaPipe can map it.
    androidResources { noCompress += "task" }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions { unitTests.isReturnDefaultValues = true }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.12.01")
    implementation(composeBom)
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material:material-icons-core:1.7.8")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.activity:activity-compose:1.12.4")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")

    val camerax = "1.5.2"
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.camera:camera-view:$camerax")

    implementation("com.google.mediapipe:tasks-vision:0.10.33")

    debugImplementation("androidx.compose.ui:ui-tooling")

    testImplementation("junit:junit:4.13.2")
    // android.jar only stubs org.json; JVM tests need the real implementation.
    testImplementation("org.json:json:20250517")
}

tasks.withType<Test>().configureEach {
    testLogging { events("passed", "skipped", "failed") }
}
