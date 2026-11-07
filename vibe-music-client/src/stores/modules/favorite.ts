import { defineStore } from 'pinia'
import { getFavoritePlaylists, getFavoriteSongs, collectPlaylist, cancelCollectPlaylist } from '@/api/system'
import type { ResultTable } from '@/api/system'
import { ElMessage } from 'element-plus'
import coverImg from '@/assets/cover.png'

interface FavoritePlaylist {
  id: number
  name: string
  coverImgUrl: string
}

export const useFavoriteStore = defineStore('favorite', {
  state: () => ({
    favoritePlaylists: [] as FavoritePlaylist[],
    // 收藏的歌曲数量，只统计“喜欢”里的歌曲，与收藏歌单互不影响
    likeCount: 0,
    loading: false
  }),

  actions: {
    // 获取收藏的歌单列表
    async getFavoritePlaylists() {
      try {
        this.loading = true
        const res = await getFavoritePlaylists({
          pageNum: 1,
          pageSize: 50,
          title: '',
          style: ''
        })
        if (res.code === 0 && res.data) {
          const data = res.data as ResultTable['data']
          if (data?.items) {
            this.favoritePlaylists = data.items.map(item => ({
              id: item.playlistId,
              name: item.title,
              coverImgUrl: item.coverUrl ?? coverImg
            }))
          }
        }
      } catch (error) {
        ElMessage.error('获取收藏歌单失败')
      } finally {
        this.loading = false
      }
    },

    // 刷新“喜欢”的歌曲数量；收藏/取消歌曲后调用，保证侧栏与喜欢页即时同步
    async refreshLikeCount() {
      try {
        const res = await getFavoriteSongs({
          pageNum: 1,
          pageSize: 1,
          songName: '',
          artistName: '',
          album: ''
        })
        if (res.code === 0 && res.data) {
          const data = res.data as ResultTable['data']
          this.likeCount = Number(data?.total) || 0
        }
      } catch {
        // 静默失败即可，下一页进入喜欢页时会重新拉取
      }
    },

    // 收藏歌单
    async collectPlaylist(playlistId: number) {
      try {
        const res = await collectPlaylist(playlistId)
        if (res.code === 0) {
          ElMessage.success('收藏成功')
          // 重新获取收藏列表
          this.getFavoritePlaylists()
          return true
        }
        return false
      } catch (error) {
        ElMessage.error('收藏失败')
        return false
      }
    },

    // 取消收藏歌单
    async cancelCollectPlaylist(playlistId: number) {
      try {
        const res = await cancelCollectPlaylist(playlistId)
        if (res.code === 0) {
          ElMessage.success('取消收藏成功')
          // 从列表中移除
          this.favoritePlaylists = this.favoritePlaylists.filter(item => item.id !== playlistId)
          return true
        }
        return false
      } catch (error) {
        ElMessage.error('取消收藏失败')
        return false
      }
    },

    // 清空收藏列表
    clearFavoritePlaylists() {
      this.favoritePlaylists = []
      this.likeCount = 0
    }
  }
}) 