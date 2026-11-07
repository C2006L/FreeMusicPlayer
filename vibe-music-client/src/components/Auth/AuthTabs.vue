<script setup lang="ts">
import { ref, computed } from 'vue'
import LoginForm from './LoginForm.vue'
import RegisterForm from './RegisterForm.vue'
import ResetPasswordForm from './ResetPasswordForm.vue'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits(['update:modelValue'])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const activeTab = ref('login')

const tabTitles = {
  login: '登录',
  register: '注册',
  reset: '重置密码',
}

const handleSuccess = () => {
  dialogVisible.value = false
}

const handleClose = () => {
  activeTab.value = 'login'
}

const handleSwitchTab = (tab: string) => {
  activeTab.value = tab
}

// 手机键盘弹出后，把获得焦点的输入框滚到弹层可视区域中间，避免被键盘遮挡。
const handleFocusIn = (event: FocusEvent) => {
  const target = event.target as HTMLElement | null
  if (!target || window.innerWidth > 480 || !target.matches('input, textarea')) return
  window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="tabTitles[activeTab]"
    width="min(500px, calc(100vw - 32px))"
    class="auth-dialog"
    destroy-on-close
    @close="handleClose"
    @focusin="handleFocusIn"
  >
    <div>
      <el-tabs v-model="activeTab" class="auth-tabs">
        <el-tab-pane name="login" :label="tabTitles.login">
          <LoginForm @success="handleSuccess" @switch-tab="handleSwitchTab" />
        </el-tab-pane>
        <el-tab-pane name="register" :label="tabTitles.register">
          <RegisterForm
            @success="handleSuccess"
            @switch-tab="handleSwitchTab"
          />
        </el-tab-pane>
        <el-tab-pane name="reset" :label="tabTitles.reset">
          <ResetPasswordForm
            @success="handleSuccess"
            @switch-tab="handleSwitchTab"
          />
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-dialog>
</template>

<style scoped>
.auth-tabs ::v-deep(.el-tabs__nav) {
  width: 100%;
  display: flex;
  justify-content: center; /* 确保导航居中 */
}

.auth-tabs ::v-deep(.el-tabs__item) {
  flex: 1;
  text-align: center;
}
</style>
