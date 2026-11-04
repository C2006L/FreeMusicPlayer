package com.vibemusic.agent;

import java.util.List;

/** Editorial search seeds, not catalog results. Every candidate must be fetched from the real catalog. */
public final class RecommendationPlan {
    private RecommendationPlan() { }
    public static List<String> queries(String request) {
        if (request == null || request.matches(".*[《》].*") || request.matches(".*(搜索|查找|播放|本地|这首|这张).*")) return List.of();
        if (request.matches(".*(心情低落|难过|伤心|失恋|悲伤|不开心|治愈).*"))
            return List.of("平凡之路 朴树", "陪你度过漫长岁月 陈奕迅");
        if (request.matches(".*(推荐|想听|听什么|好听).*(摇滚).*"))
            return List.of("蓝莲花 许巍", "海阔天空 Beyond");
        return List.of();
    }
    private static final java.util.regex.Pattern DISCOVERY = java.util.regex.Pattern.compile(
            ".*(最近|现在|当前|本周|今日|热门|流行|榜单|排行|最火|比较火|什么歌|哪些歌|在听什么).*");
    /** 热门/榜单类问法走真实推荐歌单入口，不交给模型自由生成歌名。 */
    public static boolean wantsDiscovery(String request) {
        if (request == null || request.matches(".*[《》].*") || request.matches(".*(搜索|查找|播放|本地|这首|这张).*")) return false;
        return DISCOVERY.matcher(request).find();
    }
}
