package com.vibemusic.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class OnlineSongImportDTO {

    @NotBlank
    @Pattern(regexp = "netease|tencent|qq|kugou|kuwo|baidu|migu|qianqian|jamendo|joox|bilibili|fivesing|soda")
    private String source;

    @NotBlank
    @Size(max = 100)
    private String sourceSongId;

    @Size(max = 100)
    private String sourceUrlId;

    @Size(max = 1000)
    private String sourcePicId;

    @Size(max = 8000)
    private String sourceExtra;

    @Size(max = 30)
    private String providerEngine;

    @NotBlank
    @Size(max = 255)
    private String songName;

    @NotBlank
    @Size(max = 255)
    private String artistName;

    @Size(max = 255)
    private String album;

    private Long duration;
}
