<template>
  <div>
    <div class="page-header"><div><h2>{{ isEdit ? 'Edit Order' : 'New Order' }}</h2><p>Fill in customer and product details below.</p></div></div>
    <div class="page-card">

    <el-form :model="form" label-position="top" ref="formRef">
      <el-row :gutter="16">
        <el-col :span="7"><el-form-item label="Customer Name" required><el-input v-model="form.customer_name" placeholder="Customer full name" /></el-form-item></el-col>
        <el-col :span="4"><el-form-item label="Gender" required><el-select v-model="form.customer_gender"><el-option label="Male" value="male" /><el-option label="Female" value="female" /></el-select></el-form-item></el-col>
        <el-col :span="6"><el-form-item label="Phone" required><el-input v-model="form.customer_phone" placeholder="Phone number" maxlength="11" /></el-form-item></el-col>
        <el-col :span="7"><el-form-item label="Phone 2"><el-input v-model="form.customer_phone2" placeholder="Alternate phone" maxlength="11" /></el-form-item></el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="8"><el-form-item label="Streamer" required><el-select v-model="form.streamer_id" placeholder="Select"><el-option v-for="s in streamers" :key="s.id" :label="s.name" :value="s.id" /></el-select></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="Payment Status" required><el-select v-model="form.payment_status_id" placeholder="Select"><el-option v-for="p in payStatuses" :key="p.id" :label="p.name" :value="p.id" /></el-select></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="Order Date"><el-date-picker v-model="form.order_time" type="date" placeholder="Pick date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="5"><el-form-item label="Province" required><el-select v-model="form.accept_province" filterable allow-create placeholder="Select" @change="onProvinceChange" style="width:100%"><el-option v-for="o in provinceOptions" :key="o" :label="o" :value="o" /></el-select></el-form-item></el-col>
        <el-col :span="5"><el-form-item label="City"><el-select v-model="form.accept_city" filterable allow-create placeholder="Select" @change="onCityChange" style="width:100%"><el-option v-for="o in cityOptions" :key="o" :label="o" :value="o" /></el-select></el-form-item></el-col>
        <el-col :span="5"><el-form-item label="District"><el-select v-model="form.accept_district" filterable allow-create placeholder="Select" style="width:100%"><el-option v-for="o in districtOptions" :key="o" :label="o" :value="o" /></el-select></el-form-item></el-col>
        <el-col :span="9"><el-form-item label="Address" required><el-input v-model="form.customer_address" type="textarea" :rows="2" placeholder="Delivery address" /></el-form-item></el-col>
      </el-row>

      <h4 style="margin:12px 0">Products <span style="color:#f56c6c">*</span></h4>
      <el-table :data="items" border size="small">
        <el-table-column label="Product" min-width="170">
          <template #default="{row, $index}">
            <el-select v-model="row.product_id" placeholder="Select product" filterable @change="(val) => onProductChange($index, val)" style="width:100%">
              <el-option v-for="p in availableProducts($index)" :key="p.id" :label="`${p.code} - ${p.name} (₦${Number(p.price).toLocaleString()})`" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="Price" width="120">
          <template #default="{row}">{{ row.unit_price ? '₦' + Number(row.unit_price).toLocaleString() : '-' }}</template>
        </el-table-column>
        <el-table-column label="Qty" width="140">
          <template #default="{row}"><el-input-number v-model="row.quantity" :min="1" :max="999" size="small" @change="calcTotal" /></template>
        </el-table-column>
        <el-table-column label="Subtotal" width="130">
          <template #default="{row}">{{ row.subtotal ? '₦' + Number(row.subtotal).toLocaleString() : '-' }}</template>
        </el-table-column>
        <el-table-column label="Actions" width="70">
          <template #default="{$index}">
            <el-button link type="danger" :disabled="items.length <= 1" @click="removeItem($index)">Del</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button size="small" style="margin-top:8px" @click="addItem">+ Add Product</el-button>

      <el-row :gutter="16" style="margin-top:16px">
        <el-col :span="8"><el-form-item label="Total Amount"><el-input :model-value="'₦' + fmtNaira(totalAmount)" disabled /></el-form-item></el-col>
        <el-col :span="8"><el-form-item label="Actual Amount"><el-input-number v-model="form.actual_amount" :min="0" :step="100" style="width:100%" /></el-form-item></el-col>
      </el-row>

      <!-- Images Upload (max 5) -->
      <el-form-item label="Images (max 5)" style="margin-top:16px">
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          <div v-for="(img, idx) in images" :key="idx" style="position:relative;width:80px;height:80px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;cursor:pointer">
            <img :src="img.url" style="width:100%;height:100%;object-fit:cover" @click="previewImage = img.url" />
            <span v-if="user?.role === 'admin' || !img.id"
                  @click.stop="removeImage(idx)"
                  style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;line-height:1;cursor:pointer">×</span>
          </div>
          <div v-if="images.length < 5" style="width:80px;height:80px;border:1px dashed #ccc;border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#aaa">
            <el-upload :action="uploadUrl" :headers="uploadHeaders" name="images" :on-success="onUploadSuccess" :on-error="onUploadError" :before-upload="beforeUpload" :show-file-list="false" accept="image/*" multiple style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
              <span style="font-size:24px">+</span>
            </el-upload>
          </div>
        </div>
      </el-form-item>
      <!-- Image preview -->
      <el-dialog v-model="showPreview" :show-close="true" width="80vw">
        <img :src="previewImage" style="width:100%;max-height:80vh;object-fit:contain" />
      </el-dialog>

      <div style="margin-top:16px;display:flex;gap:10px">
        <el-button type="primary" :loading="saving && !speedafMode" @click="handleSave(false)">{{ isEdit ? 'Update' : 'Save Order' }}</el-button>
        <el-button v-if="!isEdit" type="success" :loading="saving && speedafMode" @click="handleSave(true)">Save & Speedaf Print</el-button>
        <el-button @click="$router.back()">Cancel</el-button>
      </div>
    </el-form>
  </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'
import { getToken, getUser } from '../utils/auth'

const route = useRoute()
const router = useRouter()
const isEdit = ref(!!route.params.id)
const saving = ref(false)
const speedafMode = ref(false)
const showPreview = ref(false)
const previewImage = ref('')
const streamers = ref([])
const payStatuses = ref([])
const products = ref([])
let areaData = []
const provinceOptions = ref([])
const cityOptions = ref([])
const districtOptions = ref([])

function onProvinceChange() {
  form.value.accept_city = ''; form.value.accept_district = ''
  const st = areaData.find(s => s.state === form.value.accept_province)
  cityOptions.value = st ? st.lgas.map(l => l.name) : []
}
function onCityChange() {
  form.value.accept_district = ''
  const st = areaData.find(s => s.state === form.value.accept_province)
  const lga = st?.lgas?.find(l => l.name === form.value.accept_city)
  districtOptions.value = lga ? (lga.wards || []).map(w => w.name) : []
}

const items = ref([{ product_id: null, unit_price: 0, quantity: 1, subtotal: 0 }])

const form = ref({
  customer_name: '', customer_gender: '', customer_phone: '', customer_phone2: '', customer_address: '',
  accept_province: 'LAGOS', accept_city: 'LAGOS', accept_district: 'LAGOS',
  streamer_id: Number(localStorage.getItem('lp_last_streamer')) || null, payment_status_id: 1, actual_amount: 0,
  order_time: new Date().toISOString().slice(0, 10),
  payment_image: ''
})

const totalAmount = computed(() => items.value.reduce((s, i) => s + (i.subtotal || 0), 0))
function fmtNaira(v) { const n = Number(v); return isNaN(n) ? '0' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Multi-image upload
const images = ref([])
const user = ref(getUser())
const uploadUrl = '/api/orders/upload-images'
const uploadHeaders = computed(() => ({ Authorization: `Bearer ${getToken()}` }))
function beforeUpload(file) {
  if (!file.type.startsWith('image/')) { ElMessage.error('Only images allowed'); return false }
  if (file.size / 1024 / 1024 > 5) { ElMessage.error('Max 5MB'); return false }
  if (images.value.length >= 5) { ElMessage.warning('Max 5 images'); return false }
  return true
}
function onUploadSuccess(res) {
  const added = Array.isArray(res) ? res : [res]
  for (const r of added) { if (images.value.length < 5) images.value.push({ url: r.url, filename: r.filename, id: null }) }
}
function onUploadError() { ElMessage.error('Upload failed') }
function removeImage(idx) {
  const img = images.value[idx]
  if (!img) return
  if (img.id) {
    if (user.value?.role !== 'admin') { ElMessage.warning('Only admin can delete saved images'); return }
    api.delete('/orders/images/' + img.id).then(() => { images.value.splice(idx, 1) }).catch(() => ElMessage.error('Delete failed'))
  } else {
    images.value.splice(idx, 1)
  }
}

// Ctrl+V paste image
async function onPaste(e) {
  const file = e.clipboardData?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  if (images.value.length >= 5) { ElMessage.warning('Max 5 images'); return }
  e.preventDefault()
  const fd = new FormData(); fd.append('images', file)
  try {
    const res = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() }, body: fd })
    const data = await res.json()
    if (Array.isArray(data) && data.length) { images.value.push({ url: data[0].url, filename: data[0].filename, id: null }) }
  } catch { ElMessage.error('Paste failed') }
}

function availableProducts(idx) {
  const selected = items.value.filter((_, i) => i !== idx).map(i => i.product_id)
  return products.value.filter(p => !selected.includes(p.id))
}

function onProductChange(idx, val) {
  const item = items.value[idx]
  const pid = val !== undefined ? val : item.product_id
  if (pid) {
    const p = products.value.find(p => p.id === pid)
    if (p) { item.unit_price = p.price; item.subtotal = p.price * (item.quantity || 1) }
  } else { item.unit_price = 0; item.subtotal = 0 }
}

function calcTotal() { items.value.forEach((item, i) => onProductChange(i)) }
function addItem() { items.value.push({ product_id: null, unit_price: 0, quantity: 1, subtotal: 0 }) }
function removeItem(idx) { items.value.splice(idx, 1) }

async function handleSave(doSpeedaf = false) {
  const f = form.value
  if (!f.customer_name || !f.customer_gender || !f.customer_phone || !f.customer_address || !f.accept_province || !f.streamer_id || !f.payment_status_id) {
    ElMessage.warning('All fields are required'); return
  }
  if (!/^\d{11}$/.test(f.customer_phone)) { ElMessage.warning('Phone must be 11 digits'); return }
  if (items.value.some(i => !i.product_id)) { ElMessage.warning('Select products'); return }
  if (images.value.length === 0) { ElMessage.warning('Upload at least one image'); return }
  saving.value = true
  speedafMode.value = doSpeedaf
  const actual = f.actual_amount != null && f.actual_amount > 0 ? f.actual_amount : totalAmount.value
  const payload = {
    ...form.value, actual_amount: actual,
    items: items.value.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
    images: images.value.map(i => ({ url: i.url, filename: i.filename })),
    speedaf: doSpeedaf,
  }
  try {
    if (isEdit.value) {
      await api.put(`/orders/${route.params.id}`, payload)
      ElMessage.success('Updated')
      router.replace('/Livestream_Management/orders')
    } else {
      const { data } = await api.post('/orders', payload)
      if (doSpeedaf && data.speedaf?.success) {
        if (form.value.streamer_id) localStorage.setItem('lp_last_streamer', form.value.streamer_id)
        ElMessage.success('Order created! Tracking: ' + data.speedaf.billCode)
        if (data.speedaf.labelUrl) {
          window.open(data.speedaf.labelUrl, '_blank')
        }
        setTimeout(() => router.replace('/Livestream_Management/orders'), 500)
        return
      } else if (doSpeedaf) {
        ElMessage.warning('Order saved, but Speedaf failed: ' + (data.speedaf?.message || 'unknown error'))
      } else {
        if (form.value.streamer_id) localStorage.setItem('lp_last_streamer', form.value.streamer_id)
        ElMessage.success('Order created')
      }
      router.replace('/Livestream_Management/orders')
    }
  } catch (err) { ElMessage.error(err.response?.data?.message || 'Failed') }
  finally { saving.value = false; speedafMode.value = false }
}

async function loadOrder() {
  const { data } = await api.get(`/orders/${route.params.id}`)
  try {
    const imgRes = await api.get(`/orders/${route.params.id}/images`)
    images.value = (imgRes.data || []).map(i => ({ url: i.url, filename: i.filename, id: i.id }))
  } catch {}
  Object.assign(form.value, {
    customer_name: data.customer_name, customer_gender: data.customer_gender,
    customer_phone: data.customer_phone, customer_phone2: data.customer_phone2 || '', customer_address: data.customer_address,
    accept_province: data.accept_province || 'LAGOS', accept_city: data.accept_city || 'LAGOS', accept_district: data.accept_district || 'LAGOS',
    streamer_id: data.streamer_id, payment_status_id: data.payment_status_id,
    actual_amount: data.actual_amount, order_time: data.order_time || '', payment_image: data.payment_image || ''
  })
  items.value = data.items.map(i => ({ product_id: i.product_id, unit_price: i.unit_price, quantity: i.quantity, subtotal: i.subtotal }))
}

// Auto-sync actual_amount with total for new orders
watch(totalAmount, (v) => { if (!isEdit.value) form.value.actual_amount = v })

// Watch product_id & quantity changes
watch(
  () => items.value.map(i => i.product_id).join(',') + '|' + items.value.map(i => i.quantity).join(','),
  () => calcTotal()
)

onMounted(async () => {
  const [{ data: s }, { data: ps }, { data: pr }] = await Promise.all([
    api.get('/config/streamers'), api.get('/config/payment_statuses'), api.get('/products')
  ])
  streamers.value = s; payStatuses.value = ps; products.value = pr.list || pr

  // Load Nigeria area data
  try {
    const resp = await fetch('/nigeria-areas.json')
    areaData = await resp.json()
    provinceOptions.value = areaData.map(s => s.state)
  } catch (e) { provinceOptions.value = ['LAGOS']; cityOptions.value = ['LAGOS']; districtOptions.value = ['LAGOS'] }

  if (isEdit.value) {
    await loadOrder()
    if (form.value.accept_province) onProvinceChange()
    if (form.value.accept_city) onCityChange()
  }
  document.addEventListener('paste', onPaste)
})
onUnmounted(() => document.removeEventListener('paste', onPaste))
</script>
