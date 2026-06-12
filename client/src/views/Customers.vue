<template>
  <div>
    <div class="page-header"><div><h2>Customers</h2><p>Customer profiles, purchase history and streamer assignments.</p></div></div>
    <div class="page-card">

    <!-- Filters -->
    <div style="display:flex;gap:10px;margin-bottom:12px;align-items:center;flex-wrap:wrap">
      <el-input v-model="filters.name" placeholder="Customer name" clearable size="small" style="width:180px" @keyup.enter="loadList" />
      <el-input v-model="filters.phone" placeholder="Phone" clearable size="small" style="width:160px" @keyup.enter="loadList" />
      <el-input v-model="filters.streamer_name" placeholder="Streamer" clearable size="small" style="width:140px" @keyup.enter="loadList" />
      <el-button size="small" class="btn-search" @click="loadList">Search</el-button>
    </div>

    <!-- Table -->
    <el-table :data="list" stripe v-loading="loading" @sort-change="onSortChange">
      <el-table-column prop="customer_name" label="Name" min-width="160" />
      <el-table-column prop="customer_phone" label="Phone" width="140" />
      <el-table-column prop="streamer_name" label="Streamer" width="120" />
      <el-table-column prop="first_order_date" label="First Order" width="130" sortable="custom">
        <template #default="{row}">{{ row.first_order_date?.slice(0,10) || '-' }}</template>
      </el-table-column>
      <el-table-column prop="order_count" label="Orders" width="100" sortable="custom" />
      <el-table-column prop="total_spent" label="Total Spent" width="140" sortable="custom">
        <template #default="{row}">₦{{ Number(row.total_spent || 0).toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="Actions" width="100" fixed="right">
        <template #default="{row}">
          <el-button link type="primary" size="small" @click="viewDetail(row)">Detail</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top:12px;text-align:right">
      <el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50,100]" :total="total" layout="total, sizes, prev, pager, next" @size-change="loadList" @current-change="loadList" />
    </div>

    <!-- Detail Dialog -->
    <el-dialog v-model="showDetail" :title="detailPhone" width="750px">
      <template v-if="detailOrders.length">
        <h4 style="margin-bottom:8px">Purchase History ({{ detailOrders.length }} orders)</h4>
        <el-table :data="detailOrders" size="small" border>
          <el-table-column prop="order_no" label="Order No." width="130" />
          <el-table-column prop="streamer_name" label="Streamer" width="100" />
          <el-table-column label="Total" width="100"><template #default="{r}">₦{{ Number(r.total_amount).toLocaleString() }}</template></el-table-column>
          <el-table-column prop="payment_status_name" label="Payment" width="80" />
          <el-table-column label="Ship Status" width="100">
            <template #default="{r}">{{ shipLabel(r.shipping_status) }}</template>
          </el-table-column>
          <el-table-column label="Date" width="110"><template #default="{r}">{{ r.order_time || r.created_at?.slice(0,10) }}</template></el-table-column>
        </el-table>

        <template v-if="streamerChanges.length">
          <h4 style="margin:16px 0 8px">Streamer Changes</h4>
          <el-table :data="streamerChanges" size="small" border>
            <el-table-column prop="order_no" label="Order No." width="130" />
            <el-table-column prop="from" label="From" width="120" />
            <el-table-column prop="to" label="To" width="120" />
            <el-table-column label="Changed At" width="160"><template #default="{r}">{{ fmtDT(r.changed_at) }}</template></el-table-column>
          </el-table>
        </template>
        <template v-else><p style="color:var(--fg-muted);margin-top:8px">No streamer changes</p></template>
      </template>
    </el-dialog>

  </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filters = reactive({ name: '', phone: '', streamer_name: '' })
const sortBy = ref('first_order_date')
const sortDir = ref('desc')

const showDetail = ref(false)
const detailPhone = ref('')
const detailOrders = ref([])
const streamerChanges = ref([])

function shipLabel(s) { return { pending:'Pending', in_transit:'In Transit', delivered:'Delivered', returned:'Returned' }[s] || s || '-' }
function fmtDT(d) { if (!d) return '-'; const t = new Date(d); return t.toLocaleDateString('en-CA') + ' ' + t.toTimeString().slice(0,8) }

function onSortChange({ prop, order }) {
  if (!order) { sortBy.value = 'first_order_date'; sortDir.value = 'desc' }
  else { sortBy.value = prop; sortDir.value = order === 'ascending' ? 'asc' : 'desc' }
  loadList()
}

async function loadList() {
  loading.value = true
  const params = { page: page.value, page_size: pageSize.value, sort_by: sortBy.value, sort_dir: sortDir.value }
  if (filters.name) params.name = filters.name
  if (filters.phone) params.phone = filters.phone
  if (filters.streamer_name) params.streamer_name = filters.streamer_name
  try {
    const { data } = await api.get('/customers', { params })
    list.value = data.list; total.value = data.total
  } catch {}
  loading.value = false
}

async function viewDetail(row) {
  detailPhone.value = row.customer_phone
  try {
    const { data } = await api.get('/customers/' + encodeURIComponent(row.customer_phone))
    detailOrders.value = data.orders; streamerChanges.value = data.streamer_changes || []
    showDetail.value = true
  } catch {}
}

onMounted(loadList)
</script>
