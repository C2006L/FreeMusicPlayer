package com.vibemusic.agent;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

/**
 * 情绪/场景意图 -> 平台主题歌单的组合检索词。
 * 这里只给出检索方向，候选曲目必须由 provider 从真实平台歌单获取，且每次随机轮换。
 */
public final class RecommendationPlan {
    private RecommendationPlan() { }

    private record Theme(String name, Pattern intent, List<String> keywords) { }

    private static final List<Theme> THEMES = List.of(
            new Theme("失恋", Pattern.compile("失恋|分手|前任|心碎|被甩|离别|分开"), List.of(
                    "失恋 疗伤", "分手 情歌", "失恋 伤感", "失恋 情歌", "分手 伤感")),
            new Theme("难过", Pattern.compile("难过|伤心|低落|悲伤|不开心|沮丧|心情不好|郁闷|emo"), List.of(
                    "难过 治愈", "伤感 治愈", "心情低落 歌单", "难过 情歌", "伤感 歌单")),
            new Theme("孤独", Pattern.compile("孤独|寂寞|孤单|一个人"), List.of(
                    "孤独 治愈", "孤独 情歌", "寂寞 伤感", "一个人 歌单")),
            new Theme("压力", Pattern.compile("焦虑|压力|烦躁|失眠|睡不着|紧张"), List.of(
                    "缓解焦虑 音乐", "放松 轻音乐", "失眠 助眠", "压力 放松 歌单")),
            new Theme("治愈", Pattern.compile("治愈|疗伤|安慰|温暖|安抚"), List.of(
                    "治愈 歌单", "温暖 治愈", "疗伤 情歌", "治愈 轻音乐")),
            new Theme("快乐", Pattern.compile("开心|快乐|高兴|庆祝|好心情|欢快"), List.of(
                    "快乐 歌单", "开心 歌曲", "好心情 歌单", "欢快 音乐")),
            new Theme("思念", Pattern.compile("思念|想念|怀念|想家|牵挂"), List.of(
                    "思念 歌单", "想念 情歌", "怀念 歌单", "思念 伤感")),
            new Theme("摇滚", Pattern.compile("摇滚"), List.of(
                    "摇滚 经典", "摇滚 歌单", "华语 摇滚", "摇滚 现场")),
            new Theme("流行", Pattern.compile("流行|热门歌曲"), List.of(
                    "流行 歌单", "华语 流行", "流行 情歌", "好听 流行")),
            new Theme("情歌", Pattern.compile("情歌"), List.of(
                    "经典 情歌", "情歌 歌单", "华语 情歌")));

    /**
     * 返回本次真实检索要用的组合关键词（最多 4 个）。
     * 同一问句每次调用都会重新打乱候选词并交给 provider 随机选歌单/曲目，
     * 因此重复提问或相近说法不会永远命中同一批歌。
     */
    public static List<String> themeQueries(String request) {
        if (request == null || request.matches(".*[《》].*")
                || request.matches(".*(搜索|查找|播放|本地|这首|这张).*")) return List.of();
        List<String> matched = new ArrayList<>();
        for (Theme theme : THEMES) {
            if (theme.intent().matcher(request).find()) matched.addAll(theme.keywords());
        }
        if (matched.isEmpty()) return List.of();
        List<String> shuffled = new ArrayList<>(matched);
        java.util.Collections.shuffle(shuffled, ThreadLocalRandom.current());
        return shuffled.stream().distinct().limit(4).toList();
    }

    private static final Pattern DISCOVERY = Pattern.compile(
            ".*(最近|现在|当前|本周|今日|热门|流行|榜单|排行|最火|比较火|什么歌|哪些歌|在听什么).*");

    /** 热门/榜单类问法走真实推荐歌单入口，不交给模型自由生成歌名。 */
    public static boolean wantsDiscovery(String request) {
        if (request == null || request.matches(".*[《》].*") || request.matches(".*(搜索|查找|播放|本地|这首|这张).*")) return false;
        return DISCOVERY.matcher(request).find();
    }
}
