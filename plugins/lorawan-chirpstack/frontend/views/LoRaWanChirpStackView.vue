<template>
  <section class="chirpstack-page">
    <header class="page-header">
      <div>
        <div class="eyebrow"><span class="live-dot"></span> CHIRPSTACK v4</div>
        <h2>LoRaWAN Network Console</h2>
        <p>Quản lý Network Server, Gateway, thiết bị và theo dõi uplink telemetry.</p>
      </div>
      <div class="header-actions">
        <el-button :loading="loading" :icon="Refresh" @click="refreshAll">Làm mới</el-button>
        <el-button type="primary" :icon="Plus" @click="serverDialogVisible = true">Thêm Network Server</el-button>
      </div>
    </header>

    <el-alert
      v-if="loadError"
      type="warning"
      :closable="false"
      show-icon
      class="load-alert"
      title="Không kết nối được API ChirpStack; đang hiển thị dữ liệu cục bộ gần nhất."
      :description="loadError"
    />

    <el-row :gutter="16" class="summary-row">
      <el-col v-for="item in summaryCards" :key="item.label" :xs="24" :sm="12" :lg="6">
        <el-card shadow="never" class="summary-card">
          <span class="summary-label">{{ item.label }}</span>
          <strong :class="item.className">{{ item.value }}</strong>
          <small>{{ item.hint }}</small>
        </el-card>
      </el-col>
    </el-row>

    <el-tabs v-model="activeTab" class="main-tabs">
      <el-tab-pane label="Network Servers" name="servers">
        <el-card shadow="never">
          <template #header><div class="card-title">ChirpStack Network Servers <span>{{ servers.length }} configured</span></div></template>
          <el-table :data="servers" v-loading="loading" empty-text="Chưa có Network Server">
            <el-table-column prop="name" label="Tên Server" min-width="230" />
            <el-table-column prop="apiUrl" label="API URL" min-width="210" />
            <el-table-column label="Phiên bản" width="130"><template #default="{ row }">{{ row.version || '—' }}</template></el-table-column>
            <el-table-column label="Trạng thái" width="145"><template #default="{ row }"><el-tag :type="statusTagType(row.status)" effect="light">{{ statusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="Fleet" width="135"><template #default="{ row }">{{ row.gatewayCount || 0 }} GW · {{ row.deviceCount || 0 }} Dev</template></el-table-column>
            <el-table-column label="" width="180" align="right"><template #default="{ row }"><el-button link type="primary" :loading="testingId === row.id" @click="testServer(row.id)">Kiểm tra</el-button><el-popconfirm title="Xóa Network Server này?" @confirm="removeServer(row.id)"><template #reference><el-button link type="danger">Xóa</el-button></template></el-popconfirm></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Gateways" name="gateways">
        <div class="tab-toolbar"><span>{{ gateways.length }} gateway đã đăng ký</span><el-button type="primary" plain size="small" :icon="Plus" @click="gatewayDialogVisible = true">Thêm Gateway</el-button></div>
        <el-card shadow="never">
          <el-table :data="gateways" v-loading="loading" empty-text="Chưa có Gateway">
            <el-table-column prop="name" label="Gateway" min-width="230"><template #default="{ row }"><strong>{{ row.name }}</strong><small class="subline">{{ row.description }}</small></template></el-table-column>
            <el-table-column prop="gatewayId" label="Gateway EUI" width="190"><template #default="{ row }"><code>{{ row.gatewayId }}</code></template></el-table-column>
            <el-table-column label="Trạng thái" width="130"><template #default="{ row }"><el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="Lưu lượng" width="160"><template #default="{ row }">Rx {{ row.rxPackets || 0 }} · Tx {{ row.txPackets || 0 }}</template></el-table-column>
            <el-table-column label="Tín hiệu" width="130"><template #default="{ row }">{{ row.rxPacketsPerMinute?.toFixed(1) || '0.0' }} pkt/phút</template></el-table-column>
            <el-table-column label="" width="70"><template #default="{ row }"><el-popconfirm title="Xóa Gateway này?" @confirm="removeGateway(row.gatewayId, row.networkServerId)"><template #reference><el-button link type="danger">Xóa</el-button></template></el-popconfirm></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Devices" name="devices">
        <div class="tab-toolbar"><span>{{ devices.length }} thiết bị LoRaWAN</span><el-button type="primary" plain size="small" :icon="Plus" @click="deviceDialogVisible = true">Thêm Device</el-button></div>
        <el-card shadow="never">
          <el-table :data="devices" v-loading="loading" empty-text="Chưa có Device">
            <el-table-column prop="name" label="Thiết bị" min-width="250"><template #default="{ row }"><strong>{{ row.name }}</strong><small class="subline">{{ row.applicationName || row.applicationId }}</small></template></el-table-column>
            <el-table-column prop="devEui" label="DevEUI" width="190"><template #default="{ row }"><code>{{ row.devEui }}</code></template></el-table-column>
            <el-table-column label="Trạng thái" width="115"><template #default="{ row }"><el-tag :type="statusTagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="Pin" width="100"><template #default="{ row }">{{ row.batteryLevel ?? '—' }}<template v-if="row.batteryLevel !== undefined">%</template></template></el-table-column>
            <el-table-column label="RSSI / SNR" width="145"><template #default="{ row }">{{ row.rssi ?? '—' }} dBm / {{ row.snr ?? '—' }} dB</template></el-table-column>
            <el-table-column label="" width="70"><template #default="{ row }"><el-popconfirm title="Xóa thiết bị này?" @confirm="removeDevice(row.devEui, row.networkServerId)"><template #reference><el-button link type="danger">Xóa</el-button></template></el-popconfirm></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="Uplink Telemetry" name="telemetry">
        <el-card shadow="never">
          <template #header><div class="card-title">Uplink gần đây <span>{{ uplinks.length }} event được đệm trong bộ nhớ</span></div></template>
          <el-table :data="uplinks" v-loading="loading" empty-text="Chưa nhận được uplink nào">
            <el-table-column label="Thời điểm" width="180"><template #default="{ row }">{{ formatTime(row.time) }}</template></el-table-column>
            <el-table-column prop="deviceName" label="Thiết bị" min-width="200"><template #default="{ row }">{{ row.deviceName || row.devEui }}</template></el-table-column>
            <el-table-column label="Port / FCnt" width="125"><template #default="{ row }">{{ row.fPort }} / {{ row.fCnt }}</template></el-table-column>
            <el-table-column label="RSSI / SNR" width="145"><template #default="{ row }">{{ row.rssi }} dBm / {{ row.snr }} dB</template></el-table-column>
            <el-table-column label="Decoded payload" min-width="250"><template #default="{ row }"><code class="payload">{{ stringifyPayload(row.decodedPayload) }}</code></template></el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="serverDialogVisible" title="Thêm ChirpStack Network Server" width="min(560px, 92vw)" @closed="resetServerForm">
      <el-form ref="serverFormRef" :model="serverForm" :rules="serverRules" label-position="top">
        <el-form-item label="Tên hiển thị" prop="name"><el-input v-model="serverForm.name" placeholder="ChirpStack Production" /></el-form-item>
        <el-form-item label="ChirpStack REST API URL" prop="apiUrl"><el-input v-model="serverForm.apiUrl" placeholder="http://localhost:8080" /></el-form-item>
        <el-form-item label="API Token" prop="apiToken"><el-input v-model="serverForm.apiToken" type="password" show-password placeholder="JWT token" /></el-form-item>
        <el-form-item label="Tenant ID" prop="tenantId"><el-input v-model="serverForm.tenantId" placeholder="UUID tenant" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="serverDialogVisible = false">Hủy</el-button><el-button type="primary" :loading="submitting" @click="submitServer">Lưu & kiểm tra kết nối</el-button></template>
    </el-dialog>

    <el-dialog v-model="gatewayDialogVisible" title="Thêm Gateway" width="min(540px, 92vw)" @closed="resetGatewayForm">
      <el-form ref="gatewayFormRef" :model="gatewayForm" :rules="gatewayRules" label-position="top">
        <el-form-item label="Gateway EUI" prop="gatewayId"><el-input v-model="gatewayForm.gatewayId" placeholder="aa555a0000000003" /></el-form-item>
        <el-form-item label="Tên Gateway" prop="name"><el-input v-model="gatewayForm.name" placeholder="Outdoor Gateway" /></el-form-item>
        <el-form-item label="Mô tả"><el-input v-model="gatewayForm.description" /></el-form-item>
        <el-form-item label="Network Server" prop="networkServerId"><el-select v-model="gatewayForm.networkServerId" class="full-width"><el-option v-for="server in servers" :key="server.id" :label="server.name" :value="server.id" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="gatewayDialogVisible = false">Hủy</el-button><el-button type="primary" :loading="submitting" @click="submitGateway">Đăng ký Gateway</el-button></template>
    </el-dialog>

    <el-dialog v-model="deviceDialogVisible" title="Thêm LoRaWAN Device" width="min(560px, 92vw)" @closed="resetDeviceForm">
      <el-form ref="deviceFormRef" :model="deviceForm" :rules="deviceRules" label-position="top">
        <el-form-item label="DevEUI" prop="devEui"><el-input v-model="deviceForm.devEui" placeholder="2cf7f1203230a003" /></el-form-item>
        <el-form-item label="Tên thiết bị" prop="name"><el-input v-model="deviceForm.name" /></el-form-item>
        <el-form-item label="Application ID" prop="applicationId"><el-select v-model="deviceForm.applicationId" class="full-width" filterable allow-create default-first-option><el-option v-for="app in applications" :key="app.id" :label="app.name" :value="app.id" /></el-select></el-form-item>
        <el-form-item label="Device Profile ID" prop="deviceProfileId"><el-select v-model="deviceForm.deviceProfileId" class="full-width" filterable allow-create default-first-option><el-option v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.id" /></el-select></el-form-item>
        <el-form-item label="Network Server" prop="networkServerId"><el-select v-model="deviceForm.networkServerId" class="full-width"><el-option v-for="server in servers" :key="server.id" :label="server.name" :value="server.id" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="deviceDialogVisible = false">Hủy</el-button><el-button type="primary" :loading="submitting" @click="submitDevice">Đăng ký Device</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';

interface NetworkServer { id: string; name: string; apiUrl: string; apiToken?: string; tenantId: string; version?: string; status: string; gatewayCount?: number; deviceCount?: number; }
interface Gateway { gatewayId: string; name: string; description?: string; networkServerId: string; status: string; rxPackets?: number; txPackets?: number; rxPacketsPerMinute?: number; }
interface Device { devEui: string; name: string; applicationId: string; applicationName?: string; networkServerId: string; status: string; batteryLevel?: number; rssi?: number; snr?: number; }
interface Uplink { time: string; devEui: string; deviceName?: string; fPort: number; fCnt: number; rssi: number; snr: number; decodedPayload?: Record<string, unknown>; }
interface Option { id: string; name: string; }

const API_BASE = '/api/plugins/lorawan-chirpstack';
const activeTab = ref('servers');
const loading = ref(false);
const submitting = ref(false);
const testingId = ref('');
const loadError = ref('');
const servers = ref<NetworkServer[]>([]);
const gateways = ref<Gateway[]>([]);
const devices = ref<Device[]>([]);
const uplinks = ref<Uplink[]>([]);
const applications = ref<Option[]>([]);
const profiles = ref<Option[]>([]);
const serverDialogVisible = ref(false);
const gatewayDialogVisible = ref(false);
const deviceDialogVisible = ref(false);
const serverFormRef = ref();
const gatewayFormRef = ref();
const deviceFormRef = ref();

const serverForm = reactive({ name: '', apiUrl: '', apiToken: '', tenantId: '' });
const gatewayForm = reactive({ gatewayId: '', name: '', description: '', networkServerId: '' });
const deviceForm = reactive({ devEui: '', name: '', description: '', applicationId: '', deviceProfileId: '', networkServerId: '' });
const required = (message: string) => [{ required: true, message, trigger: 'blur' }];
const serverRules = { name: required('Nhập tên Network Server'), apiUrl: [...required('Nhập API URL'), { type: 'url', message: 'API URL không hợp lệ', trigger: 'blur' }], apiToken: required('Nhập API token'), tenantId: required('Nhập Tenant ID') };
const gatewayRules = { gatewayId: [...required('Nhập Gateway EUI'), { pattern: /^[0-9a-fA-F]{16}$/, message: 'Gateway EUI phải có 16 ký tự hex', trigger: 'blur' }], name: required('Nhập tên Gateway'), networkServerId: required('Chọn Network Server') };
const deviceRules = { devEui: [...required('Nhập DevEUI'), { pattern: /^[0-9a-fA-F]{16}$/, message: 'DevEUI phải có 16 ký tự hex', trigger: 'blur' }], name: required('Nhập tên thiết bị'), applicationId: required('Chọn Application'), deviceProfileId: required('Chọn Device Profile'), networkServerId: required('Chọn Network Server') };

const summaryCards = computed(() => [
  { label: 'Network Server online', value: servers.value.filter((s) => s.status === 'online').length, hint: `${servers.value.length} server configured`, className: 'green' },
  { label: 'Gateway đang hoạt động', value: gateways.value.filter((g) => g.status === 'online').length, hint: `${gateways.value.length} gateway registered`, className: 'blue' },
  { label: 'Thiết bị active', value: devices.value.filter((d) => d.status === 'active' || d.status === 'online').length, hint: `${devices.value.length} device provisioned`, className: 'purple' },
  { label: 'Uplink đã nhận', value: uplinks.value.length, hint: uplinks.value[0] ? `Mới nhất ${formatTime(uplinks.value[0].time)}` : 'Chờ telemetry', className: 'teal' },
]);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, signal: controller.signal });
    if (!response.ok) throw new Error(`API trả về ${response.status}`);
    return await response.json() as T;
  } finally {
    window.clearTimeout(timer);
  }
}

async function refreshAll() {
  loading.value = true;
  loadError.value = '';
  try {
    const [serverData, gatewayData, deviceData, uplinkData] = await Promise.all([
      request<NetworkServer[]>('/servers'), request<Gateway[]>('/gateways'), request<Device[]>('/devices'), request<Uplink[]>('/uplinks?limit=50'),
    ]);
    servers.value = serverData;
    gateways.value = gatewayData;
    devices.value = deviceData;
    uplinks.value = uplinkData;
    if (servers.value[0]) {
      const [apps, deviceProfiles] = await Promise.all([request<Option[]>(`/applications?serverId=${servers.value[0].id}`), request<Option[]>(`/device-profiles?serverId=${servers.value[0].id}`)]);
      applications.value = apps;
      profiles.value = deviceProfiles;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Không thể tải dữ liệu.';
  } finally {
    loading.value = false;
  }
}

async function testServer(id: string) { testingId.value = id; try { const result = await request<{ success: boolean; message: string }>(`/servers/${id}/test`, { method: 'POST' }); ElMessage[result.success ? 'success' : 'error'](result.message); await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không kiểm tra được kết nối'); } finally { testingId.value = ''; } }
async function removeServer(id: string) { try { await request(`/servers/${id}`, { method: 'DELETE' }); ElMessage.success('Đã xóa Network Server'); await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể xóa'); } }
async function removeGateway(id: string, serverId: string) { try { await request(`/gateways/${id}?serverId=${serverId}`, { method: 'DELETE' }); ElMessage.success('Đã xóa Gateway'); await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể xóa'); } }
async function removeDevice(id: string, serverId: string) { try { await request(`/devices/${id}?serverId=${serverId}`, { method: 'DELETE' }); ElMessage.success('Đã xóa Device'); await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể xóa'); } }
async function submitServer() { const valid = await serverFormRef.value?.validate().catch(() => false); if (!valid) return; submitting.value = true; try { await request('/servers', { method: 'POST', body: JSON.stringify(serverForm) }); ElMessage.success('Đã thêm Network Server'); serverDialogVisible.value = false; await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể lưu'); } finally { submitting.value = false; } }
async function submitGateway() { const valid = await gatewayFormRef.value?.validate().catch(() => false); if (!valid) return; submitting.value = true; try { await request('/gateways', { method: 'POST', body: JSON.stringify(gatewayForm) }); ElMessage.success('Đã đăng ký Gateway'); gatewayDialogVisible.value = false; await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể lưu'); } finally { submitting.value = false; } }
async function submitDevice() { const valid = await deviceFormRef.value?.validate().catch(() => false); if (!valid) return; submitting.value = true; try { await request('/devices', { method: 'POST', body: JSON.stringify(deviceForm) }); ElMessage.success('Đã đăng ký Device'); deviceDialogVisible.value = false; await refreshAll(); } catch (error) { ElMessage.error(error instanceof Error ? error.message : 'Không thể lưu'); } finally { submitting.value = false; } }
function resetServerForm() { Object.assign(serverForm, { name: '', apiUrl: '', apiToken: '', tenantId: '' }); serverFormRef.value?.clearValidate(); }
function resetGatewayForm() { Object.assign(gatewayForm, { gatewayId: '', name: '', description: '', networkServerId: servers.value[0]?.id || '' }); gatewayFormRef.value?.clearValidate(); }
function resetDeviceForm() { Object.assign(deviceForm, { devEui: '', name: '', description: '', applicationId: applications.value[0]?.id || '', deviceProfileId: profiles.value[0]?.id || '', networkServerId: servers.value[0]?.id || '' }); deviceFormRef.value?.clearValidate(); }
function statusTagType(status: string) { return ['online', 'active'].includes(status) ? 'success' : status === 'offline' ? 'danger' : status === 'untested' ? 'warning' : 'info'; }
function statusText(status: string) { return ({ online: 'Online', active: 'Active', offline: 'Offline', inactive: 'Inactive', untested: 'Chưa kiểm tra' } as Record<string, string>)[status] || status; }
function formatTime(value: string) { return new Date(value).toLocaleString('vi-VN'); }
function stringifyPayload(payload?: Record<string, unknown>) { return payload ? JSON.stringify(payload) : '—'; }
onMounted(refreshAll);
</script>

<style scoped>
.chirpstack-page { max-width: 1440px; margin: 0 auto; padding: 4px 4px 28px; }
.page-header { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; margin-bottom: 20px; }
.eyebrow { color: #0891b2; font-size: 11px; font-weight: 700; letter-spacing: .1em; margin-bottom: 5px; }.live-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #10b981; margin-right: 5px; box-shadow: 0 0 5px #10b981; }
h2 { margin: 0; color: #1e293b; font-size: 25px; } .page-header p { color: #64748b; margin: 7px 0 0; }.header-actions { display: flex; gap: 8px; flex-wrap: wrap; }.load-alert { margin-bottom: 16px; }.summary-row { margin-bottom: 20px; }.summary-card { min-height: 112px; border-color: #e2e8f0; }.summary-card :deep(.el-card__body) { display: flex; flex-direction: column; gap: 5px; }.summary-label { color: #64748b; font-size: 13px; }.summary-card strong { font-size: 28px; line-height: 1; }.summary-card small { color: #94a3b8; font-size: 11px; }.green { color: #10b981; }.blue { color: #3b82f6; }.purple { color: #8b5cf6; }.teal { color: #0d9488; }.main-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }.card-title { display: flex; align-items: baseline; gap: 8px; font-weight: 600; color: #334155; }.card-title span { font-size: 12px; color: #94a3b8; font-weight: 400; }.tab-toolbar { display: flex; justify-content: space-between; align-items: center; color: #64748b; font-size: 13px; margin: 0 0 12px; }.subline { display: block; color: #94a3b8; font-size: 11px; margin-top: 3px; } code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #475569; }.payload { white-space: normal; word-break: break-all; }.full-width { width: 100%; }
@media (max-width: 680px) { .page-header { flex-direction: column; }.header-actions { width: 100%; }.cs-widget-stats { grid-template-columns: repeat(2, 1fr); } }
</style>
