package com.vibemusic.controller;


import com.vibemusic.model.dto.PlaylistDTO;
import com.vibemusic.model.vo.OnlinePlaylistVO;
import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.model.vo.PlaylistDetailVO;
import com.vibemusic.model.vo.PlaylistVO;
import com.vibemusic.result.PageResult;
import com.vibemusic.result.Result;
import com.vibemusic.service.IPlaylistService;
import com.vibemusic.service.OnlineMusicService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * <p>
 * 前端控制器
 * </p>
 *
 * @author sunpingli
 * @since 2025-01-09
 */
@RestController
@RequestMapping("/playlist")
public class PlaylistController {

    @Autowired
    private IPlaylistService playlistService;

    @Autowired
    private OnlineMusicService onlineMusicService;

    /**
     * 获取所有歌单
     *
     * @param playlistDTO playlistDTO
     * @return 歌单列表
     */
    @PostMapping("/getAllPlaylists")
    public Result<PageResult<PlaylistVO>> getAllPlaylists(@RequestBody @Valid PlaylistDTO playlistDTO) {
        return playlistService.getAllPlaylists(playlistDTO);
    }

    /**
     * 获取推荐歌单
     *
     * @param request request
     * @return 推荐歌单列表
     */
    @GetMapping("/getRecommendedPlaylists")
    public Result<List<PlaylistVO>> getRandomPlaylists(HttpServletRequest request) {
        return playlistService.getRecommendedPlaylists(request);
    }

    /**
     * 获取歌单详情
     *
     * @param playlistId 歌单id
     * @return 歌单详情
     */
    @GetMapping("/getPlaylistDetail/{id}")
    public Result<PlaylistDetailVO> getPlaylistDetail(@PathVariable("id") Long playlistId, HttpServletRequest request) {
        return playlistService.getPlaylistDetail(playlistId, request);
    }

    /**
     * 平台真实推荐歌单。数据库没有可展示歌单时，客户端用这批数据填充首屏。
     */
    @GetMapping("/discoverOnline")
    public Result<List<OnlinePlaylistVO>> discoverOnline(@RequestParam(defaultValue = "24") int limit) {
        try {
            return Result.success(onlineMusicService.discoverPlaylists(limit));
        } catch (Exception exception) {
            return Result.error("在线歌单暂时不可用，请稍后重试");
        }
    }

    /**
     * 在线歌单曲目，仅供播放，不写入本地歌单表。
     */
    @GetMapping("/onlineDetail")
    public Result<List<OnlineSongVO>> onlineDetail(
            @RequestParam String source,
            @RequestParam String id) {
        try {
            return Result.success(onlineMusicService.playlist(source, id));
        } catch (Exception exception) {
            return Result.error("暂时无法读取该在线歌单");
        }
    }

}
