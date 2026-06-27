<template>
  <div class="min-h-screen flex flex-col relative overflow-hidden">
    <!-- Fixed Navbar -->
    <nav :class="['fixed top-0 left-0 right-0 z-50 h-16 flex items-center px-6 md:px-12 transition-all duration-300', scrolled ? 'bg-[#FAF8F5]/80 backdrop-blur-md' : 'bg-transparent']">
      <button v-if="showResults" @click="goBack" class="flex items-center gap-1.5 text-sm text-[#8A8A8A] hover:text-[#1A1A1A] transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        返回
      </button>
    </nav>

    <!-- ==================== SEARCH VIEW ==================== -->
    <template v-if="!showResults">
      <!-- Background perfume -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none z-0 select-none fade-in-bg">
        <img src="/perfume-bg.png" alt="" class="w-[300px] sm:w-[380px] md:w-[460px] opacity-[0.07] object-contain" />
      </div>

      <section class="flex-1 flex flex-col items-center justify-start px-6 pt-24 sm:pt-28 md:pt-32 relative z-10">
        <div class="w-full max-w-md">
          <!-- Logo -->
          <div class="flex justify-center mb-6 md:mb-8 fade-in-up-1">
            <img src="/logo.png" alt="PARFCO" class="h-14 sm:h-18 md:h-22 w-auto object-contain" />
          </div>

          <!-- Title -->
          <div class="text-center mb-8 md:mb-10 fade-in-up-2">
            <h1 class="text-2xl md:text-3xl text-[#1A1A1A] mb-2" style="font-family: 'EB Garamond', serif">查询您的订单</h1>
            <p class="text-sm text-[#8A8A8A]">跟踪包裹状态，掌握每一程动向</p>
          </div>

          <!-- Input fields -->
          <div class="space-y-4 fade-in-up-3">
            <!-- Phone -->
            <div class="bg-white/80 backdrop-blur-sm border border-[#EBE5DA] rounded-xl px-4 py-3 shadow-sm">
              <div class="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#BFBFBF] shrink-0"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                <input v-model="phone" type="tel" placeholder="请输入收货人手机号" maxlength="11" :disabled="loading" class="flex-1 text-sm text-[#1A1A1A] placeholder-[#BFBFBF] bg-transparent outline-none disabled:opacity-50 min-w-0" @keydown.enter="search" />
              </div>
            </div>

            <!-- Order / Tracking -->
            <div class="bg-white/80 backdrop-blur-sm border border-[#EBE5DA] rounded-xl px-4 py-3 shadow-sm">
              <div class="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-[#BFBFBF] shrink-0"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                <input v-model="trackingNo" type="text" placeholder="请输入您的订单号或者物流单号" :disabled="loading" class="flex-1 text-sm text-[#1A1A1A] placeholder-[#BFBFBF] bg-transparent outline-none disabled:opacity-50 min-w-0" @keydown.enter="search" />
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="bg-[#C4735E]/10 border border-[#C4735E]/20 rounded-xl px-4 py-3 text-center">
              <p class="text-sm text-[#C4735E] font-medium">{{ error }}</p>
            </div>

            <!-- Query Button -->
            <button @click="search" :disabled="loading" class="w-full bg-[#C9A96E] text-white text-sm font-medium py-3 rounded-full hover:bg-[#B8945A] disabled:opacity-50 transition-all duration-300 flex items-center justify-center gap-2">
              <span v-if="loading" class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <template v-else>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                查询
              </template>
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- ==================== RESULTS VIEW ==================== -->
    <template v-else>
      <main class="flex-1 pt-24 pb-16 px-6">
        <div class="max-w-2xl mx-auto">
          <!-- Overview Card -->
          <div class="bg-white rounded-xl p-6 md:p-8 shadow-[0_8px_32px_rgba(26,26,26,0.04)] fade-in-up-1">
            <!-- Status Badge -->
            <div class="flex items-center gap-1.5 text-xs font-medium text-[#C9A96E] bg-[#C9A96E]/10 px-3 py-1 rounded-full w-fit mb-4">
              <span class="w-1.5 h-1.5 rounded-full bg-[#C9A96E]" :class="{ 'animate-pulse': currentOrder.shipping_status === 'in_transit' || currentOrder.shipping_status === 'pending' }" />
              {{ statusLabel(currentOrder.shipping_status) }}
            </div>

            <!-- Tracking Number -->
            <div class="flex items-center gap-3 mb-6">
              <span class="text-lg text-[#1A1A1A] tracking-wide" style="font-family: 'Space Mono', monospace">{{ currentOrder.gig_tracking || currentOrder.order_no }}</span>
              <button @click="copyTracking" class="p-1.5 rounded-lg hover:bg-[#F5EFE6] transition-colors text-[#8A8A8A] hover:text-[#1A1A1A]">
                <svg v-if="!copied" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>

            <!-- Progress Bar -->
            <div class="flex items-start gap-2 mb-6">
              <div v-for="(step, i) in progressSteps" :key="step.label" class="flex-1 flex flex-col items-center gap-2">
                <div :class="['w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300', i <= progressStep ? 'bg-[#C9A96E] text-white' : 'bg-[#EBE5DA] text-[#BFBFBF]', i === progressStep ? 'ring-4 ring-[#C9A96E]/20' : '']">
                  <svg v-if="step.icon === 'package'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                  <svg v-else-if="step.icon === 'truck'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <svg v-else-if="step.icon === 'mappin'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.25-8 13-8 13s-8-7.75-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <span :class="['text-xs', i <= progressStep ? 'text-[#1A1A1A]' : 'text-[#BFBFBF]']">{{ step.label }}</span>
              </div>
            </div>

            <!-- Order Info -->
            <div class="text-sm text-[#8A8A8A] space-y-1">
              <p>订单号：{{ currentOrder.order_no }}</p>
              <p>收件人：{{ currentOrder.customer_name }} · {{ currentOrder.masked_phone }}</p>
              <p v-if="currentOrder.delivery_method">物流：{{ currentOrder.delivery_method.toUpperCase() }}</p>
            </div>
          </div>

          <!-- Timeline -->
          <div v-if="currentOrder.events && currentOrder.events.length > 0" class="mt-8 relative pl-6 fade-in-up-2">
            <div class="absolute left-[11px] top-3 bottom-3 w-px bg-[#EBE5DA]" />
            <div v-for="(evt, i) in currentOrder.events" :key="i" class="relative py-5">
              <!-- Dot -->
              <div v-if="i === currentOrder.events.length - 1" class="absolute left-0 top-5 w-3 h-3 rounded-full bg-[#C9A96E] ring-4 ring-[#C9A96E]/20 -translate-x-[1px]" />
              <div v-else class="absolute left-[7px] top-[22px] w-2 h-2 rounded-full bg-[#BFBFBF]" />
              <!-- Content -->
              <div class="ml-6">
                <p class="text-xs text-[#BFBFBF] mb-1" style="font-family: 'Space Mono', monospace">{{ fmtEventDate(evt.event_time) }}</p>
                <p :class="['text-sm font-medium mb-0.5', i === currentOrder.events.length - 1 ? 'text-[#1A1A1A]' : 'text-[#8A8A8A]']">{{ evt.status_description }}</p>
                <p v-if="evt.location" class="text-xs text-[#8A8A8A]">{{ evt.location }}</p>
              </div>
            </div>
          </div>
          <div v-else class="mt-8 text-center text-sm text-[#BFBFBF] fade-in-up-2">
            <p>暂无物流轨迹</p>
          </div>
        </div>
      </main>
    </template>

    <!-- Footer -->
    <div class="text-center pb-8">
      <p class="text-xs text-[#BFBFBF]">© PARFCO · Track your order anytime</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import api from '../api'

const phone = ref('')
const trackingNo = ref('')
const loading = ref(false)
const error = ref('')
const showResults = ref(false)
const currentOrder = ref(null)
const copied = ref(false)
const scrolled = ref(false)

const progressSteps = [
  { label: '已揽件', icon: 'package' },
  { label: '运输中', icon: 'truck' },
  { label: '派送中', icon: 'mappin' },
  { label: '已签收', icon: 'home' },
]

function progressStepFor(status, events) {
  if (status === 'delivered') return 3
  if (!events || events.length === 0) return status === 'pending' ? 0 : 1
  const codes = events.map(e => String(e.status_code))
  if (codes.some(c => c === '5')) return 3
  if (codes.some(c => c === '4')) return 2
  if (codes.some(c => c === '1' || c === '2' || c === '3')) return 1
  return 0
}
const progressStep = ref(0)

function statusLabel(s) {
  return { pending:'待揽件', in_transit:'运输中', delivered:'已签收', returned:'已退回', cancelled:'已取消', returning:'退件中', unassigned:'处理中', voided:'已作废', failed:'失败' }[s] || s || '处理中'
}

function fmtEventDate(d) {
  if (!d) return ''
  const t = new Date(d)
  const pad = n => String(n).padStart(2,'0')
  return `${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

async function search() {
  const p = phone.value.trim()
  const t = trackingNo.value.trim()
  if (!p) { error.value = '请输入手机号'; return }
  if (!t) { error.value = '请输入订单号或运单号'; return }
  if (p.length < 4) { error.value = '请输入正确的手机号码'; return }
  loading.value = true; error.value = ''
  try {
    const { data } = await api.get('/public/track', { params: { phone: p, tracking_no: t } })
    if (!data.results || data.results.length === 0) { error.value = '没有找到相关订单，请检查信息是否正确'; return }
    // If track by gig_tracking, find matching order
    let target = data.results[0]
    for (const r of data.results) {
      if (r.gig_tracking === t) { target = r; break }
      if (r.order_no === t) { target = r; break }
    }
    currentOrder.value = target
    progressStep.value = progressStepFor(target.shipping_status, target.events)
    showResults.value = true
  } catch (err) { error.value = err.response?.data?.message || '查询失败，请稍后重试' }
  finally { loading.value = false }
}

function goBack() { showResults.value = false; currentOrder.value = null; error.value = '' }

function copyTracking() {
  const text = currentOrder.value?.gig_tracking || currentOrder.value?.order_no || ''
  if (!text) return
  navigator.clipboard.writeText(text).catch(() => {})
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

function onScroll() { scrolled.value = window.scrollY > 10 }
onMounted(() => window.addEventListener('scroll', onScroll))
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<style scoped>
.fade-in-bg { animation: fadeInBg 1.2s cubic-bezier(0.22,1,0.36,1) both; }
.fade-in-up-1 { animation: fadeInUp 0.6s cubic-bezier(0.22,1,0.36,1) both; }
.fade-in-up-2 { animation: fadeInUp 0.6s 0.1s cubic-bezier(0.22,1,0.36,1) both; }
.fade-in-up-3 { animation: fadeInUp 0.6s 0.2s cubic-bezier(0.22,1,0.36,1) both; }
@keyframes fadeInUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeInBg { from { opacity:0 } to { opacity:1 } }
@keyframes spin { to { transform:rotate(360deg) } }
.animate-spin { animation: spin 1s linear infinite; }
.animate-pulse { animation: pulse 2s ease-in-out infinite; }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
</style>
