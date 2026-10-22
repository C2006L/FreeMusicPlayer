package com.vibemusic.model.vo;

import lombok.Builder;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
@Builder
public class OnlineSongVO implements Serializable {
    @Serial
    private static final long serialVersionUID = 1L;

    private String songId;
    private String songName;
    private String artistName;
    private String album;
    private Long duration;
    private String coverUrl;
    private String audioUrl;
    private Integer likeStatus;
    private String source;
    private String sourceName;
    private String sourceSongId;
    private String sourceUrlId;
    private String sourcePicId;
    private String sourceLyricId;
    private String sourceExtra;
    private String providerEngine;
    private String availability;
    private Boolean vip;
    private Boolean online;
}
