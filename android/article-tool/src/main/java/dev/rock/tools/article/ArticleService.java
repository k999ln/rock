package dev.rock.tools.article;

import dev.rock.core.ArticleTools;
import dev.rock.sdk.ArticlePayload;
import dev.rock.sdk.LocalToolService;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;

public final class ArticleService extends LocalToolService {
    @Override protected String execute(String operation, String input, AtomicBoolean stop) throws Exception {
        if (stop.get()) throw new IllegalStateException("CANCELLED");
        JSONObject j = ArticlePayload.parse(input);
        if (operation.equals("citations@1")) {
            j.put("markdown", ArticleTools.citations(j.getString("markdown"))); return j.toString();
        }
        if (operation.equals("free-article@1"))
            return ArticleTools.freeArticle(j.getString("markdown"), j.getInt("afterChars"), j.getString("summary"), j.getInt("price"), j.getString("paidContents"), j.getString("noteUrl"));
        throw new IllegalArgumentException("UNKNOWN_OPERATION");
    }
}
