plugins {
  kotlin("jvm") version "2.2.0"
  application
}

dependencies {
  implementation("com.android.keyattestation:keyattestation:0.1-SNAPSHOT")
  implementation("com.google.code.gson:gson:2.11.0")
  implementation("com.google.protobuf:protobuf-javalite:4.28.3")
  testImplementation(kotlin("test"))
}

kotlin {
  jvmToolchain(21)
}

application {
  mainClass.set("dev.rock.attestation.MainKt")
}

tasks.test {
  useJUnitPlatform()
}
