import { defineStore } from 'pinia'
import piniaPersistConfig from '@/stores/helper/persist'
import { ThemeState } from '@/stores/interface'
/**
 * 主题设置
 */
export const themeStore = defineStore({
  id: 'themeStore',
  state: (): ThemeState => ({
    isDark: false,
    primary: '#7E22CE',
  }),
  actions: {
    setDark(isDark: string | number | boolean) {
      this.isDark = isDark
      // 同步浏览器地址栏 / 移动端顶栏颜色
      if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="theme-color"]')
        if (meta) meta.setAttribute('content', Boolean(isDark) ? '#0e0f12' : '#faf7f2')
      }
    },
    setPrimary(primary: string) {
      this.primary = primary
    },
  },
  persist: piniaPersistConfig('ThemeStore'),
})
