<template>
  <div class="track-page">
    <!-- Fixed Navbar -->
    <nav :class="['track-nav', scrolled ? 'nav-scrolled' : '']">
      <button v-if="showResults" @click="goBack" class="nav-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        Back
      </button>
    </nav>

    <!-- ==================== SEARCH VIEW ==================== -->
    <template v-if="!showResults">
      <!-- Background perfume -->
      <div class="perfume-bg">
        <img src="/perfume-bg.png" alt="" class="perfume-img" />
      </div>

      <section class="search-section">
        <div class="search-card">
          <!-- Logo -->
          <div class="logo-row">
            <img src="/logo.png" alt="PARFCO" class="logo-img" />
          </div>

          <!-- Title -->
          <div class="title-row">
            <h1 class="title-serif">Track Your Order</h1>
            <p class="subtitle">Real-time updates for every step of your delivery</p>
          </div>

          <!-- Input fields -->
          <div class="inputs-row">
            <!-- Phone -->
            <div class="input-box">
              <div class="input-inner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="input-icon"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                <input v-model="phone" type="tel" placeholder="Enter recipient phone number" maxlength="11" :disabled="loading" class="input-field" @keydown.enter="search" />
              </div>
            </div>

            <!-- Order / Tracking -->
            <div class="input-box">
              <div class="input-inner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="input-icon"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                <input v-model="trackingNo" type="text" placeholder="Enter order number or waybill number" :disabled="loading" class="input-field" @keydown.enter="search" />
              </div>
            </div>

            <!-- Error -->
            <div v-if="error" class="error-box">
              <p class="error-text">{{ error }}</p>
            </div>

            <!-- Query Button -->
            <button @click="search" :disabled="loading" class="query-btn">
              <span v-if="loading" class="spinner" />
              <template v-else>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                Track
              </template>
            </button>
          </div>
        </div>
      </section>
    </template>

    <!-- ==================== RESULTS VIEW ==================== -->
    <template v-else>
      <main class="results-main">
        <div class="results-container">
          <!-- Overview Card -->
          <div class="overview-card">
            <!-- Status Badge -->
            <div class="status-badge">
              <span :class="['status-dot', (currentOrder.shipping_status === 'in_transit' || currentOrder.shipping_status === 'pending') ? 'status-pulse' : '']" />
              {{ statusLabel(currentOrder.shipping_status) }}
            </div>

            <!-- Tracking Number -->
            <div class="tracking-row">
              <span class="tracking-no">{{ currentOrder.gig_tracking || currentOrder.order_no }}</span>
              <button @click="copyTracking" class="copy-btn">
                <svg v-if="!copied" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>

            <!-- Progress Bar -->
            <div class="progress-row">
              <div v-for="(step, i) in progressSteps" :key="step.label" class="progress-step">
                <div :class="['progress-circle', i <= progressStep ? 'circle-active' : 'circle-inactive', i === progressStep ? 'circle-current' : '']">
                  <svg v-if="step.icon === 'package'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                  <svg v-else-if="step.icon === 'truck'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
                  <svg v-else-if="step.icon === 'mappin'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5.25-8 13-8 13s-8-7.75-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </div>
                <span :class="['progress-label', i <= progressStep ? 'label-active' : 'label-inactive']">{{ step.label }}</span>
              </div>
            </div>

            <!-- Order Info -->
            <div class="order-info">
              <p>Order: {{ currentOrder.order_no }}</p>
              <p>Customer: {{ currentOrder.customer_name }} · {{ currentOrder.masked_phone }}</p>
              <p v-if="currentOrder.delivery_method">Method: {{ currentOrder.delivery_method.toUpperCase() }}</p>
            </div>
          </div>

          <!-- Timeline -->
          <div v-if="currentOrder.events && currentOrder.events.length > 0" class="timeline-wrap">
            <div class="timeline-line" />
            <div v-for="(evt, i) in currentOrder.events" :key="i" class="timeline-item">
              <div v-if="i === 0" class="tl-dot tl-dot-current" />
              <div v-else class="tl-dot tl-dot-past" />
              <div class="tl-content">
                <p class="tl-date">{{ fmtEventDate(evt.event_time) }}</p>
                <p :class="['tl-title', i === 0 ? 'tl-title-current' : 'tl-title-past']">{{ evt.status_description }}</p>
                <p v-if="evt.location" class="tl-location">{{ evt.location }}</p>
              </div>
            </div>
          </div>
          <div v-else class="no-events">
            <p>No tracking events yet</p>
          </div>
        </div>
      </main>
    </template>

    <!-- Footer -->
    <div class="track-footer">
      <p>© PARFCO · Track your order anytime</p>
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
  { label: 'Picked Up', icon: 'package' },
  { label: 'In Transit', icon: 'truck' },
  { label: 'Out for Delivery', icon: 'mappin' },
  { label: 'Delivered', icon: 'home' },
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
  return { pending:'Pending', in_transit:'In Transit', delivered:'Delivered', returned:'Returned', cancelled:'Cancelled', returning:'Returning', unassigned:'Processing', voided:'Voided', failed:'Failed' }[s] || s || 'Processing'
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
  if (!p) { error.value = 'Enter your phone number'; return }
  if (!t) { error.value = 'Enter order or waybill number'; return }
  if (p.length < 4) { error.value = 'Enter a valid phone number'; return }
  loading.value = true; error.value = ''
  try {
    const { data } = await api.get('/public/track', { params: { phone: p, tracking_no: t } })
    if (!data.results || data.results.length === 0) { error.value = 'No orders found. Please check your details.'; return }
    let target = data.results[0]
    for (const r of data.results) {
      if (r.gig_tracking === t) { target = r; break }
      if (r.order_no === t) { target = r; break }
    }
    currentOrder.value = target
    progressStep.value = progressStepFor(target.shipping_status, target.events)
    showResults.value = true
  } catch (err) { error.value = err.response?.data?.message || 'Search failed, please try again' }
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
/* === Reset & Base === */
* { box-sizing: border-box; }
.track-page {
  min-height: 100vh; display: flex; flex-direction: column; position: relative; overflow: hidden;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #fafafa;
}

/* === Navbar === */
.track-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 50; height: 64px;
  display: flex; align-items: center; padding: 0 24px; transition: background 0.3s;
}
.nav-scrolled { background: rgba(250,248,245,0.8); backdrop-filter: blur(12px); }
.nav-back { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #8A8A8A; background: none; border: none; cursor: pointer; transition: color 0.2s; font-family: inherit; }
.nav-back:hover { color: #1A1A1A; }

/* === Search View === */
.perfume-bg {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none; z-index: 0; user-select: none;
  animation: fadeInBg 1.2s cubic-bezier(0.22,1,0.36,1) both;
}
.perfume-img { width: 300px; opacity: 0.07; object-fit: contain; }
@media (min-width: 640px) { .perfume-img { width: 380px; } }
@media (min-width: 768px) { .perfume-img { width: 460px; } }

.search-section {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  padding: 96px 24px 0; position: relative; z-index: 10;
}
@media (min-width: 640px) { .search-section { padding-top: 112px; } }
@media (min-width: 768px) { .search-section { padding-top: 128px; } }

.search-card { width: 100%; max-width: 448px; }

.logo-row {
  display: flex; justify-content: center; margin-bottom: 24px;
  animation: fadeInUp 0.6s cubic-bezier(0.22,1,0.36,1) both;
}
@media (min-width: 768px) { .logo-row { margin-bottom: 32px; } }
.logo-img { height: 56px; width: auto; object-fit: contain; }
@media (min-width: 640px) { .logo-img { height: 72px; } }
@media (min-width: 768px) { .logo-img { height: 88px; } }

.title-row {
  text-align: center; margin-bottom: 32px;
  animation: fadeInUp 0.6s 0.1s cubic-bezier(0.22,1,0.36,1) both;
}
@media (min-width: 768px) { .title-row { margin-bottom: 40px; } }
.title-serif { font-size: 24px; color: #1A1A1A; margin: 0 0 8px; font-family: 'EB Garamond', serif; }
@media (min-width: 768px) { .title-serif { font-size: 30px; } }
.subtitle { font-size: 14px; color: #8A8A8A; margin: 0; }

.inputs-row {
  display: flex; flex-direction: column; gap: 16px;
  animation: fadeInUp 0.6s 0.2s cubic-bezier(0.22,1,0.36,1) both;
}
.input-box { background: rgba(255,255,255,0.8); backdrop-filter: blur(8px); border: 1px solid #EBE5DA; border-radius: 12px; padding: 12px 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
.input-inner { display: flex; align-items: center; gap: 8px; }
.input-icon { color: #BFBFBF; flex-shrink: 0; }
.input-field { flex: 1; font-size: 14px; color: #1A1A1A; background: transparent; border: none; outline: none; font-family: inherit; min-width: 0; }
.input-field::placeholder { color: #BFBFBF; }
.input-field:disabled { opacity: 0.5; }

.error-box { background: rgba(197,115,94,0.1); border: 1px solid rgba(197,115,94,0.2); border-radius: 12px; padding: 12px 16px; text-align: center; }
.error-text { font-size: 14px; color: #C4735E; font-weight: 500; margin: 0; }

.query-btn {
  width: 100%; background: #C9A96E; color: white; font-size: 14px; font-weight: 500;
  padding: 12px; border-radius: 9999px; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background 0.3s; font-family: inherit;
}
.query-btn:hover { background: #B8945A; }
.query-btn:disabled { opacity: 0.5; }

.spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 1s linear infinite; }

/* === Results View === */
.results-main { flex: 1; padding: 96px 24px 64px; }
.results-container { max-width: 672px; margin: 0 auto; }

.overview-card {
  background: #fff; border-radius: 12px; padding: 24px;
  box-shadow: 0 8px 32px rgba(26,26,26,0.04);
  animation: fadeInUp 0.6s cubic-bezier(0.22,1,0.36,1) both;
}
@media (min-width: 768px) { .overview-card { padding: 32px; } }

.status-badge {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500;
  color: #C9A96E; background: rgba(201,169,110,0.1); padding: 4px 12px; border-radius: 9999px; margin-bottom: 16px;
}
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: #C9A96E; }
.status-pulse { animation: pulse 2s ease-in-out infinite; }

.tracking-row { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
.tracking-no { font-size: 18px; color: #1A1A1A; letter-spacing: 1px; font-family: 'Courier New', monospace; word-break: break-all; }
.copy-btn { padding: 6px; border-radius: 8px; border: none; background: none; cursor: pointer; color: #8A8A8A; transition: all 0.2s; }
.copy-btn:hover { background: #F5EFE6; color: #1A1A1A; }

.progress-row { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 24px; }
.progress-step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.progress-circle { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.3s; }
.circle-active { background: #C9A96E; color: #fff; }
.circle-inactive { background: #EBE5DA; color: #BFBFBF; }
.circle-current { box-shadow: 0 0 0 4px rgba(201,169,110,0.2); }
.progress-label { font-size: 12px; text-align: center; }
.label-active { color: #1A1A1A; }
.label-inactive { color: #BFBFBF; }

.order-info { font-size: 14px; color: #8A8A8A; line-height: 1.8; }
.order-info p { margin: 0; }

/* === Timeline === */
.timeline-wrap { position: relative; padding-left: 24px; margin-top: 32px; animation: fadeInUp 0.6s 0.15s cubic-bezier(0.22,1,0.36,1) both; }
.timeline-line { position: absolute; left: 11px; top: 12px; bottom: 12px; width: 1px; background: #EBE5DA; }
.timeline-item { position: relative; padding: 20px 0; }
.tl-dot { position: absolute; border-radius: 50%; }
.tl-dot-current { left: 1px; top: 22px; width: 12px; height: 12px; background: #C9A96E; box-shadow: 0 0 0 4px rgba(201,169,110,0.2); }
.tl-dot-past { left: 7px; top: 24px; width: 8px; height: 8px; background: #BFBFBF; }
.tl-content { margin-left: 24px; }
.tl-date { font-size: 12px; color: #BFBFBF; margin: 0 0 4px; font-family: 'Courier New', monospace; }
.tl-title { font-size: 14px; font-weight: 500; margin: 0 0 2px; word-break: break-word; }
.tl-title-current { color: #1A1A1A; }
.tl-title-past { color: #8A8A8A; }
.tl-location { font-size: 12px; color: #8A8A8A; margin: 0; }

.no-events { margin-top: 32px; text-align: center; font-size: 14px; color: #BFBFBF; animation: fadeInUp 0.6s 0.15s cubic-bezier(0.22,1,0.36,1) both; }

/* === Footer === */
.track-footer { text-align: center; padding-bottom: 32px; }
.track-footer p { font-size: 12px; color: #BFBFBF; margin: 0; }

/* === Animations === */
@keyframes fadeInUp { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
@keyframes fadeInBg { from { opacity:0 } to { opacity:1 } }
@keyframes spin { to { transform:rotate(360deg) } }
@keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
</style>
