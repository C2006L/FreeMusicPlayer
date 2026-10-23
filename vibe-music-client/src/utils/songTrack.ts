import type { Song } from '@/api/interface'
import type { trackModel } from '@/stores/interface'
import defaultAlbum from '@/assets/default_album.jpg'

export const songToTrack = (song: Song): trackModel => ({
  id: String(song.songId), title: song.songName, artist: song.artistName,
  album: song.album, cover: song.coverUrl || defaultAlbum, url: song.audioUrl,
  duration: Number(song.duration) || 0, likeStatus: song.likeStatus || 0,
  source: song.source, sourceName: song.sourceName, sourceSongId: song.sourceSongId,
  sourceUrlId: song.sourceUrlId, sourcePicId: song.sourcePicId,
  sourceLyricId: song.sourceLyricId, sourceExtra: song.sourceExtra,
  providerEngine: song.providerEngine, availability: song.availability,
  online: song.online, vip: song.vip,
})
