package com.vibemusic.workspace;
import com.vibemusic.result.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/workspace/listening")
public class ListeningController {
    public record Event(@Pattern(regexp="[a-fA-F0-9-]{36}") @NotBlank String sessionId,
        @NotBlank @Size(max=128) String songId,@NotBlank @Size(max=256) String title,
        @NotNull @Size(max=256) String artist,@Pattern(regexp="[a-zA-Z0-9_-]{1,24}") @NotBlank String source,
        @Min(0) @Max(86400) int playedSeconds,@Min(0) @Max(86400) int position){}
    private final ListeningService service;
    public ListeningController(ListeningService service){this.service=service;}
    @PostMapping public Result<?> report(@Valid @RequestBody Event event){service.report(WorkspaceAccess.userId(),event);return Result.success();}
    @GetMapping public Result<?> stats(){return Result.success(service.stats(WorkspaceAccess.userId()));}
}
