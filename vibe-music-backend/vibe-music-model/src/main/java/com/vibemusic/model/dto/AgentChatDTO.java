package com.vibemusic.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 与 VibeAgent 聊天的请求体
 */
@Data
public class AgentChatDTO {

    /**
     * 会话 id，用于区分不同用户的对话记忆
     */
    @NotBlank
    @Pattern(regexp = "^[a-zA-Z0-9-]{1,64}$")
    private String conversationId;

    /**
     * 用户消息
     */
    @NotBlank(message = "消息内容不能为空")
    @Size(max = 2000, message = "消息不能超过2000字")
    private String query;

}
