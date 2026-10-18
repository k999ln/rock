package dev.rock.core.platform;

/** Authenticity policy is supplied by the Broker, never by a downloaded manifest. */
@FunctionalInterface public interface ModelProfileAuthenticator {
    String verifySignature(ModelProfileManifest profile);
}
