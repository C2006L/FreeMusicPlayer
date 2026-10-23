<script setup lang="ts">
import { nextTick, reactive, ref, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'
import { streamAgentChat, getAgentStatus, cancelAgentChat } from '@/api/agent'
import type { Song } from '@/api/interface'
import { stripVibeSongsTag } from '@/utils/agent'
import { songToTrack } from '@/utils/songTrack'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'
import MdView from '@/components/Agent/MdView.vue'
import default_album from '@/assets/default_album.jpg'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  songs: Song[]
  loading?: boolean
}

const audio = AudioStore()
const { loadTrack, play } = useAudioPlayer()

const open = ref(false)
const input = ref('')
const messages = ref<ChatMessage[]>([])
const messageListEl = ref<HTMLElement | null>(null)
const streaming = ref(false)
const cancelling = ref(false)
const serviceLabel = ref('正在检查 AI 服务')
let generation = 0
let abortController: AbortController | null = null

// 会话 id 持久化，刷新页面后仍能延续对话记忆
const conversationId = ref(
  sessionStorage.getItem('fmp-agent-conversation-id') || crypto.randomUUID()
)
sessionStorage.setItem('fmp-agent-conversation-id', conversationId.value)

watch(open, async (value) => {
  if (!value) return
  try { const status = await getAgentStatus(); serviceLabel.value = status.configured ? `${status.provider} · ${status.model}` : status.message }
  catch (error: any) { serviceLabel.value = error.message }
})
onUnmounted(() => abortController?.abort())

const suggestions = [
  '推荐几首摇滚歌曲',
  '心情低落的时候听什么好？',
  '有哪些好听的流行歌',
]

const scrollToBottom = async () => {
  await nextTick()
  if (messageListEl.value) {
    messageListEl.value.scrollTop = messageListEl.value.scrollHeight
  }
}

const send = async () => {
  const text = input.value.trim()
  if (!text || streaming.value || cancelling.value) return

  input.value = ''
  messages.value.push({ role: 'user', content: text, songs: [] })
  // 必须用 reactive 包装，流式中直接改 assistantMsg.content 才能触发响应式更新；
  // 否则改的是 push 进数组前那个原始对象，界面只在请求结束时一次性刷新
  const assistantMsg = reactive<ChatMessage>({
    role: 'assistant',
    content: '',
    songs: [],
    loading: true,
  })
  messages.value.push(assistantMsg)
  streaming.value = true
  abortController = new AbortController()
  const requestGeneration = ++generation
  await scrollToBottom()

  try {
    await streamAgentChat(
      conversationId.value,
      text,
      (delta) => {
        if (requestGeneration !== generation) return
        assistantMsg.content += delta
        scrollToBottom()
      },
      abortController.signal,
      (songs) => { if (requestGeneration === generation) assistantMsg.songs = songs }
    )
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      assistantMsg.content += `\n\n${error?.message || 'AI 服务暂时无法连接，请稍后重试。'}`
      ElMessage.error(error?.message || 'AI 请求失败')
    }
  } finally {
    assistantMsg.loading = false
    if (requestGeneration === generation) {
      streaming.value = false
      abortController = null
      if (!assistantMsg.content) assistantMsg.content = '本次生成已停止。'
    }
    await scrollToBottom()
  }
}

// 播放推荐歌曲：加入播放队列并立即播放
const playSong = async (song: Song) => {
  try {
    if (!song.audioUrl) {
      ElMessage.warning('该歌曲暂无播放资源')
      return
    }
    audio.addTracks(songToTrack(song))
    await loadTrack()
    await play()
  } catch {
    ElMessage.error('播放失败，请重试')
  }
}

// 新建会话：清空记忆与聊天记录
const stopGenerating = async () => {
  cancelling.value = true
  abortController?.abort()
  try { await cancelAgentChat() } catch { /* Local abort remains available if the server is offline. */ }
  finally { abortController?.abort(); cancelling.value = false }
}
const newConversation = async () => {
  if (streaming.value) await stopGenerating()
  generation++
  streaming.value = false
  abortController = null
  messages.value = []
  conversationId.value = crypto.randomUUID()
  sessionStorage.setItem('fmp-agent-conversation-id', conversationId.value)
  ElMessage.success('已开启新会话')
}
</script>

<template>
  <!-- 悬浮入口按钮 -->
  <button
    v-if="!open"
    class="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-primary/30 flex items-center justify-center transition-all duration-300 ease-spring hover:scale-110 hover:rotate-6 z-[100]"
    aria-label="打开 FreeMusic Assistant"
    @click="open = true"
  >
    <Icon icon="mdi:robot-outline" class="text-2xl" />
  </button>

  <!-- 聊天面板 -->
  <Transition
    enter-active-class="transition duration-300 ease-spring"
    enter-from-class="opacity-0 translate-y-4 scale-95"
    leave-active-class="transition duration-200 ease-out-soft"
    leave-to-class="opacity-0 translate-y-4 scale-95"
  >
    <div
      v-if="open"
      class="fixed bottom-24 right-6 w-[400px] max-w-[calc(100vw-3rem)] h-[560px] max-h-[calc(100vh-9rem)] bg-card border border-border rounded-2xl shadow-xl flex flex-col overflow-hidden z-[100]"
    >
      <!-- 头部 -->
      <div
        class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-background"
      >
        <div
          class="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center"
        >
          <Icon icon="mdi:robot-outline" class="text-xl" />
        </div>
        <div class="leading-tight">
          <div class="font-serif-display font-bold tracking-tight">
            FreeMusic Assistant
          </div>
          <div class="text-xs text-muted-foreground">{{ serviceLabel }}</div>
        </div>
        <div class="ml-auto flex items-center gap-1">
          <el-tooltip content="新会话" placement="bottom">
            <button
              class="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-hoverMenuBg transition-all duration-300"
              @click="newConversation"
              aria-label="新会话"
              :disabled="cancelling"
            >
              <Icon icon="mdi:chat-plus-outline" class="text-lg" />
            </button>
          </el-tooltip>
          <button
            class="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-hoverMenuBg transition-all duration-300"
            aria-label="关闭"
            @click="open = false"
          >
            <Icon icon="mdi:close" class="text-lg" />
          </button>
        </div>
      </div>

      <!-- 消息区 -->
      <div
        ref="messageListEl"
        class="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        <!-- 欢迎态 -->
        <div
          v-if="messages.length === 0"
          class="pt-6 flex flex-col items-center gap-4 text-center"
        >
          <div
            class="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center"
          >
            <Icon icon="mdi:music-note-eighth" class="text-3xl" />
          </div>
          <div>
            <div class="font-serif-display font-bold text-lg">
              Hi，想听点什么？
            </div>
            <div class="text-sm text-muted-foreground mt-1">
              告诉我你的心情、风格或歌手，我来为你推荐音乐
            </div>
          </div>
          <div class="flex flex-col gap-2 w-full px-6">
            <button
              v-for="(item, index) in suggestions"
              :key="index"
              class="text-sm text-primary border border-primary/30 rounded-full py-1.5 px-4 hover:bg-primary hover:text-white transition-all duration-300"
              @click="input = item"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <template v-for="(msg, index) in messages" :key="index">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="flex justify-end">
            <div
              class="max-w-[80%] bg-primary text-white text-sm leading-relaxed rounded-2xl rounded-br-md px-4 py-2.5 whitespace-pre-wrap"
            >
              {{ msg.content }}
            </div>
          </div>

          <!-- 助手消息 -->
          <div v-else class="flex gap-2.5">
            <div
              class="w-8 h-8 mt-0.5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"
            >
              <Icon icon="mdi:robot-outline" class="text-base" />
            </div>
            <div class="flex-1 min-w-0 space-y-2">
              <div
                class="text-sm leading-relaxed bg-hoverMenuBg rounded-2xl rounded-tl-md px-4 py-2.5"
              >
                <span v-if="!msg.content && msg.loading">正在思考...</span>
                <MdView v-else :content="stripVibeSongsTag(msg.content)" />
              </div>

              <!-- 推荐歌曲卡片 -->
              <div
                v-if="msg.songs.length"
                class="space-y-2 max-h-56 overflow-y-auto"
              >
                <div
                  v-for="song in msg.songs"
                  :key="song.songId"
                  class="group flex items-center gap-3 bg-background border border-border rounded-xl p-2 cursor-pointer hover:border-primary/40 hover:shadow-paper transition-all duration-300"
                  @click="playSong(song)"
                >
                  <el-image
                    lazy
                    :src="song.coverUrl || default_album"
                    class="w-10 h-10 rounded-lg flex-shrink-0"
                    :alt="song.songName"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-sm line-clamp-1 font-medium">
                      {{ song.songName }}
                    </div>
                    <div class="text-xs text-muted-foreground line-clamp-1">
                      {{ song.artistName }} · {{ song.album }}
                    </div>
                  </div>
                  <button
                    class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center transition-all duration-300 hover:scale-110 flex-shrink-0"
                    aria-label="播放"
                    @click.stop="playSong(song)"
                  >
                    <Icon icon="mdi:play" class="text-base" />
                  </button>
                </div>
              </div>

              <!-- 流式加载指示 -->
              <div v-if="msg.loading && msg.content" class="flex gap-1 pl-1">
                <span
                  class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style="animation-delay: 0ms"
                ></span>
                <span
                  class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style="animation-delay: 150ms"
                ></span>
                <span
                  class="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                  style="animation-delay: 300ms"
                ></span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- 输入区 -->
      <div class="px-4 py-3 border-t border-border bg-background">
        <div
          class="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary/50 transition-all duration-300"
        >
          <input
            v-model="input"
            type="text"
            class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="告诉我你想听什么..."
            maxlength="2000"
            @keyup.enter="!$event.isComposing && send()"
          />
          <button v-if="streaming" class="text-xs text-primary shrink-0" :disabled="cancelling" @click="stopGenerating" aria-label="停止生成">{{ cancelling ? '停止中' : '停止' }}</button>
          <button
            class="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 flex-shrink-0"
            :disabled="streaming || cancelling || !input.trim()"
            aria-label="发送"
            @click="send"
          >
            <Icon icon="mdi:send" class="text-base" />
          </button>
        </div>
        <div class="text-[10px] text-muted-foreground/70 text-center mt-1.5">
          推荐来自在线查询，播放能力以实际音源为准
        </div>
      </div>
    </div>
  </Transition>
</template>
