package com.vibemusic.service;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Map;

@Service
public class AiStatusService {
    private final String provider;
    private final String model;
    private final String baseUrl;
    private final String cloudKey;
    private final RestClient client;

    public AiStatusService(@Value("${spring.ai.model.chat:ollama}") String provider,
                           @Value("${spring.ai.ollama.chat.options.model:qwen2.5:3b}") String model,
                           @Value("${spring.ai.ollama.base-url:http://127.0.0.1:11434}") String baseUrl,
                           @Value("${spring.ai.dashscope.api-key:not-configured}") String cloudKey) {
        this.provider = provider; this.model = model; this.baseUrl = baseUrl; this.cloudKey = cloudKey;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build());
        factory.setReadTimeout(Duration.ofSeconds(3));
        this.client = RestClient.builder().requestFactory(factory).build();
    }

    public Map<String, Object> status() {
        if ("ollama".equals(provider)) {
            try {
                JsonNode tags = client.get().uri(baseUrl + "/api/tags").retrieve().body(JsonNode.class);
                if (tags != null) for (JsonNode item : tags.path("models")) {
                    if (model.equals(item.path("name").asText())) return state("UP", true, "本机模型可用");
                }
                return state("MODEL_MISSING", false, "Ollama 中未找到配置的模型 " + model);
            } catch (Exception e) { return state("DOWN", false, "无法连接本机 Ollama，请启动 Ollama 服务"); }
        }
        if ("dashscope".equals(provider)) {
            boolean configured = cloudKey != null && !cloudKey.isBlank() && !"not-configured".equals(cloudKey);
            return state(configured ? "CONFIGURED" : "NOT_CONFIGURED", configured,
                    configured ? "云端密钥已配置，实际连接以聊天结果为准" : "缺少 DASHSCOPE_API_KEY");
        }
        return state("DISABLED", false, "AI 助手未启用");
    }

    private Map<String, Object> state(String status, boolean configured, String message) {
        return Map.of("status", status, "configured", configured, "provider", provider,
                "model", "ollama".equals(provider) ? model : provider, "message", message, "required", false);
    }
}
