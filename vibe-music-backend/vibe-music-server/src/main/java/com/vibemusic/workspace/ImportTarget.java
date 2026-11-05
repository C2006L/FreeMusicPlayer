package com.vibemusic.workspace;

import java.net.URI;
import java.util.Locale;
import java.util.regex.Pattern;

/** Parse only public platform identifiers. No client URL is ever fetched. */
public record ImportTarget(String source, String id) {
    public static ImportTarget parse(String link) {
        try {
            URI uri = URI.create(link.trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1) throw new IllegalArgumentException();
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            String path = uri.getPath();
            if (host.equals("www.bilibili.com") || host.equals("bilibili.com")) {
                var match = Pattern.compile("^/video/(BV[a-zA-Z0-9]{10})/?$").matcher(path);
                if (match.matches()) return new ImportTarget("bilibili", match.group(1));
            }
            if (host.equals("music.163.com")) {
                String target = uri.getRawFragment() != null ? uri.getRawFragment() : path + "?" + uri.getRawQuery();
                var match = Pattern.compile("^/?playlist\\?(?:[^#]*&)?id=([0-9]{1,20})(?:&[^#]*)?$").matcher(target);
                if (match.matches()) return new ImportTarget("netease", match.group(1));
            }
            if (host.equals("y.qq.com")) {
                var match = Pattern.compile("^/n/ryqq/playlist/([0-9]{1,20})/?$").matcher(path);
                if (match.matches()) return new ImportTarget("qq", match.group(1));
            }
        } catch (RuntimeException ignored) { }
        throw new IllegalArgumentException("仅支持网易云 playlist、QQ ryqq/playlist 和 B站 video 的公开 HTTPS 链接，不支持短链接或任意 URL");
    }
}
