pluginManagement {
  repositories {
    gradlePluginPortal()
    mavenCentral()
    google()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    mavenCentral()
    google()
  }
}

rootProject.name = "rock-android-attestation-verifier"
includeBuild("vendor/keyattestation") {
  dependencySubstitution {
    substitute(module("com.android.keyattestation:keyattestation")).using(project(":"))
  }
}
