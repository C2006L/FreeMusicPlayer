package com.vibemusic.workspace;

import com.vibemusic.result.Result;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/workspace")
public class WorkspaceController {
    public record Create(@NotBlank @Size(max=500) String link,@NotBlank @Size(max=160) String title,@NotBlank @Pattern(regexp="[a-zA-Z0-9-]{16,64}") String requestKey){}
    public record Rename(@NotBlank @Size(max=160) String title){}
    private final WorkspaceService service;
    public WorkspaceController(WorkspaceService service){this.service=service;}
    @PostMapping("/imports") public Result<?> create(@RequestBody @Valid Create dto){return Result.success(service.create(WorkspaceAccess.userId(),dto.link(),dto.title(),dto.requestKey()));}
    @GetMapping("/imports") public Result<?> jobs(){return Result.success(service.jobs(WorkspaceAccess.userId()));}
    @GetMapping("/imports/{id}") public Result<?> job(@PathVariable String id){return Result.success(service.job(WorkspaceAccess.userId(),id));}
    @GetMapping("/imports/{id}/items") public Result<?> items(@PathVariable String id){return Result.success(service.items(WorkspaceAccess.userId(),id));}
    @PostMapping("/imports/{id}/cancel") public Result<?> cancel(@PathVariable String id){service.cancel(WorkspaceAccess.userId(),id);return Result.success();}
    @PostMapping("/imports/{id}/retry") public Result<?> retry(@PathVariable String id){service.retry(WorkspaceAccess.userId(),id);return Result.success();}
    @GetMapping("/collections") public Result<?> collections(){return Result.success(service.collections(WorkspaceAccess.userId()));}
    @GetMapping("/collections/{id}/songs") public Result<?> songs(@PathVariable String id){return Result.success(service.songs(WorkspaceAccess.userId(),id));}
    @PatchMapping("/collections/{id}") public Result<?> rename(@PathVariable String id,@Valid @RequestBody Rename dto){service.rename(WorkspaceAccess.userId(),id,dto.title());return Result.success();}
    @DeleteMapping("/collections/{id}") public Result<?> delete(@PathVariable String id){service.delete(WorkspaceAccess.userId(),id);return Result.success();}
}
