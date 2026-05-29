<template>
  <div class="page-card">
    <h2 style="margin-bottom:16px">Shipping Management</h2>

    <div style="display:flex;gap:10px;margin-bottom:12px">
      <el-input v-model="searchOrderNo" placeholder="Search order no..." clearable style="width:200px" @keyup.enter="loadList" />
      <el-input v-model="searchCustomer" placeholder="Search name / phone..." clearable style="width:220px" @keyup.enter="loadList" />
      <el-button type="primary" size="small" @click="loadList">Search</el-button>
    </div>

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
      <el-table-column label="Actions" width="300" fixed="right">
        <template #default="{row}">
          <template v-if="activeTab === 'pending'">
            <el-button size="small" type="primary" @click="openShipDialog(row)">Ship</el-button>
          </template>
          <template v-if="activeTab === 'in_transit'">
            <el-button size="small" type="success" @click="doAction(row, 'deliver')">Deliver</el-button>
            <el-button size="small" type="warning" @click="doAction(row, 'return')">Return</el-button>
            <el-button size="small" @click="doAction(row, 'reassign')">Reassign</el-button>
          </template>
          <template v-if="activeTab === 'delivered'">
            <el-button size="small" type="warning" @click="doAction(row, 'return')">Return</el-button>
          </template>
          <el-button link type="primary" size="small" @click="openEdit(row)" v-if="activeTab === 'pending' || activeTab === 'in_transit'">Edit</el-button>
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

    <!-- Edit Dialog -->
    <el-dialog v-model="showEdit" title="Edit Shipping" width="400px">
      <el-form label-position="top">
        <el-form-item v-if="editRow?.delivery_method === 'gig'" label="GIG Tracking No."><el-input v-model="editForm.gig_tracking" /></el-form-item>
        <el-form-item v-if="editRow?.delivery_method === 'own'" label="Delivery Staff"><el-select v-model="editForm.delivery_staff_id" placeholder="Select..." style="width:100%"><el-option v-for="ds in deliveryStaff" :key="ds.id" :label="ds.name" :value="ds.id" /></el-select></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEdit = false">Cancel</el-button>
        <el-button type="primary" @click="saveEdit">Save</el-button>
      </template>
    </el-dialog>

    <!-- View Dialog -->
    <el-dialog v-model="showView" title="Shipping Record" width="600px">
      <template v-if="viewData">
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="Shipping Code">{{ viewData.shipping_code }}</el-descriptions-item>
          <el-descriptions-item label="Order No.">{{ viewData.order_no }}</el-descriptions-item>
          <el-descriptions-item label="Status">{{ viewData.status }}</el-descriptions-item>
          <el-descriptions-item label="Method">{{ viewData.delivery_method?.toUpperCase() }}</el-descriptions-item>
          <el-descriptions-item label="GIG Tracking">{{ viewData.gig_tracking || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Delivery Staff">{{ viewData.delivery_staff_name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="Order Created">{{ fmtDate(viewData.order_created_at) }}</el-descriptions-item>
          <el-descriptions-item label="Shipped At">{{ viewData.shipped_at ? fmtDate(viewData.shipped_at) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="Returned At">{{ viewData.returned_at ? fmtDate(viewData.returned_at) : '-' }}</el-descriptions-item>
          <el-descriptions-item label="Last Updated">{{ fmtDate(viewData.updated_at) }}</el-descriptions-item>
          <el-descriptions-item label="Last Updated By" :span="2">{{ viewData.updated_by || '-' }}</el-descriptions-item>
        </el-descriptions>
        <h4 style="margin:12px 0 8px">Products</h4>
        <el-table :data="viewData.items" size="small" border>
          <el-table-column prop="product_name" label="Product" />
          <el-table-column prop="unit_price" label="Unit Price" width="120"><template #default="{row}">₦{{ Number(row.unit_price).toLocaleString() }}</template></el-table-column>
          <el-table-column prop="quantity" label="Qty" width="60" />
          <el-table-column prop="subtotal" label="Subtotal" width="120"><template #default="{row}">₦{{ Number(row.subtotal).toLocaleString() }}</template></el-table-column>
        </el-table>
        <div style="text-align:right;margin-top:8px;font-size:16px;font-weight:700">Total: ₦{{ Number(viewData.total_amount).toLocaleString() }}</div>

        <h4 style="margin:12px 0 8px">Operation Log</h4>
        <el-table :data="logs" size="small" border>
          <el-table-column prop="action" label="Action" width="120" />
          <el-table-column prop="detail" label="Detail" />
          <el-table-column prop="operator" label="Operator" width="100" />
          <el-table-column label="Time" width="150"><template #default="{row}">{{ fmtDate(row.created_at) }}</template></el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { getUser, getToken } from '../utils/auth'

const user = getUser()
const activeTab = ref('pending')
const list = ref([])
const loading = ref(false)
const showShipDialog = ref(false)
const showEdit = ref(false)
const showView = ref(false)
const shipForm = ref({ delivery_method: '', gig_tracking: '', delivery_staff_id: null })
const shipTargetId = ref(null)
const editRow = ref(null)
const editForm = ref({ gig_tracking: '', delivery_staff_id: null })
const viewData = ref(null)
const logs = ref([])
const deliveryStaff = ref([])
const selectAll = ref(false)
const searchOrderNo = ref('')
const searchCustomer = ref('')

function fmtDate(d) { if (!d) return '-'; const t = new Date(d); return t.toLocaleDateString('en-GB') + ' ' + t.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' }) }

async function loadList() {
  loading.value = true
  const p = { status: activeTab.value, page_size: 100 }
  if (searchOrderNo.value) p.order_no = searchOrderNo.value
  if (searchCustomer.value) p.customer = searchCustomer.value
  try {
    const { data } = await api.get('/shipping', { params: p })
    list.value = data.list.map(r => ({ ...r, checked: false }))
  } catch (err) { ElMessage.error('Search failed') }
  finally { loading.value = false }
}

function openShipDialog(row) {
  shipTargetId.value = row.id
  shipForm.value = { delivery_method: '', gig_tracking: '', delivery_staff_id: null }
  showShipDialog.value = true
}

async function confirmShip() {
  await doAction(shipTargetId.value, 'confirm_ship', true)
  showShipDialog.value = false
}

function openEdit(row) {
  editRow.value = row
  editForm.value = { gig_tracking: row.gig_tracking || '', delivery_staff_id: row.delivery_staff_id || null }
  showEdit.value = true
}

async function saveEdit() {
  const p = { operator: user?.username }
  if (editRow.value.delivery_method === 'gig') p.gig_tracking = editForm.value.gig_tracking
  else p.delivery_staff_id = editForm.value.delivery_staff_id
  try {
    await api.put(`/shipping/${editRow.value.id}`, p)
    ElMessage.success('Updated'); showEdit.value = false; loadList()
  } catch (err) { ElMessage.error(err.response?.data?.message || 'Failed') }
}

async function viewRecord(row) {
  viewData.value = row
  const [{ data: logData }, { data: orderData }] = await Promise.all([
    api.get(`/shipping/${row.id}/logs`),
    api.get(`/orders/${row.order_id}`)
  ])
  logs.value = logData
  viewData.value.items = orderData.items
  viewData.value.total_amount = orderData.total_amount
  showView.value = true
}

async function doAction(rowOrId, action, useShipForm = false) {
  const id = typeof rowOrId === 'object' ? rowOrId.id : rowOrId
  const extra = { operator: user?.username }
  if (useShipForm) {
    extra.delivery_method = shipForm.value.delivery_method
    extra.gig_tracking = shipForm.value.gig_tracking
    extra.delivery_staff_id = shipForm.value.delivery_staff_id
  }
  try {
    await api.post(`/shipping/${id}/action`, { action, ...extra })
    ElMessage.success('Updated'); loadList()
  } catch (err) { ElMessage.error(err.response?.data?.message || 'Failed') }
}

function toggleAll(v) { list.value.forEach(r => r.checked = v) }

function printLabels() {
  const selected = list.value.filter(r => r.checked)
  if (!selected.length) { ElMessage.warning('Select orders'); return }
  const ids = selected.map(r => r.order_id).join(',')
  const p = new URLSearchParams({ ids, token: getToken() })
  window.open('/api/orders/pdf?' + p.toString(), '_blank')
}

onMounted(async () => {
  loadList()
  const { data } = await api.get('/config/delivery_staff')
  deliveryStaff.value = data
})
</script>
