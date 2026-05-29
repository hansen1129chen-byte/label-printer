<template>
  <div class="page-card">
    <h2 style="margin-bottom:16px">Shipping Management</h2>

    <el-tabs v-model="activeTab" @tab-change="loadList">
      <el-tab-pane label="Pending" name="pending" />
      <el-tab-pane label="In Transit" name="in_transit" />
      <el-tab-pane label="Delivered" name="delivered" />
      <el-tab-pane label="Returned" name="returned" />
    </el-tabs>

    <el-table :data="list" stripe v-loading="loading">
      <el-table-column prop="shipping_code" label="Shipping Code" width="150" />
      <el-table-column prop="order_no" label="Order No." width="130" />
      <el-table-column prop="customer_name" label="Customer" min-width="140" />
      <el-table-column prop="customer_phone" label="Phone" width="130" />
      <el-table-column prop="customer_address" label="Address" min-width="180" show-overflow-tooltip />
      <el-table-column prop="delivery_method" label="Method" width="80"><template #default="{row}">{{ row.delivery_method?.toUpperCase() }}</template></el-table-column>
      <el-table-column prop="gig_tracking" label="GIG Tracking" width="140" />
      <el-table-column prop="delivery_staff_name" label="Delivery Staff" width="130" />
      <el-table-column prop="initiated_at" label="Created" width="120"><template #default="{row}">{{ row.initiated_at?.slice(0,10) }}</template></el-table-column>
      <el-table-column label="Actions" width="220" fixed="right">
        <template #default="{row}">
          <template v-if="activeTab === 'pending'">
            <el-button size="small" type="primary" @click="openShipDialog(row)">Ship</el-button>
          </template>
          <template v-if="activeTab === 'in_transit'">
            <el-button size="small" type="success" @click="doAction(row.id, 'deliver')">Deliver</el-button>
            <el-button size="small" type="warning" @click="doAction(row.id, 'return')">Return</el-button>
            <el-button size="small" @click="doAction(row.id, 'reassign')">Reassign</el-button>
          </template>
          <!-- Multi-select for PDF -->
          <el-checkbox v-model="row.checked" />
        </template>
      </el-table-column>
    </el-table>

    <!-- Print PDF -->
    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end" v-if="activeTab === 'pending'">
      <el-checkbox v-model="selectAll" @change="toggleAll">Select All</el-checkbox>
      <el-button type="primary" @click="printLabels">Print Labels (PDF)</el-button>
    </div>

    <!-- Ship Dialog -->
    <el-dialog v-model="showShipDialog" title="Confirm Shipping" width="400px">
      <el-form label-position="top">
        <el-form-item label="Delivery Method"><el-select v-model="shipForm.delivery_method" style="width:100%"><el-option label="GIG" value="gig" /><el-option label="Own Delivery" value="own" /></el-select></el-form-item>
        <el-form-item v-if="shipForm.delivery_method === 'gig'" label="GIG Tracking No."><el-input v-model="shipForm.gig_tracking" /></el-form-item>
        <el-form-item v-if="shipForm.delivery_method === 'own'" label="Delivery Staff"><el-select v-model="shipForm.delivery_staff_id" style="width:100%"><el-option v-for="ds in deliveryStaff" :key="ds.id" :label="ds.name" :value="ds.id" /></el-select></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showShipDialog = false">Cancel</el-button>
        <el-button type="primary" @click="confirmShip">Confirm</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const activeTab = ref('pending')
const list = ref([])
const loading = ref(false)
const showShipDialog = ref(false)
const shipForm = ref({ delivery_method: 'gig', gig_tracking: '', delivery_staff_id: null })
const shipTargetId = ref(null)
const deliveryStaff = ref([])
const selectAll = ref(false)

async function loadList() {
  loading.value = true
  const { data } = await api.get('/shipping', { params: { status: activeTab.value, page_size: 100 } })
  list.value = data.list.map(r => ({ ...r, checked: false }))
  loading.value = false
}

function openShipDialog(row) {
  shipTargetId.value = row.order_id
  shipForm.value = { delivery_method: 'gig', gig_tracking: '', delivery_staff_id: null }
  showShipDialog.value = true
}

async function confirmShip() {
  const p = { order_id: shipTargetId.value, delivery_method: shipForm.value.delivery_method }
  if (p.delivery_method === 'gig') p.gig_tracking = shipForm.value.gig_tracking
  else p.delivery_staff_id = shipForm.value.delivery_staff_id
  await api.post('/shipping', p)
  ElMessage.success('Shipped'); showShipDialog.value = false; loadList()
}

async function doAction(id, action) {
  const extra = {}
  if (action === 'reassign') {
    extra.delivery_method = 'own'
    extra.delivery_staff_id = deliveryStaff.value[0]?.id
  }
  await api.post(`/shipping/${id}/action`, { action, ...extra })
  ElMessage.success('Updated'); loadList()
}

function toggleAll(v) { list.value.forEach(r => r.checked = v) }

function printLabels() {
  const selected = list.value.filter(r => r.checked)
  if (!selected.length) { ElMessage.warning('Select orders'); return }
  const ids = selected.map(r => r.order_id).join(',')
  window.open(`/api/orders/${ids}/pdf`, '_blank')
}

onMounted(async () => {
  loadList()
  const { data } = await api.get('/config/delivery_staff')
  deliveryStaff.value = data
})
</script>
