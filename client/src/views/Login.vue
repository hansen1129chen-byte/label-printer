<template>
  <div class="login-wrap">
    <div class="login-card">
      <h1>PARFCO</h1>
      <p class="sub">Label Printer System</p>
      <el-form @submit.prevent="handleLogin" label-position="top">
        <el-form-item label="Username"><el-input v-model="username" placeholder="Enter username" /></el-form-item>
        <el-form-item label="Password"><el-input v-model="password" type="password" show-password placeholder="Enter password" /></el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading" style="width:100%">Login</el-button>
      </el-form>
      <p v-if="error" class="err">{{ error }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '../api'
import { setToken, setUser } from '../utils/auth'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  loading.value = true; error.value = ''
  try {
    const { data } = await api.post('/auth/login', { username: username.value, password: password.value })
    setToken(data.token); setUser(data.user)
    router.replace('/orders')
  } catch (err) { error.value = err.response?.data?.message || 'Login failed' }
  finally { loading.value = false }
}
</script>

<style scoped>
.login-wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); }
.login-card { width:400px; padding:40px; background:#fff; border-radius:12px; box-shadow:0 8px 32px rgba(0,0,0,0.2); }
.login-card h1 { text-align:center; font-size:28px; letter-spacing:4px; color:#409eff; margin-bottom:4px; }
.sub { text-align:center; color:#999; font-size:13px; margin-bottom:24px; }
.err { color:#f56c6c; text-align:center; margin-top:12px; }
</style>
