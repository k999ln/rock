package dev.rock.core;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Java adaptation of lib/mr-tools.ts. Mr. source: vendor/mr/LICENSE (MIT).
 * Copyright (c) Anicca contributors. See contracts/README.md for provenance/parity scope.
 */
public final class ArticleTools {
    private ArticleTools() {}
    private static Pattern p(String regex) { return Pattern.compile(regex, Pattern.UNICODE_CHARACTER_CLASS); }
    private static String text(String s) {
        if (s == null || s.trim().isEmpty() || s.length() > 100000) throw new IllegalArgumentException("INVALID_TEXT");
        return s.replaceAll("\r\n?", "\n");
    }
    private static String trimEnd(String s) { return p("[\\s\\uFEFF]+$").matcher(s).replaceFirst(""); }
    private static String replace(String s, Pattern pattern, java.util.function.Function<Matcher,String> fn) {
        Matcher m = pattern.matcher(s); StringBuffer out = new StringBuffer();
        while (m.find()) m.appendReplacement(out, Matcher.quoteReplacement(fn.apply(m)));
        m.appendTail(out); return out.toString();
    }
    public static String citations(String input) {
        String body = text(input); String marker = "\uE000ROCK_STAR_CODE_";
        while (body.contains(marker)) marker += "X";
        final String token = marker;
        List<String> preserved = new ArrayList<>(), output = new ArrayList<>();
        java.util.function.Function<String,String> keep = code -> {
            String key = token + preserved.size() + "\uE001"; preserved.add(code); return key;
        };
        String[] lines = body.split("\n", -1);
        for (int i = 0; i < lines.length;) {
            Matcher fm = p("^\\s*(`{3,}|~{3,})").matcher(lines[i]);
            if (fm.find()) {
                String fence = fm.group(1);
                Pattern close = p("^\\s*" + fence.charAt(0) + "{" + fence.length() + ",}\\s*$");
                List<String> block = new ArrayList<>(); block.add(lines[i++]);
                while (i < lines.length) { String line = lines[i++]; block.add(line); if (close.matcher(line).find()) break; }
                output.add(keep.apply(String.join("\n", block)));
            } else output.add(replace(lines[i++], p("(`+)([^\\n]*?)\\1(?!`)"), m -> keep.apply(m.group())));
        }
        Map<String,String> pairs = new LinkedHashMap<>();
        String cleaned = replace(String.join("\n", output), p("（出典:\\s*[^）]*）"), m -> {
            Matcher link = p("\\[([^\\]]+)\\]\\(([^)]+)\\)").matcher(m.group()); boolean found = false;
            while (link.find()) { found = true; pairs.putIfAbsent(link.group(2), link.group(1)); }
            return found ? "" : m.group();
        }).replaceAll("。。+", "。").replaceAll("、、+", "、").replaceAll(" {2,}", " ");
        cleaned = p("\\s+(?=[。、])").matcher(cleaned).replaceAll("").replaceAll("\n{3,}", "\n\n");
        String result = trimEnd(cleaned) + "\n";
        if (!pairs.isEmpty()) {
            Matcher header = p("(?m)^##\\s*出典\\s*$").matcher(cleaned);
            if (header.find()) {
                int end = header.end(); String tail = cleaned.substring(end);
                Matcher next = p("(?m)^## ").matcher(tail); boolean hasNext = next.find();
                String existing = hasNext ? tail.substring(0, next.start()) : tail;
                String after = hasNext ? tail.substring(next.start()) : "";
                Matcher links = p("\\[([^\\]]+)\\]\\(([^)]+)\\)").matcher(existing);
                while (links.find()) pairs.remove(links.group(2));
                if (!pairs.isEmpty()) result = trimEnd(cleaned.substring(0, end) + "\n" + trimEnd(existing) + "\n" + renderLinks(pairs) + "\n\n" + after) + "\n";
            } else result = trimEnd(cleaned) + "\n---\n\n## 出典\n\n" + renderLinks(pairs) + "\n";
        }
        for (int i = 0; i < preserved.size(); i++) result = result.replace(token + i + "\uE001", preserved.get(i));
        return result;
    }
    private static String renderLinks(Map<String,String> links) {
        List<String> lines = new ArrayList<>(); links.forEach((url,label) -> lines.add("- [" + label + "](" + url + ")"));
        return String.join("\n", lines);
    }
    private static final class Segment {
        final String type, raw; final int paragraph;
        Segment(String type, String raw, int paragraph) { this.type = type; this.raw = raw; this.paragraph = paragraph; }
    }
    private static int flush(List<String> buffer, List<Segment> out, int paragraph) {
        if (buffer.isEmpty()) return paragraph;
        List<String> nonempty = new ArrayList<>(); for (String l : buffer) if (!l.trim().isEmpty()) nonempty.add(l.trim());
        Matcher m = p("[^。]*。|[^。]+$").matcher(String.join(" ", nonempty));
        while (m.find()) if (!m.group().trim().isEmpty()) out.add(new Segment("sentence", m.group(), paragraph));
        buffer.clear(); return paragraph + 1;
    }
    private static List<Segment> segments(String body) {
        String[] lines = body.split("\n", -1); List<Segment> out = new ArrayList<>();
        List<String> buffer = new ArrayList<>(); int pid = 0;
        for (int i = 0; i < lines.length;) {
            String line = lines[i], s = line.trim();
            if (s.startsWith("```")) {
                pid = flush(buffer, out, pid); List<String> code = new ArrayList<>(); code.add(lines[i++]);
                while (i < lines.length && !lines[i].trim().startsWith("```")) code.add(lines[i++]);
                if (i >= lines.length) throw new IllegalArgumentException("UNCLOSED_CODE");
                code.add(lines[i++]); out.add(new Segment("code", String.join("\n", code), -1)); continue;
            }
            if (s.isEmpty()) { pid = flush(buffer, out, pid); i++; continue; }
            if (s.equals("---") || p("^#{1,6}\\s|^[-*]\\s").matcher(s).find()) {
                pid = flush(buffer, out, pid); out.add(new Segment(s.equals("---") ? "hr" : s.startsWith("#") ? "heading" : "bullet", line, -1)); i++; continue;
            }
            buffer.add(line); i++;
        }
        flush(buffer, out, pid); return out;
    }
    private static String render(List<Segment> items) {
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < items.size();) {
            Segment s = items.get(i);
            if (s.type.equals("sentence")) {
                StringBuilder b = new StringBuilder();
                while (i < items.size() && items.get(i).type.equals("sentence") && items.get(i).paragraph == s.paragraph) b.append(items.get(i++).raw);
                lines.add(b.toString()); lines.add("");
            } else if (s.type.equals("bullet")) {
                while (i < items.size() && items.get(i).type.equals("bullet")) lines.add(items.get(i++).raw);
                lines.add("");
            } else { lines.add(s.raw); lines.add(""); i++; }
        }
        return trimEnd(String.join("\n", lines));
    }
    private static String[] sourceSection(String body) {
        String[] lines = body.split("\n", -1); int start = -1, level = 0, end = lines.length; Pattern fence = null;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (fence != null) { if (fence.matcher(line).find()) fence = null; continue; }
            Matcher fm = p("^(`{3,}|~{3,})").matcher(line);
            if (fm.find()) { String f = fm.group(1); fence = p("^" + f.charAt(0) + "{" + f.length() + ",}\\s*$"); continue; }
            if (start < 0) {
                Matcher heading = p("(?i)^(#{1,6})\\s*(Sources|出典)\\s*$").matcher(line);
                if (heading.find()) { start = i; level = heading.group(1).length(); }
            } else {
                Matcher heading = p("^(#{1,6})\\s").matcher(line);
                if (heading.find() && heading.group(1).length() <= level) { end = i; break; }
            }
        }
        if (start < 0) return new String[]{null, body};
        if (fence != null) throw new IllegalArgumentException("UNCLOSED_SOURCES_CODE");
        List<String> rest = new ArrayList<>();
        for (int i = 0; i < lines.length; i++) if (i < start || i >= end) rest.add(lines[i]);
        return new String[]{trimEnd(String.join("\n", java.util.Arrays.copyOfRange(lines, start, end))), String.join("\n", rest)};
    }
    public static String freeArticle(String markdown, int afterChars, String summaryText, int price, String paidContents, String noteUrl) {
        String source = text(markdown);
        if (afterChars < 1 || afterChars > 100000 || price < 1 || price > 1000000) throw new IllegalArgumentException("INVALID_RANGE");
        List<String> summary = new ArrayList<>();
        for (String s : text(summaryText).split("\n")) if (p("^[-*]\\s+").matcher(s.trim()).find()) summary.add(p("^[-*]\\s+").matcher(s.trim()).replaceFirst(""));
        if (summary.size() < 3 || summary.size() > 5) throw new IllegalArgumentException("INVALID_SUMMARY");
        String paid = text(paidContents).trim();
        try {
            URI url = URI.create(noteUrl.trim());
            if (!"https".equalsIgnoreCase(url.getScheme()) || !"note.com".equalsIgnoreCase(url.getHost())
                || url.getUserInfo() != null || !p("^/[^/]+/n/[^/]+").matcher(url.getPath()).find()) throw new IllegalArgumentException("INVALID_NOTE_URL");
        } catch (RuntimeException e) { throw new IllegalArgumentException("INVALID_NOTE_URL"); }
        List<String> lines = new ArrayList<>(List.of(source.split("\n", -1)));
        String title = p("^#\\s+").matcher(lines.get(0).trim()).find() ? lines.remove(0) : null;
        String[] info = sourceSection(String.join("\n", lines)); List<Segment> all = segments(info[1]), kept = new ArrayList<>();
        int count = 0, cut = -1;
        for (int i = 0; i < all.size(); i++) {
            Segment s = all.get(i); kept.add(s);
            if (!s.type.equals("code")) {
                String plain = p("^#{1,6}\\s*").matcher(s.raw).replaceFirst("");
                plain = p("^[-*]\\s*").matcher(plain).replaceFirst("").replaceAll("\\*\\*(.+?)\\*\\*", "$1");
                count += plain.codePointCount(0, plain.length());
                if (count >= afterChars) { cut = i; break; }
            }
        }
        boolean remainder = false;
        if (cut >= 0) for (int i = cut + 1; i < all.size(); i++) if (List.of("sentence", "bullet", "code").contains(all.get(i).type)) remainder = true;
        if (!remainder) throw new IllegalArgumentException("NO_PAID_REMAINDER");
        List<String> parts = new ArrayList<>();
        if (title != null) { parts.add(title); parts.add(""); }
        parts.addAll(List.of(render(kept), "", "---", "", "## まとめ", ""));
        for (String s : summary) parts.add("- " + s); parts.add("");
        if (info[0] != null) { parts.add(info[0]); parts.add(""); }
        parts.addAll(List.of("---", "", "この記事は無料版です。完全版（note・" + String.format(Locale.US, "%,d", price) + "円買い切り）には、この続き（" + paid + "）が入っています。", "", noteUrl.trim(), ""));
        String result = trimEnd(String.join("\n", parts).replaceAll("\n{3,}", "\n\n")) + "\n";
        for (String l : result.split("\n")) if (p("^#{2,6}\\s").matcher(l.trim()).find() && l.contains("続き")) throw new IllegalArgumentException("CONTINUATION_HEADING");
        if (result.contains("——")) throw new IllegalArgumentException("DOUBLE_DASH");
        return result;
    }

    /** Host parity harness. No filesystem, network, shell, or execution of input. */
    public static void main(String[] args) {
        try {
            java.util.function.Function<String,String> decode = s -> new String(Base64.getDecoder().decode(s), StandardCharsets.UTF_8);
            String out = args[0].equals("citations") ? citations(decode.apply(args[1])) : freeArticle(decode.apply(args[1]), Integer.parseInt(args[2]), decode.apply(args[3]), Integer.parseInt(args[4]), decode.apply(args[5]), decode.apply(args[6]));
            System.out.print(Base64.getEncoder().encodeToString(out.getBytes(StandardCharsets.UTF_8)));
        } catch (RuntimeException e) { System.err.print("INVALID_INPUT"); System.exit(2); }
    }
}
