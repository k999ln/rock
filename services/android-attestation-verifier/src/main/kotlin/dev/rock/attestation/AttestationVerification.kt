package dev.rock.attestation

import com.android.keyattestation.verifier.AttestationApplicationId
import com.android.keyattestation.verifier.AttestationApplicationIdConstraint
import com.android.keyattestation.verifier.AttestationPackageInfo
import com.android.keyattestation.verifier.ConstraintConfig
import com.android.keyattestation.verifier.GoogleTrustAnchors
import com.android.keyattestation.verifier.InstantSource
import com.android.keyattestation.verifier.SecurityLevel
import com.android.keyattestation.verifier.SecurityLevelConstraint
import com.android.keyattestation.verifier.VerificationResult
import com.android.keyattestation.verifier.VerifiedBootState
import com.android.keyattestation.verifier.Verifier
import com.android.keyattestation.verifier.challengecheckers.ChallengeMatcher
import com.google.gson.JsonParser
import com.google.protobuf.ByteString
import java.io.ByteArrayInputStream
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateFactory
import java.security.interfaces.ECPublicKey
import java.time.Instant
import java.util.Base64
import java.util.Locale
import java.util.concurrent.Semaphore

private const val UPSTREAM_COMMIT = "55c35040a1b5b72e6d63bfb150c5c68a175c1462"
private const val MAX_CHAIN_BYTES = 192 * 1024
private const val MAX_CERTIFICATES = 12
private const val MAX_REVOCATION_BYTES = 2 * 1024 * 1024

data class AttestedApplicationPolicy(
  val packageName: String,
  val minimumVersion: BigInteger,
  val signingCertificateSha256: ByteArray,
)

data class VerifyRequest(
  val challengeId: String,
  val challenge: ByteArray,
  val packageName: String,
  val certificateChain: List<ByteArray>,
)

data class VerifyResponse(
  val schema: String = "rock-android-key-attestation-result/1",
  val challengeId: String,
  val challengeSha256: String,
  val publicKeyRawP256Base64Url: String,
  val publicKeySha256: String,
  val securityLevel: String,
  val verifiedBootState: String,
  val deviceLocked: Boolean,
  val applicationPackage: String,
  val minimumApplicationVersion: String,
  val signingCertificateSha256: String,
  val verifiedAt: Long,
  val verifierCommit: String = UPSTREAM_COMMIT,
)

class AttestationRejected(message: String) : RuntimeException(message)

class AttestationVerificationUnavailable(cause: Throwable) : RuntimeException(cause)

class AttestationVerificationService(
  private val applications: Map<String, AttestedApplicationPolicy>,
  private val clock: () -> Instant = Instant::now,
  private val revokedSerials: () -> Set<String> = ::fetchGoogleRevocationStatus,
  private val verificationSlots: Semaphore = Semaphore(4),
) {
  init {
    require(applications.isNotEmpty()) { "at least one pinned Android application is required" }
  }

  fun verify(request: VerifyRequest): VerifyResponse {
    validate(request)
    val policy = applications[request.packageName]
      ?: throw AttestationRejected("APPLICATION_NOT_ALLOWED")
    if (!verificationSlots.tryAcquire()) throw AttestationVerificationUnavailable(
      IllegalStateException("verification capacity reached"),
    )
    try {
      val expectedApplication = AttestationApplicationId(
        packages = setOf(AttestationPackageInfo(policy.packageName, policy.minimumVersion)),
        signatures = setOf(ByteString.copyFrom(policy.signingCertificateSha256)),
      )
      val verifier = Verifier(
        GoogleTrustAnchors,
        revokedSerials,
        InstantSource { clock() },
        expectedApplication,
        ConstraintConfig(
          attestationApplicationId = AttestationApplicationIdConstraint.STRICT,
          securityLevel = SecurityLevelConstraint.NOT_SOFTWARE,
        ),
      )
      val result = verifier.verify(
        request.certificateChain.map(::parseCertificate),
        ChallengeMatcher(request.challenge),
      )
      if (result !is VerificationResult.Success) throw AttestationRejected("ATTESTATION_REJECTED")
      if (result.securityLevel !in setOf(SecurityLevel.TRUSTED_ENVIRONMENT, SecurityLevel.STRONG_BOX) ||
          !result.deviceLocked || result.verifiedBootState != VerifiedBootState.VERIFIED)
        throw AttestationRejected("DEVICE_SECURITY_STATE_REJECTED")
      val rawKey = rawP256Point(result.publicKey as? ECPublicKey
        ?: throw AttestationRejected("DEVICE_KEY_ALGORITHM_REJECTED"))
      val digest = sha256(rawKey)
      return VerifyResponse(
        challengeId = request.challengeId,
        challengeSha256 = hex(sha256(request.challenge)),
        publicKeyRawP256Base64Url = Base64.getUrlEncoder().withoutPadding().encodeToString(rawKey),
        publicKeySha256 = hex(digest),
        securityLevel = result.securityLevel.name,
        verifiedBootState = result.verifiedBootState.name,
        deviceLocked = result.deviceLocked,
        applicationPackage = policy.packageName,
        minimumApplicationVersion = policy.minimumVersion.toString(),
        signingCertificateSha256 = hex(policy.signingCertificateSha256),
        verifiedAt = clock().toEpochMilli(),
      )
    } catch (rejected: AttestationRejected) {
      throw rejected
    } catch (failure: Exception) {
      // This includes a missing/unavailable/rejected CRL; never downgrade to cached or local trust.
      throw AttestationVerificationUnavailable(failure)
    } finally {
      verificationSlots.release()
    }
  }

  private fun validate(request: VerifyRequest) {
    if (!request.challengeId.matches(Regex("^[0-9a-fA-F-]{36}$")) ||
        request.challenge.size != 32 || request.packageName.length !in 1..255 ||
        request.certificateChain.size !in 2..MAX_CERTIFICATES ||
        request.certificateChain.any { it.isEmpty() } ||
        request.certificateChain.sumOf { it.size } > MAX_CHAIN_BYTES)
      throw AttestationRejected("REQUEST_INVALID")
  }

  private fun parseCertificate(encoded: ByteArray) = try {
    val input = ByteArrayInputStream(encoded)
    val cert = CertificateFactory.getInstance("X.509").generateCertificate(input)
    if (input.available() != 0 || !cert.encoded.contentEquals(encoded))
      throw AttestationRejected("CERTIFICATE_ENCODING_INVALID")
    cert as java.security.cert.X509Certificate
  } catch (rejected: AttestationRejected) {
    throw rejected
  } catch (_: Exception) {
    throw AttestationRejected("CERTIFICATE_CHAIN_INVALID")
  }

  private fun rawP256Point(key: ECPublicKey): ByteArray {
    if (key.params.curve.field.fieldSize != 256 || key.params.order.bitLength() != 256 ||
        key.params.cofactor != 1)
      throw AttestationRejected("DEVICE_KEY_CURVE_REJECTED")
    val result = ByteArray(65)
    result[0] = 4
    val x = fixed32(key.w.affineX)
    val y = fixed32(key.w.affineY)
    x.copyInto(result, 1)
    y.copyInto(result, 33)
    return result
  }

  private fun fixed32(value: BigInteger): ByteArray {
    val raw = value.toByteArray().let { if (it.size == 33 && it[0] == 0.toByte()) it.copyOfRange(1, 33) else it }
    if (raw.size > 32) throw AttestationRejected("DEVICE_KEY_POINT_INVALID")
    return ByteArray(32).also { raw.copyInto(it, 32 - raw.size) }
  }
}

fun parseApplicationPolicies(json: String): Map<String, AttestedApplicationPolicy> {
  require(json.length in 2..65_536) { "application allowlist is missing or too large" }
  val array = JsonParser.parseString(json).takeIf { it.isJsonArray }?.asJsonArray
    ?: throw IllegalArgumentException("application allowlist must be an array")
  require(array.size() in 1..32) { "application allowlist must contain 1 to 32 entries" }
  val policies = array.map { element ->
    require(element.isJsonObject) { "application policy must be an object" }
    val item = element.asJsonObject
    require(item.keySet() == setOf("packageName", "minimumVersion", "signingCertificateSha256")) {
      "application policy fields are invalid"
    }
    val packageName = item.get("packageName").asString
    val versionText = item.get("minimumVersion").asString
    val digestHex = item.get("signingCertificateSha256").asString
    require(packageName.matches(Regex("^[A-Za-z][A-Za-z0-9_.]{0,254}$"))) { "package name is invalid" }
    require(versionText.matches(Regex("^(0|[1-9][0-9]{0,8})$"))) { "minimum version is invalid" }
    require(digestHex.matches(Regex("^[a-f0-9]{64}$"))) { "signing certificate digest is invalid" }
    AttestedApplicationPolicy(packageName, BigInteger(versionText), decodeHex(digestHex))
  }
  require(policies.map { it.packageName }.distinct().size == policies.size) {
    "application package entries must be unique"
  }
  return policies.associateBy { it.packageName }
}

fun parseVerifyRequest(json: String): VerifyRequest {
  require(json.toByteArray(Charsets.UTF_8).size <= 256 * 1024) { "request too large" }
  val root = JsonParser.parseString(json).takeIf { it.isJsonObject }?.asJsonObject
    ?: throw IllegalArgumentException("request must be an object")
  require(root.keySet() == setOf("schema", "challengeId", "challenge", "packageName", "certificateChainDerBase64Url")) {
    "request fields are invalid"
  }
  require(root.get("schema").asString == "rock-android-key-attestation-request/1") {
    "request schema is unsupported"
  }
  val challengeId = root.get("challengeId").asString
  val challengeText = root.get("challenge").asString
  require(challengeText.matches(Regex("^[A-Za-z0-9_-]{43}$"))) { "challenge encoding is invalid" }
  val challenge = Base64.getUrlDecoder().decode(challengeText)
  require(challenge.size == 32 && Base64.getUrlEncoder().withoutPadding().encodeToString(challenge) == challengeText) {
    "challenge length or encoding is invalid"
  }
  val packageName = root.get("packageName").asString
  val encodedChain = root.get("certificateChainDerBase64Url").takeIf { it.isJsonArray }?.asJsonArray
    ?: throw IllegalArgumentException("certificate chain must be an array")
  require(encodedChain.size() in 2..MAX_CERTIFICATES) { "certificate chain length is invalid" }
  val chain = encodedChain.map { item ->
    val encoded = item.asString
    require(encoded.length in 1..(MAX_CHAIN_BYTES * 4 / 3 + 16) && encoded.matches(Regex("^[A-Za-z0-9_-]+$"))) {
      "certificate encoding is invalid"
    }
    Base64.getUrlDecoder().decode(encoded)
  }
  require(chain.sumOf { it.size } <= MAX_CHAIN_BYTES) { "certificate chain is too large" }
  return VerifyRequest(challengeId, challenge, packageName, chain)
}

private fun fetchGoogleRevocationStatus(): Set<String> {
  val endpoint = URI.create("https://android.googleapis.com/attestation/status").toURL()
  val connection = (endpoint.openConnection() as HttpURLConnection).apply {
    connectTimeout = 5_000
    readTimeout = 5_000
    instanceFollowRedirects = false
    requestMethod = "GET"
  }
  try {
    if (connection.responseCode != 200) throw IllegalStateException("revocation_source_unavailable")
    val length = connection.contentLengthLong
    if (length > MAX_REVOCATION_BYTES) throw IllegalStateException("revocation_source_too_large")
    val body = connection.inputStream.use { it.readNBytes(MAX_REVOCATION_BYTES + 1) }
    if (body.isEmpty() || body.size > MAX_REVOCATION_BYTES ||
        (length >= 0 && body.size.toLong() != length))
      throw IllegalStateException("revocation_source_invalid_size")
    return parseGoogleRevocationStatus(body.toString(Charsets.UTF_8))
  } finally {
    connection.disconnect()
  }
}

fun parseGoogleRevocationStatus(json: String): Set<String> {
  require(json.toByteArray(Charsets.UTF_8).size in 1..MAX_REVOCATION_BYTES)
  val root = JsonParser.parseString(json).takeIf { it.isJsonObject }?.asJsonObject
    ?: throw IllegalArgumentException("revocation status must be an object")
  require(root.keySet() == setOf("entries")) { "revocation status fields are invalid" }
  val entries = root.get("entries").takeIf { it.isJsonObject }?.asJsonObject
    ?: throw IllegalArgumentException("revocation entries must be an object")
  require(entries.size() <= 100_000) { "revocation entry count is too large" }
  val rejected = mutableSetOf<String>()
  for ((serial, element) in entries.entrySet()) {
    require(serial.matches(Regex("^[a-f1-9][a-f0-9]{0,127}$")) && element.isJsonObject) {
      "revocation entry identity is invalid"
    }
    val record = element.asJsonObject
    require(record.has("status")) { "revocation status is missing" }
    val status = record.get("status").asString
    // Google publishes both states. SUSPENDED must be denied just like REVOKED.
    require(status == "REVOKED" || status == "SUSPENDED") { "unknown revocation state" }
    rejected += serial.lowercase(Locale.ROOT)
  }
  return rejected
}

private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes)
private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
private fun decodeHex(value: String) = ByteArray(value.length / 2) { index ->
  value.substring(index * 2, index * 2 + 2).toInt(16).toByte()
}
