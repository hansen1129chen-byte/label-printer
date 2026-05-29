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
      <el-table-column width="40">
        <template #default="{row}"><el-checkbox v-model="row.checked" /></template>
      </el-table-column>
      <el-table-column prop="order_no" label="Order No." width="130" />
      <el-table-column prop="customer_name" label="Customer" min-width="140" />
      <el-table-column prop="customer_phone" label="Phone" width="130" />
      <el-table-column prop="customer_address" label="Address" min-width="180" show-overflow-tooltip />
      <el-table-column label="Method" width="80">
        <template #default="{row}">
          <el-tag v-if="row.delivery_method === 'gig'" type="primary" size="small">GIG</el-tag>
          <el-tag v-else-if="row.delivery_method === 'own'" type="success" size="small">OWN</el-tag>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="Tracking / Staff" width="150">
        <template #default="{row}">
          <span v-if="row.delivery_method === 'gig'">{{ row.gig_tracking || '-' }}</span>
          <span v-else-if="row.delivery_method === 'own'">{{ row.delivery_staff_name || '-' }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column label="Order Date" width="110"><template #default="{row}">{{ row.order_created_at?.slice(0,10) }}</template></el-table-column>
      <el-table-column label="Shipped" width="110"><template #default="{row}">{{ row.shipped_at?.slice(0,10) || '-' }}</template></el-table-column>
      <el-table-column label="Actions" width="250" fixed="right">
        <template #default="{row}">
          <template v-if="activeTab === 'pending'">
            <el-button size="small" type="primary" @click="openShipDialog(row)">Ship</el-button>
          </template>
          <template v-if="activeTab === 'in_transit'">
            <el-button size="small" type="success" @click="doAction(row.id, 'deliver')">Deliver</el-button>
            <el-button size="small" type="warning" @click="doAction(row.id, 'return')">Return</el-button>
            <el-button size="small" @click="doAction(row.id, 'reassign')">Reassign</el-button>
          </template>
          <template v-if="activeTab === 'delivered'">
            <el-button size="small" type="warning" @click="doAction(row.id, 'return')">Return</el-button>
          </template>
          <el-button link type="primary" size="small" @click="viewRecord(row)">View</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top:12px;display:flex;gap:10px;justify-content:flex-end" v-if="activeTab === 'pending'">
      <el-checkbox v-model="selectAll" @change="toggleAll">Select All</el-checkbox>
      <el-button type="primary" @click="printLabels">Print Labels (PDF)</el-button>
    </div>

    <!-- Ship Dialog -->
    <el-dialog v-model="showShipDialog" title="Confirm Shipping" width="400px">
      <el-form label-position="top">
        <el-form-item label="Delivery Method"><el-select v-model="shipForm.delivery_method" placeholder="Select..." style="width:100%"><el-option label="GIG" value="gig" /><el-option label="Own Delivery" value="own" /></el-select></el-form-item>
        <el-form-item v-if="shipForm.delivery_method === 'gig'" label="GIG Tracking No."><el-input v-model="shipForm.gig_tracking" /></el-form-item>
        <el-form-item v-if="shipForm.delivery_method === 'own'" label="Delivery Staff"><el-select v-model="shipForm.delivery_staff_id" placeholder="Select..." style="width:100%"><el-option v-for="ds in deliveryStaff" :key="ds.id" :label="ds.name" :value="ds.id" /></el-select></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showShipDialog = false">Cancel</el-button>
        <el-button type="primary" :disabled="!shipForm.delivery_method" @click="confirmShip">Confirm</el-button>
      </template>
    </el-dialog>

    <!-- View Dialog -->
    <el-dialog v-model="showView" title="Shipping Record" width="500px">
      <template v-if="viewData">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="Shipping Code">{{ viewData.shipping_code }}</el-descriptions-item>
          <el-descriptions-item label="Status">{{ viewData.status }}</el-descriptions-item>
          <el-descriptions-item label="Order No.">{{ viewData.order_no }}</el-descriptions-item>
          <el-descriptions-item label="Method">{{ viewData.delivery_method?.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item label="GIG Tracking">{{ viewData.gig_tracking || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Delivery Staff">{{ viewData.delivery_staff_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Shipped At">{{ viewData.shipped_at ? fmtDate(viewData.shipped_at) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="Last Updated">{{ fmtDate(viewData.updated_at) }}</el-descriptions-item>
        </el-descriptions>
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
const shipForm = ref({ delivery_method: '', gig_tracking: '', delivery_staff_id: null })
const shipTargetId = ref(null)
const deliveryStaff = ref([])
const selectAll = ref(false)
const showView = ref(false)
const viewData = ref(null)

function fmtDate(d) { if (!d) return '-'; const t = new Date(d); return t.toLocaleDateString('en-GB') + ' ' + t.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) }

async function loadList() {
  loading.value = true
  const { data } = await api.get('/shipping', { params: { status: activeTab.value, page_size: 100 } })
  list.value = data.list.map(r => ({ ...r, checked: false }))
  loading.value = false
}

function openShipDialog(row) {
  shipTargetId.value = row.id
  shipForm.value = { delivery_method: '', gig_tracking: '', delivery_staff_id: null }
  showShipDialog.value = true
}

async function confirmShip() {
  await doAction(shipTargetId.value, 'confirm_ship')
  showShipDialog.value = false
}

async function doAction(id, action) {
  const extra = {}
  if (action === 'confirm_ship') {
    extra.delivery_method = shipForm.value.delivery_method
    extra.gig_tracking = shipForm.value.gig_tracking
    extra.delivery_staff_id = shipForm.value.delivery_staff_id
  }
  try {
    await api.post(`/shipping/${id}/action`, { action, ...extra })
    ElMessage.success('Updated'); loadList()
  } catch (err) { ElMessage.error(err.response?.data?.message || 'Failed') }
}

function viewRecord(row) { viewData.value = row; showView.value = true }

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
