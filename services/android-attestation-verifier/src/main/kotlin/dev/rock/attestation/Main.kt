package dev.rock.attestation

import com.google.gson.Gson
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetAddress
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.util.concurrent.Executors

private const val MAX_REQUEST_BYTES = 256 * 1024

fun main() {
  val token = System.getenv("ANDROID_ATTESTATION_VERIFIER_TOKEN")
    ?: error("ANDROID_ATTESTATION_VERIFIER_TOKEN is required")
  require(token.length in 43..256) { "verifier token must be 32+ random bytes encoded as base64url" }
  val applications = parseApplicationPolicies(
    System.getenv("ANDROID_ATTESTED_APPLICATIONS_JSON")
      ?: error("ANDROID_ATTESTED_APPLICATIONS_JSON is required"),
  )
  val host = System.getenv("ANDROID_ATTESTATION_BIND_HOST") ?: "127.0.0.1"
  val bindAddress = InetAddress.getByName(host)
  if (!bindAddress.isLoopbackAddress)
    require(System.getenv("ANDROID_ATTESTATION_TLS_TERMINATION") == "confirmed") {
      "non-loopback binding requires an authenticated TLS-terminating private ingress"
    }
  val port = (System.getenv("ANDROID_ATTESTATION_PORT") ?: "8789").toInt().also {
    require(it in 1024..65535) { "verifier port must be an unprivileged port" }
  }

  val verifier = AttestationVerificationService(applications)
  val server = HttpServer.create(InetSocketAddress(bindAddress, port), 16)
  server.executor = Executors.newFixedThreadPool(8)
  server.createContext("/healthz") { exchange ->
    if (exchange.requestMethod != "GET") respond(exchange, 405, "{\"error\":\"method_not_allowed\"}")
    else respond(exchange, 200, "{\"status\":\"ok\",\"service\":\"android-key-attestation-verifier\"}")
  }
  server.createContext("/v1/android-key-attestation/verify") { exchange ->
    handleVerification(exchange, token, verifier)
  }
  Runtime.getRuntime().addShutdownHook(Thread {
    server.stop(2)
    (server.executor as? java.util.concurrent.ExecutorService)?.shutdown()
  })
  server.start()
  System.err.println("Android attestation verifier listening on $host:$port; application allowlist=${applications.size}")
}

private fun handleVerification(
  exchange: HttpExchange,
  expectedToken: String,
  verifier: AttestationVerificationService,
) {
  if (exchange.requestMethod != "POST") {
    respond(exchange, 405, "{\"error\":\"method_not_allowed\"}")
    return
  }
  val authorizations = exchange.requestHeaders["Authorization"] ?: emptyList()
  if (authorizations.size != 1 || !secureEquals(authorizations.single(), "Bearer $expectedToken")) {
    respond(exchange, 401, "{\"error\":\"unauthorized\"}")
    return
  }
  if (exchange.requestHeaders["Content-Type"]?.singleOrNull()?.substringBefore(';') != "application/json" ||
      exchange.requestHeaders.containsKey("Transfer-Encoding")) {
    respond(exchange, 415, "{\"error\":\"json_required\"}")
    return
  }
  val length = exchange.requestHeaders["Content-Length"]?.singleOrNull()?.toLongOrNull()
  if (length == null || length !in 1..MAX_REQUEST_BYTES.toLong()) {
    respond(exchange, 413, "{\"error\":\"request_size_invalid\"}")
    return
  }
  try {
    val bytes = exchange.requestBody.use { it.readNBytes(MAX_REQUEST_BYTES + 1) }
    if (bytes.size.toLong() != length || bytes.size > MAX_REQUEST_BYTES) {
      respond(exchange, 413, "{\"error\":\"request_size_invalid\"}")
      return
    }
    val request = parseVerifyRequest(bytes.toString(Charsets.UTF_8))
    val response = verifier.verify(request)
    respond(exchange, 200, Gson().toJson(response))
  } catch (rejected: AttestationRejected) {
    respond(exchange, 422, "{\"error\":\"attestation_rejected\",\"code\":\"${rejected.message}\"}")
  } catch (_: IllegalArgumentException) {
    respond(exchange, 400, "{\"error\":\"request_invalid\"}")
  } catch (_: AttestationVerificationUnavailable) {
    respond(exchange, 503, "{\"error\":\"verification_unavailable\"}")
  } catch (_: Exception) {
    // Do not log certificates, challenges, tokens, exception text, or attested identifiers.
    respond(exchange, 503, "{\"error\":\"verification_unavailable\"}")
  }
}

private fun secureEquals(actual: String, expected: String): Boolean = try {
  MessageDigest.isEqual(actual.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))
} catch (_: Exception) {
  false
}

private fun respond(exchange: HttpExchange, status: Int, json: String) {
  val body = json.toByteArray(Charsets.UTF_8)
  exchange.responseHeaders.set("Content-Type", "application/json; charset=utf-8")
  exchange.responseHeaders.set("Cache-Control", "no-store")
  exchange.responseHeaders.set("X-Content-Type-Options", "nosniff")
  exchange.responseHeaders.set("Referrer-Policy", "no-referrer")
  exchange.responseHeaders.set("Connection", "close")
  exchange.sendResponseHeaders(status, body.size.toLong())
  exchange.responseBody.use { it.write(body) }
}
