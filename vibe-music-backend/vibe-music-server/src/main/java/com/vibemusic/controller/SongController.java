package com.vibemusic.controller;


import com.vibemusic.model.dto.OnlineSongImportDTO;
import com.vibemusic.model.dto.SongDTO;
import com.vibemusic.model.vo.SongDetailVO;
import com.vibemusic.model.vo.SongVO;
import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.result.PageResult;
import com.vibemusic.result.Result;
import com.vibemusic.service.ISongService;
import com.vibemusic.service.OnlineMusicService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

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
            @RequestParam(defaultValue = "20") int limit) {
        if (keyword.isBlank() || keyword.length() > 100) {
            return Result.error("搜索关键词长度应为 1-100 个字符");
        }
        try {
            return Result.success(onlineMusicService.search(keyword, sources, limit));
        } catch (Exception exception) {
            return Result.error("在线曲库暂时不可用，本地曲库仍可正常播放");
        }
    }

    /**
     * 首页在线推荐。结果中的播放地址是动态解析入口，不依赖 MinIO。
     */
    @GetMapping("/discoverOnline")
    public Result<List<OnlineSongVO>> discoverOnline(@RequestParam(defaultValue = "20") int limit) {
        try {
            return Result.success(onlineMusicService.discover(limit));
        } catch (Exception exception) {
            return Result.error("在线推荐暂时不可用，请稍后重试");
        }
    }

    @GetMapping("/streamOnline")
    public void streamOnline(
            @RequestParam String source,
            @RequestParam String id,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String artist,
            @RequestParam(required = false) String album,
            @RequestParam(required = false) String duration,
            @RequestParam(required = false) String cover,
            @RequestParam(required = false) String extra,
            @RequestParam(required = false) String engine,
            @RequestHeader(value = "Range", required = false) String range,
            HttpServletResponse response) throws IOException {
        onlineMusicService.proxyResource("stream", source, id, range,
                resourceMetadata(name, artist, album, duration, cover, extra, engine), response);
    }

    @GetMapping("/coverOnline")
    public void coverOnline(
            @RequestParam String source,
            @RequestParam String id,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String artist,
            @RequestParam(required = false) String cover,
            @RequestParam(required = false) String engine,
            HttpServletResponse response) throws IOException {
        onlineMusicService.proxyResource("cover", source, id, null,
                resourceMetadata(name, artist, null, null, cover, null, engine), response);
    }

    @GetMapping("/lyricOnline")
    public Result<Map<String, String>> lyricOnline(
            @RequestParam String source,
            @RequestParam String id,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String artist,
            @RequestParam(required = false) String album,
            @RequestParam(required = false) String duration,
            @RequestParam(required = false) String extra,
            @RequestParam(required = false) String engine) {
        try {
            return Result.success(onlineMusicService.lyrics(source, id,
                    resourceMetadata(name, artist, album, duration, null, extra, engine)));
        } catch (Exception exception) {
            return Result.error("暂未找到这首歌的歌词");
        }
    }

    /**
     * 将一首在线歌曲登记为内部歌曲，从而复用现有收藏、歌单和评论关系。
     */
    @PostMapping("/importOnline")
    public Result<Long> importOnline(@RequestBody @Valid OnlineSongImportDTO song) {
        return songService.importOnlineSong(song);
    }

    private static Map<String, String> resourceMetadata(String name, String artist, String album,
                                                         String duration, String cover, String extra, String engine) {
        Map<String, String> metadata = new java.util.LinkedHashMap<>();
        metadata.put("name", name);
        metadata.put("artist", artist);
        metadata.put("album", album);
        metadata.put("duration", duration);
        metadata.put("cover", cover);
        metadata.put("extra", extra);
        metadata.put("engine", engine);
        return metadata;
    }


}
