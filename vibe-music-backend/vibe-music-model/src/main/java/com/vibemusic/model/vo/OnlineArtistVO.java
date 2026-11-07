package com.vibemusic.model.vo;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serial;
import java.io.Serializable;
import java.util.List;

/**
 * 平台推荐歌单聚合出的歌手卡片。songCount 是跨歌单去重后的真实候选曲目数，
 * 不是某一份歌单里的出现次数。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OnlineArtistVO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String name;
    private Long songCount;
    private String coverUrl;
    private String sampleSongName;
    private String source;
    private String sourceName;
    private List<String> sources;
}
