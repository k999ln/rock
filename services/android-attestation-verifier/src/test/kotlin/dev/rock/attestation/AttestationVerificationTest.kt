package dev.rock.attestation

import java.time.Instant
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class AttestationVerificationTest {
  @Test
  fun `application policy requires unique pinned package and signer`() {
    val signer = "ab".repeat(32)
    val policies = parseApplicationPolicies(
      """[{"packageName":"dev.rock.test","minimumVersion":"7","signingCertificateSha256":"$signer"}]""",
    )
    assertEquals("7", policies.getValue("dev.rock.test").minimumVersion.toString())
    assertEquals(signer, policies.getValue("dev.rock.test").signingCertificateSha256.joinToString("") { "%02x".format(it) })
    assertFailsWith<IllegalArgumentException> {
      parseApplicationPolicies("""[{"packageName":"dev.rock.test","minimumVersion":"7","signingCertificateSha256":"$signer"},{"packageName":"dev.rock.test","minimumVersion":"8","signingCertificateSha256":"$signer"}]""")
    }
    assertFailsWith<IllegalArgumentException> { parseApplicationPolicies("[]") }
  }

  @Test
  fun `request accepts canonical 32-byte challenge and bounded DER chain`() {
    val challenge = ByteArray(32) { it.toByte() }
    val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(challenge)
    val request = parseVerifyRequest(
      """{"schema":"rock-android-key-attestation-request/1","challengeId":"12345678-1234-1234-1234-123456789abc","challenge":"$encoded","packageName":"dev.rock.test","certificateChainDerBase64Url":["AQ","Ag"]}""",
    )
    assertEquals(challenge.toList(), request.challenge.toList())
    assertEquals(listOf(1.toByte()), request.certificateChain[0].toList())
    assertFailsWith<IllegalArgumentException> {
      parseVerifyRequest(
        """{"schema":"rock-android-key-attestation-request/1","challengeId":"12345678-1234-1234-1234-123456789abc","challenge":"${Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(31))}","packageName":"dev.rock.test","certificateChainDerBase64Url":["AQ","Ag"]}""",
      )
    }
    assertFailsWith<IllegalArgumentException> {
      parseVerifyRequest(
        """{"schema":"rock-android-key-attestation-request/1","challengeId":"12345678-1234-1234-1234-123456789abc","challenge":"$encoded","packageName":"dev.rock.test","certificateChainDerBase64Url":["AQ","Ag"],"extra":true}""",
      )
    }
  }

  @Test
  fun `Google CRL fails closed for both revoked and suspended`() {
    val states = parseGoogleRevocationStatus(
      """{"entries":{"1":{"status":"REVOKED"},"a2":{"status":"SUSPENDED"}}}""",
    )
    assertEquals(setOf("1", "a2"), states)
    assertFailsWith<IllegalArgumentException> { parseGoogleRevocationStatus("""{"entries":{"1":{"status":"ACTIVE"}}}""") }
    assertFailsWith<IllegalArgumentException> { parseGoogleRevocationStatus("""{"entries":{"0":{"status":"REVOKED"}}}""") }
    assertFailsWith<IllegalArgumentException> { parseGoogleRevocationStatus("""{"entries":{"1":{}}}""") }
  }

  @Test
  fun `unlisted app rejected before fetching external revocation data`() {
    var crlRequested = false
    val verifier = AttestationVerificationService(
      applications = mapOf("dev.rock.test" to AttestedApplicationPolicy("dev.rock.test", java.math.BigInteger.ONE, ByteArray(32))),
      clock = { Instant.parse("2026-10-01T00:00:00Z") },
      revokedSerials = { crlRequested = true; emptySet() },
    )
    val request = VerifyRequest(
      challengeId = "12345678-1234-1234-1234-123456789abc",
      challenge = ByteArray(32),
      packageName = "dev.attacker.app",
      certificateChain = listOf(byteArrayOf(1), byteArrayOf(2)),
    )
    val failure = assertFailsWith<AttestationRejected> { verifier.verify(request) }
    assertEquals("APPLICATION_NOT_ALLOWED", failure.message)
    assertTrue(!crlRequested)
  }
}
