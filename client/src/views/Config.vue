<template>
  <div>
    <div class="page-header"><div><h2>Configuration</h2><p>Manage streamers, payment statuses and delivery staff.</p></div></div>
    <div class="page-card">

    <el-tabs>
      <!-- Streamers -->
      <el-tab-pane label="Streamers">
        <el-button size="small" class="btn-dark" style="margin-bottom:10px" @click="openAdd('streamers')">+ Add</el-button>
        <el-table :data="streamers" stripe size="small">
          <el-table-column prop="name" label="Name" />
          <el-table-column prop="commission_rate" label="Commission %" width="120" />
          <el-table-column label="Actions" width="140">
            <template #default="{row}"><el-button link type="primary" size="small" @click="openEdit('streamers', row)">Edit</el-button><el-popconfirm title="Delete?" @confirm="handleDelete('streamers', row.id)"><template #reference><el-button link type="danger" size="small">Del</el-button></template></el-popconfirm></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Payment Statuses -->
      <el-tab-pane label="Payment Statuses">
        <el-button size="small" class="btn-dark" style="margin-bottom:10px" @click="openAdd('payment_statuses')">+ Add</el-button>
        <el-table :data="payStatuses" stripe size="small">
          <el-table-column prop="name" label="Name" />
          <el-table-column label="Color" width="100"><template #default="{row}"><el-tag :color="row.color" size="small">{{ row.color }}</el-tag></template></el-table-column>
          <el-table-column label="Actions" width="140">
            <template #default="{row}"><el-button link type="primary" size="small" @click="openEdit('payment_statuses', row)">Edit</el-button><el-popconfirm title="Delete?" @confirm="handleDelete('payment_statuses', row.id)"><template #reference><el-button link type="danger" size="small">Del</el-button></template></el-popconfirm></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Delivery Staff -->
      <el-tab-pane label="Delivery Staff">
        <el-button size="small" class="btn-dark" style="margin-bottom:10px" @click="openAdd('delivery_staff')">+ Add</el-button>
        <el-table :data="deliveryStaff" stripe size="small">
          <el-table-column prop="name" label="Name" />
          <el-table-column label="Actions" width="140">
            <template #default="{row}"><el-button link type="primary" size="small" @click="openEdit('delivery_staff', row)">Edit</el-button><el-popconfirm title="Delete?" @confirm="handleDelete('delivery_staff', row.id)"><template #reference><el-button link type="danger" size="small">Del</el-button></template></el-popconfirm></template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Warning -->
      <el-tab-pane label="Warning">
        <p style="font-size:13px;color:var(--fg-muted);margin-bottom:12px">Set alert thresholds (hours). Orders exceeding these limits will be pinned to the top of the shipping list.</p>
        <el-form label-position="top" style="max-width:400px">
          <el-form-item label="Pending Alert (hours)">
            <el-input-number v-model="alertCfg.pending_alert_hours" :min="1" :max="999" :step="1" style="width:100%" />
          </el-form-item>
          <el-form-item label="In Transit Alert (hours)">
            <el-input-number v-model="alertCfg.in_transit_alert_hours" :min="1" :max="999" :step="1" style="width:100%" />
          </el-form-item>
          <el-button type="primary" :loading="alertSaving" @click="saveAlert">Save</el-button>
        </el-form>
      </el-tab-pane>
    </el-tabs>

    <!-- Edit Dialog -->
    <el-dialog v-model="showDialog" :title="editTitle" width="400px">
      <el-form label-position="top">
        <el-form-item v-if="editType !== 'delivery_staff'" label="Name"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item v-if="editType === 'delivery_staff'" label="Name"><el-input v-model="editForm.name" /></el-form-item>
        <el-form-item v-if="editType === 'streamers'" label="Commission %"><el-input-number v-model="editForm.commission_rate" :min="0" :max="100" :step="1" style="width:100%" /></el-form-item>
        <el-form-item v-if="editType === 'payment_statuses'" label="Color"><el-color-picker v-model="editForm.color" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showDialog = false">Cancel</el-button>
        <el-button type="primary" @click="handleSave">Save</el-button>
      </template>
    </el-dialog>
  </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'

const streamers = ref([])
const payStatuses = ref([])
const deliveryStaff = ref([])
const showDialog = ref(false)
const editType = ref('')
const editTarget = ref(null)
const editForm = ref({ name: '', commission_rate: 1, color: '#409eff' })

const editTitle = ref('')

async function loadAll() {
  const [s, p, d] = await Promise.all([api.get('/config/streamers'), api.get('/config/payment_statuses'), api.get('/config/delivery_staff')])
  streamers.value = s.data; payStatuses.value = p.data; deliveryStaff.value = d.data
}

function openAdd(type) {
  editType.value = type; editTarget.value = null
  editTitle.value = 'New ' + type.replace('_', ' ')
  editForm.value = { name: '', commission_rate: 1, color: '#409eff' }
  showDialog.value = true
}

function openEdit(type, row) {
  editType.value = type; editTarget.value = row
  editTitle.value = 'Edit ' + type.replace('_', ' ')
  editForm.value = { ...row }
  showDialog.value = true
}

async function handleSave() {
  const type = editType.value
  if (editTarget.value) { await api.put(`/config/${type}/${editTarget.value.id}`, editForm.value) }
  else { await api.post(`/config/${type}`, editForm.value) }
  ElMessage.success('Saved'); showDialog.value = false; loadAll()
}

async function handleDelete(type, id) { await api.delete(`/config/${type}/${id}`); loadAll() }

// Alert config
const alertCfg = ref({ pending_alert_hours: 24, in_transit_alert_hours: 72 })
const alertSaving = ref(false)
async function loadAlert() { try { const { data } = await api.get('/config/alert'); alertCfg.value.pending_alert_hours = parseInt(data.pending_alert_hours) || 24; alertCfg.value.in_transit_alert_hours = parseInt(data.in_transit_alert_hours) || 72 } catch {} }
async function saveAlert() { alertSaving.value = true; try { await api.put('/config/alert', alertCfg.value); ElMessage.success('Saved') } catch { ElMessage.error('Failed') } finally { alertSaving.value = false } }

onMounted(() => { loadAll(); loadAlert() })
</script>
