package com.vibemusic.controller;


import com.vibemusic.model.dto.SongDTO;
import com.vibemusic.model.vo.SongDetailVO;
import com.vibemusic.model.vo.SongVO;
import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.result.PageResult;
import com.vibemusic.result.Result;
import com.vibemusic.service.ISongService;
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
@RequestMapping("/song")
public class SongController {

    @Autowired
    private ISongService songService;

    @Autowired
    private OnlineMusicService onlineMusicService;

    /**
     * 获取所有歌曲
     *
     * @param songDTO songDTO
     * @return 歌曲列表
     */
    @PostMapping("/getAllSongs")
    public Result<PageResult<SongVO>> getAllSongs(@RequestBody @Valid SongDTO songDTO, HttpServletRequest request) {
        return songService.getAllSongs(songDTO, request);
    }

    /**
     * 获取推荐歌曲
     * 推荐歌曲的数量为 20
     *
     * @param request 请求
     * @return 推荐歌曲列表
     */
    @GetMapping("/getRecommendedSongs")
    public Result<List<SongVO>> getRecommendedSongs(HttpServletRequest request) {
        return songService.getRecommendedSongs(request);
    }

    /**
     * 获取歌曲详情
     *
     * @param songId 歌曲id
     * @return 歌曲详情
     */
    @GetMapping("/getSongDetail/{id}")
    public Result<SongDetailVO> getSongDetail(@PathVariable("id") Long songId, HttpServletRequest request) {
        return songService.getSongDetail(songId, request);
    }

    /**
     * 聚合搜索外部音乐平台。单个上游失败不会影响本地曲库搜索。
     */
    @GetMapping("/searchOnline")
    public Result<List<OnlineSongVO>> searchOnline(
            @RequestParam String keyword,
            @RequestParam(required = false) List<String> sources,
            @RequestParam(defaultValue = "5") int limit) {
        if (keyword.isBlank() || keyword.length() > 100) {
            return Result.error("搜索关键词长度应为 1-100 个字符");
        }
        try {
            return Result.success(onlineMusicService.search(keyword, sources, limit));
        } catch (Exception exception) {
            return Result.error("在线曲库暂时不可用，本地曲库仍可正常播放");
        }
    }


}
