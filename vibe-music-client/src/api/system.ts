import { http } from '@/utils/http'
import { searchRank } from '@/utils/searchRanking'

// Verified complete audio is listed first, then trials, restricted entries, unknown last-but-one.
// Relevance only breaks ties inside the same availability tier.
const availabilityOrder = (song: any) =>
  song.availability === 'full' ? 0
    : song.availability === 'preview' ? 1
    : song.availability === 'restricted' ? 2
    : song.availability === 'unavailable' ? 4 : 3
const rankSongs = (songs: any[], keyword: string) =>
  songs.sort((a, b) => availabilityOrder(a) - availabilityOrder(b) || searchRank(b, keyword) - searchRank(a, keyword))

export type Result = {
  code: number
  message: string
  data?: Array<any> | number | string | object
}

export type ResultTable = {
  code: number
  message: string
  data?: {
    /** 列表数据 */
    items: Array<any>
    /** 总条目数 */
    total?: number
    /** 每页显示条目个数 */
    pageSize?: number
    /** 当前页数 */
    currentPage?: number
  }
}

/** 用户登录 */
export const login = (data: object) => {
  return http<Result>('post', '/user/login', { data })
}

/** 用户登出 */
export const logout = () => {
  return http<Result>('post', '/user/logout')
}

/** 发送邮箱验证码 */
export const sendEmailCode = (email: string) => {
  return http<Result>('get', '/user/sendVerificationCode', {
    params: { email },
  })
}

/** 用户注册 */
export const register = (data: object) => {
  return http<Result>('post', '/user/register', { data })
}

/** 重置密码 */
export const resetPassword = (data: object) => {
  return http<Result>('patch', '/user/resetUserPassword', { data })
}

/** 获取用户信息 */
export const getUserInfo = () => {
  return http<Result>('get', '/user/getUserInfo')
}

/** 更新用户信息 */
export const updateUserInfo = (data: object) => {
  return http<Result>('put', '/user/updateUserInfo', { data })
}

/** 更新用户头像 */
export const updateUserAvatar = (formData: FormData) => {
  return http<Result>('patch', '/user/updateUserAvatar', {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    data: formData,
    transformRequest: [(data) => data], // 防止 axios 处理 FormData
  })
}

/** 注销账号 */
export const deleteUser = () => {
  return http<Result>('delete', '/user/deleteAccount')
}

/** 获取轮播图 */
export const getBanner = () => {
  return http<Result>('get', '/banner/getBannerList')
}

/** 获取推荐歌单 */
export const getRecommendedPlaylists = () => {
  return http<Result>('get', '/playlist/getRecommendedPlaylists')
}

/** 获取推荐歌曲 */
export const getRecommendedSongs = () => {
  return http<Result>('get', '/song/getRecommendedSongs')
}

/** 获取所有歌曲 */
export const getAllSongs = (data: object) => {
  return http<ResultTable>('post', '/song/getAllSongs', { data })
}

/** 聚合搜索在线曲库 */
export const searchOnlineSongs = (
  keyword: string,
  sources?: string[],
  limit = 20,
  signal?: AbortSignal,
  quiet = false
) => {
  return http<Result>('get', '/song/searchOnline', {
    params: { keyword, sources, limit },
    paramsSerializer: { indexes: null },
    signal,
    quiet,
  })
}

/** 按需探测单条在线资源的可播等级；失败或证据不足时保持 unknown。 */
export const probeOnlineSong = (song: any) => {
  return http<Result>('get', '/song/probeOnline', {
    params: {
      source: song.source,
      id: song.sourceUrlId || song.sourceSongId,
      name: song.songName,
      artist: song.artistName,
      album: song.album,
      duration: song.duration,
      cover: song.coverUrl,
      extra: song.sourceExtra,
      engine: song.providerEngine,
    },
    quiet: true,
  })
}

/** Emit actual completed source results; one failed platform does not discard the others. */
export const searchOnlineProgressive = async (
  keyword: string,
  sources: string[] | undefined,
  limit: number,
  signal: AbortSignal,
  update: (songs: any[], states: Record<string, string>) => void
) => {
  const selected = sources || [
    'netease',
    'qq',
    'kugou',
    'kuwo',
    'migu',
    'qianqian',
    'jamendo',
    'bilibili',
  ]
  const states: Record<string, string> = Object.fromEntries(
    selected.map((source) => [source, '搜索中'])
  )
  const rows = new Map<string, any>()
  let successful = 0
  update([], { ...states })
  await Promise.allSettled(
    selected.map(async (source) => {
      try {
        const result = await searchOnlineSongs(
          keyword,
          [source],
          limit,
          signal,
          true
        )
        if (signal.aborted) return
        if (result.code !== 0 || !Array.isArray(result.data))
          throw new Error('source failed')
        successful++
        states[source] = result.data.length ? '已返回' : '无结果'
        for (const song of result.data)
          rows.set(`${song.source}:${song.sourceSongId || song.songId}`, song)
      } catch {
        if (signal.aborted) return
        states[source] = '检索失败'
      }
      if (!signal.aborted) update(rankSongs([...rows.values()], keyword), { ...states })
    })
  )
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return {
    code: successful ? 0 : 1,
    message: successful ? '' : '在线来源暂时不可用',
    data: rankSongs([...rows.values()], keyword),
  }
}

/** 首页在线推荐 */
export const discoverOnlineSongs = (limit = 20) => {
  return http<Result>('get', '/song/discoverOnline', { params: { limit } })
}

/** 获取 B 站完整分 P / 合集目录 */
export const getBilibiliCollection = (bvid: string, signal?: AbortSignal) =>
  http<Result>('get', '/song/bilibiliCollection', {
    params: { bvid },
    signal,
    timeout: 40000,
  })

/** 获取在线歌曲 LRC 歌词 */
export const getOnlineLyrics = (
  source: string,
  id: string,
  metadata: Record<string, unknown> = {}
) => {
  return http<Result>('get', '/song/lyricOnline', {
    params: { source, id, ...metadata },
  })
}

/** 登记在线歌曲，返回可供收藏/歌单关系使用的内部数字 ID */
export const importOnlineSong = (song: object) => {
  return http<Result>('post', '/song/importOnline', { data: song })
}

/** 获取歌曲详情 */
export const getSongDetail = (id: number) => {
  return http<ResultTable>('get', `/song/getSongDetail/${id}`)
}

/** 获取所有歌手 */
export const getAllArtists = (data: object) => {
  return http<ResultTable>('post', '/artist/getAllArtists', { data })
}

/** 获取歌手详情 */
export const getArtistDetail = (id: number) => {
  return http<Result>('get', `/artist/getArtistDetail/${id}`)
}

/** 获取所有歌单 */
export const getAllPlaylists = (data: object) => {
  return http<ResultTable>('post', '/playlist/getAllPlaylists', { data })
}

/** 获取歌单详情 */
export const getPlaylistDetail = (id: number) => {
  return http<Result>('get', `/playlist/getPlaylistDetail/${id}`)
}

/** 获取用户收藏的歌曲 */
export const getFavoriteSongs = (data: object) => {
  return http<Result>('post', '/favorite/getFavoriteSongs', { data })
}

/** 收藏歌曲 */
export const collectSong = (songId: number) => {
  return http<Result>('post', '/favorite/collectSong', { params: { songId } })
}

/** 取消收藏歌曲 */
export const cancelCollectSong = (songId: number) => {
  return http<Result>('delete', '/favorite/cancelCollectSong', {
    params: { songId },
  })
}

/** 获取用户收藏的歌单 */
export const getFavoritePlaylists = (data: object) => {
  return http<Result>('post', '/favorite/getFavoritePlaylists', { data })
}

/** 收藏歌单 */
export const collectPlaylist = (playlistId: number) => {
  return http<Result>('post', '/favorite/collectPlaylist', {
    params: { playlistId },
  })
}

/** 取消收藏歌单 */
export const cancelCollectPlaylist = (playlistId: number) => {
  return http<Result>('delete', '/favorite/cancelCollectPlaylist', {
    params: { playlistId },
  })
}

/** 新增歌曲评论 */
export const addSongComment = (data: object) => {
  return http<Result>('post', '/comment/addSongComment', { data })
}

/** 新增歌单评论 */
export const addPlaylistComment = (data: object) => {
  return http<Result>('post', '/comment/addPlaylistComment', { data })
}

/** 点赞评论 */
export const likeComment = (commentId: number) => {
  return http<Result>('patch', `/comment/likeComment/${commentId}`)
}

/** 取消点赞评论 */
export const cancelLikeComment = (commentId: number) => {
  return http<Result>('patch', `/comment/cancelLikeComment/${commentId}`)
}

/** 删除评论 */
export const deleteComment = (commentId: number) => {
  return http<Result>('delete', `/comment/deleteComment/${commentId}`)
}

/** 新增反馈 */
export const addFeedback = (data: { content: string }) => {
  return http<Result>('post', '/feedback/addFeedback', { params: data })
}
