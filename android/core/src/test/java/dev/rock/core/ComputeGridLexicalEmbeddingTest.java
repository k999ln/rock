package dev.rock.core;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class ComputeGridLexicalEmbeddingTest {
    private static JSONObject vectors() throws Exception {
        try (InputStream in = ComputeGridLexicalEmbeddingTest.class
                .getResourceAsStream("/sky-compute-grid-lexical-embedding-vectors.json")) {
            return new JSONObject(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static String sha256(byte[] value) throws Exception {
        StringBuilder hex = new StringBuilder(64);
        for (byte item : MessageDigest.getInstance("SHA-256").digest(value))
            hex.append(String.format(java.util.Locale.ROOT, "%02x", item & 0xff));
        return hex.toString();
    }

    @Test public void reproducesEveryPublishedVector() throws Exception {
        JSONObject published = vectors();
        assertEquals(ComputeGridLexicalEmbedding.SKU_ID, published.getString("skuId"));
        JSONObject artifacts = published.getJSONObject("artifacts");
        assertEquals(ComputeGridLexicalEmbedding.RUNTIME_ARTIFACT_SHA256, artifacts.getString("runtimeArtifactSha256"));
        assertEquals(ComputeGridLexicalEmbedding.MODEL_SHA256, artifacts.getString("modelSha256"));
        assertEquals(ComputeGridLexicalEmbedding.TOKENIZER_SHA256, artifacts.getString("tokenizerSha256"));
        assertEquals(ComputeGridLexicalEmbedding.DIMENSIONS, published.getJSONObject("output").getInt("dimensions"));
        JSONArray cases = published.getJSONArray("vectors");
        assertTrue(cases.length() >= 6);
        for (int index = 0; index < cases.length(); index++) {
            JSONObject vector = cases.getJSONObject(index);
            JSONArray source = vector.getJSONArray("items");
            String[] items = new String[source.length()];
            for (int item = 0; item < items.length; item++) items[item] = source.getString(item);
            byte[] output = ComputeGridLexicalEmbedding.embed(items);
            String name = vector.getString("name");
            assertEquals(name, vector.getInt("outputBytes"), output.length);
            assertEquals(name, vector.getString("outputSha256"), sha256(output));
        }
    }

    @Test public void emptyAndSingleByteItemsAreZeroVectors() {
        byte[] output = ComputeGridLexicalEmbedding.embed(new String[] {"", "a"});
        assertArrayEquals(new byte[2 * ComputeGridLexicalEmbedding.DIMENSIONS], output);
    }

    @Test public void refusesTextThatPlatformsEncodeDifferently() {
        assertTrue(ComputeGridLexicalEmbedding.wellFormed("ok 🥑"));
        assertFalse(ComputeGridLexicalEmbedding.wellFormed("\ud83e"));
        assertFalse(ComputeGridLexicalEmbedding.wellFormed("a\udd51"));
        assertFalse(ComputeGridLexicalEmbedding.wellFormed(null));
        assertThrows(IllegalArgumentException.class,
            () -> ComputeGridLexicalEmbedding.embed(new String[] {"fine", "\ud800"}));
        assertThrows(IllegalArgumentException.class, () -> ComputeGridLexicalEmbedding.embed(new String[0]));
        assertThrows(IllegalArgumentException.class, () -> ComputeGridLexicalEmbedding.embed(null));
    }
}
