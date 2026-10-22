<script setup lang="ts">
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { loginRules } from "./utils/rule";
import { useNav } from "@/layout/hooks/useNav";
import type { FormInstance } from "element-plus";
import { useLayout } from "@/layout/hooks/useLayout";
import { useUserStoreHook } from "@/store/modules/user";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { ref, reactive, onMounted, onBeforeUnmount } from "vue";
import { useDataThemeChange } from "@/layout/hooks/useDataThemeChange";
import { addPathMatch, getTopMenu } from "@/router/utils";
import { usePermissionStoreHook } from "@/store/modules/permission";

import dayIcon from "@/assets/svg/day.svg?component";
import darkIcon from "@/assets/svg/dark.svg?component";
import Lock from "@iconify-icons/ri/lock-fill";
import User from "@iconify-icons/ri/user-3-fill";
import brandLogo from "@/assets/logo.svg?url";

defineOptions({
  name: "Login"
});
const router = useRouter();
const loading = ref(false);
const ruleFormRef = ref<FormInstance>();

const { initStorage } = useLayout();
initStorage();

const { dataTheme, overallStyle, dataThemeChange } = useDataThemeChange();
dataThemeChange(overallStyle.value);
const { title } = useNav();

const ruleForm = reactive({
  username: "admin_1",
  password: "123456abc"
});

const onLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate((valid, fields) => {
    if (valid) {
      loading.value = true;
      useUserStoreHook()
        .loginByUsername({
          username: ruleForm.username,
          password: ruleForm.password
        })
        .then(res => {
          if (res.code === 0) {
            usePermissionStoreHook().handleWholeMenus([]);
            addPathMatch();
            // 获取后端路由
            router.push(getTopMenu(true).path).then(() => {
              message("登录成功", { type: "success" });
            });
          } else {
            message("登录失败，" + res.message, { type: "error" });
          }
        })
        .catch(error => {
          // 处理网络错误或其他异常
          message("登录失败，请检查网络连接或稍后重试。", { type: "error" });
          console.error("登录错误：", error);
        })
        .finally(() => (loading.value = false));
    }
  });
};

/** 使用公共函数，避免`removeEventListener`失效 */
function onkeypress({ code }: KeyboardEvent) {
  if (["Enter", "NumpadEnter"].includes(code)) {
    onLogin(ruleFormRef.value);
  }
}

onMounted(() => {
  window.document.addEventListener("keypress", onkeypress);
});

onBeforeUnmount(() => {
  window.document.removeEventListener("keypress", onkeypress);
});
</script>

<template>
  <main class="login-page select-none">
    <div class="theme-toggle">
      <!-- 主题 -->
      <el-switch
        v-model="dataTheme"
        inline-prompt
        :active-icon="dayIcon"
        :inactive-icon="darkIcon"
        @change="dataThemeChange"
      />
    </div>
    <section class="login-intro" aria-label="FreeMusicPlayer 管理控制台介绍">
      <div class="brand-lockup">
        <img :src="brandLogo" alt="" />
        <span>FreeMusicPlayer</span>
      </div>
      <div class="intro-copy">
        <p class="eyebrow">CONTENT OPERATIONS</p>
        <h1>让曲库管理<br />保持清晰与克制</h1>
        <p class="intro-description">
          在一个统一的工作区维护歌曲、歌手、歌单、用户与内容反馈。
        </p>
      </div>
      <div class="intro-meta">
        <span>LOCAL FIRST</span><span>MULTI SOURCE</span
        ><span>PRIVATE CONSOLE</span>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-form">
        <div class="form-heading">
          <p class="eyebrow">ADMIN ACCESS</p>
          <h2>登录管理控制台</h2>
          <p>使用管理员账号继续访问 {{ title }}</p>
        </div>

        <el-form
          ref="ruleFormRef"
          :model="ruleForm"
          :rules="loginRules"
          size="large"
          label-position="top"
        >
          <el-form-item
            :rules="[
              {
                required: true,
                message: '请输入用户名',
                trigger: 'blur'
              }
            ]"
            prop="username"
          >
            <el-input
              v-model="ruleForm.username"
              clearable
              placeholder="请输入管理员用户名"
              :prefix-icon="useRenderIcon(User)"
            />
          </el-form-item>

          <el-form-item prop="password">
            <el-input
              v-model="ruleForm.password"
              clearable
              show-password
              placeholder="请输入密码"
              :prefix-icon="useRenderIcon(Lock)"
            />
          </el-form-item>

          <el-button
            class="login-submit w-full mt-4"
            size="default"
            type="primary"
            :loading="loading"
            @click="onLogin(ruleFormRef)"
          >
            登录控制台
          </el-button>
        </el-form>
        <p class="login-note">仅限授权管理员访问 · 登录行为由本地服务验证</p>
      </div>
    </section>
  </main>
</template>

<style lang="scss" scoped>
:global(body) {
  margin: 0;
  background: var(--fmp-bg);
}

.login-page {
  display: grid;
  grid-template-columns: minmax(420px, 1.35fr) minmax(380px, 0.65fr);
  width: 100vw;
  min-height: 100vh;
  color: var(--fmp-text);
  background: var(--fmp-bg);
}

.theme-toggle {
  position: fixed;
  top: 24px;
  right: 28px;
  z-index: 3;
}

.login-intro {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  padding: 42px clamp(38px, 7vw, 112px);
  overflow: hidden;
  color: #f5f1ed;
  background: linear-gradient(rgb(255 255 255 / 3%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 3%) 1px, transparent 1px), #101114;
  background-size: 64px 64px;
}

.login-intro::after {
  position: absolute;
  right: -180px;
  bottom: -220px;
  width: 520px;
  height: 520px;
  content: "";
  border: 1px solid rgb(239 111 82 / 36%);
  border-radius: 50%;
  box-shadow:
    0 0 0 72px rgb(239 111 82 / 4%),
    0 0 0 144px rgb(239 111 82 / 2%);
}

.brand-lockup {
  z-index: 1;
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.brand-lockup img {
  width: 32px;
  height: 32px;
}

.intro-copy {
  z-index: 1;
  max-width: 660px;
}

.eyebrow {
  margin: 0 0 14px;
  color: var(--fmp-accent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: 0.22em;
}

.intro-copy h1 {
  margin: 0;
  font-family: "Noto Serif SC", "Songti SC", serif;
  font-size: clamp(42px, 5vw, 72px);
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -0.045em;
}

.intro-description {
  max-width: 500px;
  margin: 28px 0 0;
  color: rgb(245 241 237 / 58%);
  font-size: 15px;
  line-height: 1.9;
}

.intro-meta {
  z-index: 1;
  display: flex;
  gap: 28px;
  color: rgb(245 241 237 / 36%);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.14em;
}

.login-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 72px 48px;
  background: var(--fmp-surface);
}

.login-form {
  width: min(100%, 380px);
}

.form-heading {
  margin-bottom: 38px;
}

.form-heading h2 {
  margin: 0 0 10px;
  color: var(--fmp-text);
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.035em;
}

.form-heading > p:last-child,
.login-note {
  color: var(--fmp-text-muted);
  font-size: 13px;
}

.login-submit {
  height: 46px;
  margin-top: 10px !important;
}

.login-note {
  margin: 24px 0 0;
  text-align: center;
}

:deep(.el-input-group__append, .el-input-group__prepend) {
  padding: 0;
}

:deep(.el-form-item) {
  margin-bottom: 22px;
}

:deep(.el-input__wrapper) {
  min-height: 44px;
}

@media (width <= 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }

  .login-intro {
    min-height: 280px;
    padding: 32px;
  }

  .intro-copy h1 {
    font-size: 38px;
  }

  .intro-description,
  .intro-meta {
    display: none;
  }

  .login-panel {
    min-height: calc(100vh - 280px);
    padding: 54px 24px;
  }
}
</style>
