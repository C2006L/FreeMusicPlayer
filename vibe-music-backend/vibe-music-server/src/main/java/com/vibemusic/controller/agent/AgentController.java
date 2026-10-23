package com.vibemusic.controller.agent;

import com.vibemusic.agent.OnlineAgentTools;
import com.vibemusic.agent.MusicAgentTools;
import com.vibemusic.model.dto.AgentChatDTO;
import com.vibemusic.service.OnlineMusicService;
import com.vibemusic.service.AiStatusService;
import com.vibemusic.util.ThreadLocalUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.Disposable;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

import static com.vibemusic.agent.AgentPrompt.DEFAULT_PROMPT;
import static org.springframework.http.HttpStatus.TOO_MANY_REQUESTS;

@RestController
@RequestMapping("/agent")
public class AgentController {
    private final ChatClient client;
    private final OnlineMusicService music;
    private final ChatMemory memory = MessageWindowChatMemory.builder().maxMessages(12).build();
    private final Map<String, Long> conversations = new ConcurrentHashMap<>();
    private final Map<String, String> activeOwners = new ConcurrentHashMap<>();
    private final Map<String, Runnable> cancellations = new ConcurrentHashMap<>();
    private final String provider;
    private final String model;
    private final AiStatusService aiStatus;
    private final MusicAgentTools localMusic;

    public AgentController(ObjectProvider<ChatModel> models, OnlineMusicService music, AiStatusService aiStatus, MusicAgentTools localMusic,
                           @Value("${spring.ai.model.chat:ollama}") String provider,
                           @Value("${spring.ai.ollama.chat.options.model:qwen2.5:3b}") String model) {
        this.music = music;
        this.aiStatus = aiStatus;
        this.localMusic = localMusic;
        this.provider = provider;
        this.model = model;
        var chatModel = models.getIfAvailable();
        this.client = chatModel == null ? null : ChatClient.builder(chatModel).defaultSystem(DEFAULT_PROMPT)
                .defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build()).build();
    }

    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@Valid @RequestBody AgentChatDTO dto, HttpServletRequest request) {
        String owner = owner(request);
        String lease = java.util.UUID.randomUUID().toString();
        if (activeOwners.putIfAbsent(owner, lease) != null) throw new ResponseStatusException(TOO_MANY_REQUESTS, "请先结束当前回复");
        cleanup();
        String conversation = owner + ":" + dto.getConversationId();
        conversations.put(conversation, System.currentTimeMillis());
        SseEmitter emitter = new SseEmitter(120_000L);
        AtomicReference<Disposable> subscription = new AtomicReference<>();
        Runnable release = () -> {
            Disposable pending = subscription.getAndSet(null);
            if (pending != null) pending.dispose();
            if (activeOwners.remove(owner, lease)) cancellations.remove(owner);
        };
        emitter.onCompletion(release);
        emitter.onTimeout(() -> { release.run(); emitter.complete(); });
        emitter.onError(error -> release.run());
        cancellations.put(owner, () -> { release.run(); emitter.complete(); });
        if (client == null) {
            send(emitter, "error", "AI 未启用，请检查模型配置");
            release.run();
            emitter.complete();
            return emitter;
        }
        OnlineAgentTools tools = new OnlineAgentTools(music, localMusic);
        Disposable running = client.prompt().user(dto.getQuery()).tools(tools)
                .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversation))
                .stream().content().timeout(Duration.ofSeconds(90))
                .subscribeOn(reactor.core.scheduler.Schedulers.boundedElastic())
                .subscribe(delta -> {
                    if (!send(emitter, "text", delta)) { release.run(); emitter.complete(); }
                }, error -> {
                    send(emitter, "error", "AI 暂时无法回复：请检查 " + provider + " 服务、模型或密钥，或稍后重试。");
                    release.run();
                    emitter.complete();
                }, () -> {
                    send(emitter, "songs", tools.songs());
                    send(emitter, "done", "");
                    release.run();
                    emitter.complete();
                });
        subscription.set(running);
        if (!lease.equals(activeOwners.get(owner))) running.dispose();
        return emitter;
    }

    @GetMapping("/status")
    public Map<String, Object> status() {
        return aiStatus.status();
    }

    @PostMapping("/cancel")
    public Map<String, Boolean> cancel(HttpServletRequest request) {
        Runnable cancel = cancellations.remove(owner(request));
        if (cancel != null) cancel.run();
        return Map.of("cancelled", cancel != null);
    }

    private String owner(HttpServletRequest request) {
        Map<String, Object> claims = ThreadLocalUtil.get();
        Object userId = claims == null ? null : claims.get("userId");
        return userId == null ? "session:" + request.getSession(true).getId() : "user:" + userId;
    }

    private void cleanup() {
        long cutoff = System.currentTimeMillis() - 30 * 60_000L;
        conversations.forEach((key, lastSeen) -> {
            if (lastSeen < cutoff) { memory.clear(key); conversations.remove(key, lastSeen); }
        });
        if (conversations.size() >= 500) {
            conversations.entrySet().stream().min(Map.Entry.comparingByValue()).ifPresent(entry -> {
                memory.clear(entry.getKey()); conversations.remove(entry.getKey());
            });
        }
    }

    private boolean send(SseEmitter emitter, String name, Object data) {
        try { emitter.send(SseEmitter.event().name(name).data(data)); return true; }
        catch (IOException | IllegalStateException exception) { return false; }
    }
}
