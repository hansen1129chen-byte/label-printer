<template>
  <div id="app-root">
    <el-container v-if="showLayout">
      <el-header class="app-header">
        <div class="header-left">
          <span class="logo">PARFCO</span>
          <span class="subtitle">Label Printer</span>
        </div>
        <div class="header-right">
          <span class="user-name">{{ user?.username }}</span>
          <el-button size="small" @click="goProfile">Profile</el-button>
          <el-button size="small" type="danger" plain @click="handleLogout">Logout</el-button>
        </div>
      </el-header>
      <el-container>
        <el-aside width="200px" class="app-sidebar">
          <el-menu :default-active="activeMenu" router :collapse="false">
            <el-menu-item index="/orders">
              <el-icon><Document /></el-icon> Orders
            </el-menu-item>
            <el-menu-item index="/shipping">
              <el-icon><Van /></el-icon> Shipping
            </el-menu-item>
            <el-menu-item index="/products">
              <el-icon><Goods /></el-icon> Products
            </el-menu-item>
            <el-menu-item v-if="user?.role === 'admin'" index="/config">
              <el-icon><Setting /></el-icon> Configuration
            </el-menu-item>
            <el-menu-item index="/stats">
              <el-icon><DataAnalysis /></el-icon> Statistics
            </el-menu-item>
            <el-menu-item v-if="user?.role === 'admin'" index="/accounts">
              <el-icon><UserFilled /></el-icon> Accounts
            </el-menu-item>
          </el-menu>
        </el-aside>
        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
    <router-view v-else />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getUser, logout } from './utils/auth'

const route = useRoute()
const router = useRouter()
const user = ref(getUser())
watch(() => route.path, () => { user.value = getUser() })

const showLayout = computed(() => route.path !== '/login')
const activeMenu = computed(() => {
  const p = route.path
  if (p.startsWith('/orders')) return '/orders'
  if (p.startsWith('/shipping')) return '/shipping'
  if (p.startsWith('/products')) return '/products'
  if (p.startsWith('/config')) return '/config'
  if (p.startsWith('/stats')) return '/stats'
  if (p.startsWith('/accounts')) return '/accounts'
  if (p.startsWith('/profile')) return '/orders'
  return '/orders'
})

function goProfile() { router.push('/profile') }
function handleLogout() { if (confirm('Logout?')) { logout(); router.replace('/login') } }
</script>

<style scoped>
.app-header { display:flex; justify-content:space-between; align-items:center; background:#1a1a2e; color:#fff; height:56px; padding:0 20px; }
.header-left { display:flex; align-items:baseline; gap:12px; }
.logo { font-size:20px; font-weight:800; letter-spacing:2px; color:#409eff; }
.subtitle { font-size:12px; color:#999; }
.header-right { display:flex; align-items:center; gap:10px; }
.user-name { color:#ccc; font-size:13px; }
.app-sidebar { background:#fafafa; border-right:1px solid #eee; min-height:calc(100vh - 56px); }
.app-main { background:#f5f7fa; padding:20px; min-height:calc(100vh - 56px); }
</style>
