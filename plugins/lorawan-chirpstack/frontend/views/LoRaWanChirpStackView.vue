<template>
  <section class="chirpstack-page w-full max-w-[1720px] mx-auto p-4 md:p-6 space-y-4">
    <header class="page-header flex flex-wrap items-center justify-between gap-4 p-4 md:p-5 bg-base-200/60 border border-base-300 rounded-xl backdrop-blur-md shadow-sm mb-4">
      <div>
        <div class="eyebrow flex items-center gap-2 text-xs font-mono text-primary font-bold mb-0.5">
          <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></span>
          CHIRPSTACK v4
        </div>
        <h2 class="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2.5 mt-0.5">
          <Radio class="w-6 h-6 text-primary" />
          <span>LoRaWAN Network Console</span>
        </h2>
        <p class="subtitle text-xs text-base-content/70 mt-1">Quản lý Network Server, Gateway, thiết bị và theo dõi uplink telemetry.</p>
      </div>
      <div class="header-actions flex items-center gap-2">
        <button
          type="button"
          class="btn btn-outline btn-sm gap-2"
          :disabled="loading"
          @click="refreshAll"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
          Làm mới
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm gap-2 shadow-sm"
          @click="serverDialogVisible = true"
        >
          <Plus class="w-4 h-4" />
          Thêm Network Server
        </button>
      </div>
    </header>

    <div
      v-if="loadError"
      class="alert alert-warning shadow-sm flex items-start gap-3 border border-warning/30"
    >
      <AlertTriangle class="w-5 h-5 flex-shrink-0 text-warning mt-0.5" />
      <div class="flex-1">
        <div class="font-bold text-sm">Không kết nối được API ChirpStack; đang hiển thị dữ liệu cục bộ gần nhất.</div>
        <div class="text-xs opacity-90 mt-0.5 font-mono">{{ loadError }}</div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="item in summaryCards"
        :key="item.label"
        class="card bg-base-200/60 border border-base-300 rounded-xl shadow-sm p-4 backdrop-blur-md flex flex-col justify-between min-h-[110px]"
      >
        <span class="text-xs font-mono text-base-content/60 uppercase tracking-wider">{{ item.label }}</span>
        <strong class="text-3xl font-mono font-bold my-1" :class="item.colorClass">{{ item.value }}</strong>
        <small class="text-[11px] text-base-content/50">{{ item.hint }}</small>
      </div>
    </div>

    <!-- Main Navigation Tabs -->
    <div v-if="!isIsolatedView" role="tablist" class="tabs tabs-boxed bg-base-200/60 p-1 mb-4 border border-base-300 rounded-xl flex flex-wrap gap-1">
      <button
        v-for="t in tabList"
        :key="t.name"
        role="tab"
        type="button"
        class="tab font-semibold transition-all flex items-center gap-2 rounded-lg"
        :class="{ 'tab-active !bg-primary !text-primary-content shadow-sm': activeTab === t.name }"
        @click="activeTab = t.name"
      >
        <component :is="t.icon" class="w-4 h-4 mr-1 inline-block" />
        {{ t.label }}
      </button>
    </div>

    <!-- Tab 1: Network Servers -->
    <div v-if="activeTab === 'servers'" class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-base-content/10 flex items-center justify-between">
        <div class="font-bold text-base flex items-baseline gap-2">
          ChirpStack Network Servers
          <span class="text-xs font-normal text-base-content/60 font-mono">{{ servers.length }} configured</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-zebra table-sm w-full">
          <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
            <tr>
              <th>Tên Server</th>
              <th>API URL</th>
              <th>Tenant ID</th>
              <th>Application ID</th>
              <th>Device Profile ID</th>
              <th>Phiên bản</th>
              <th>Trạng thái</th>
              <th>Fleet</th>
              <th class="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && servers.length === 0">
              <td colspan="9" class="text-center py-8 text-base-content/50">
                <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải danh sách server...
              </td>
            </tr>
            <tr v-else-if="servers.length === 0">
              <td colspan="9" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có Network Server</td>
            </tr>
            <tr v-for="row in servers" :key="row.id">
              <td class="font-medium text-base-content">{{ row.name }}</td>
              <td class="font-mono text-xs text-base-content/70">{{ row.apiUrl }}</td>
              <td class="font-mono text-xs text-base-content/80">
                <span class="badge badge-sm badge-ghost font-mono text-[11px]">{{ row.tenantId || '—' }}</span>
                <span v-if="row.tenantId" class="badge badge-xs badge-success/20 text-success ml-1 font-mono">Default</span>
              </td>
              <td class="font-mono text-xs text-base-content/80">
                <span class="badge badge-sm badge-ghost font-mono text-[11px] text-primary">{{ row.applicationId || '—' }}</span>
                <span v-if="row.applicationId" class="badge badge-xs badge-primary/20 text-primary ml-1 font-mono">Default</span>
              </td>
              <td class="font-mono text-xs text-base-content/80">
                <span class="badge badge-sm badge-ghost font-mono text-[11px] text-info">Động theo Region</span>
              </td>
              <td class="font-mono text-xs">{{ row.version || '—' }}</td>
              <td>
                <span class="badge badge-sm font-mono text-xs" :class="statusBadgeClass(row.status)">
                  {{ statusText(row.status) }}
                </span>
              </td>
              <td class="font-mono text-xs text-base-content/80">{{ row.gatewayCount || 0 }} GW · {{ row.deviceCount || 0 }} Dev</td>
              <td class="text-right space-x-1">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-info hover:bg-info/10 font-mono"
                  @click="openEditServerModal(row)"
                >
                  Sửa / Mặc định
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-primary"
                  :disabled="testingId === row.id"
                  @click="testServer(row.id)"
                >
                  <span v-if="testingId === row.id" class="loading loading-spinner loading-xs mr-1"></span>
                  Kiểm tra
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                  @click="confirmRemoveServer(row.id)"
                >
                  Xóa
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tab 2: Tenants -->
    <div v-if="activeTab === 'tenants'" class="space-y-3">
      <div class="flex justify-between items-center px-1">
        <span class="text-xs font-mono text-base-content/60">{{ tenants.length }} tenant</span>
        <button type="button" class="btn btn-outline btn-primary btn-sm gap-1.5" @click="tenantDialogVisible = true">
          <Plus class="w-4 h-4" /> Thêm Tenant
        </button>
      </div>
      <div class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
              <tr>
                <th>Tên Tenant</th>
                <th>Tenant ID</th>
                <th>Mô tả</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="tenantsLoading">
                <td colspan="4" class="text-center py-8 text-base-content/50">
                  <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải tenants...
                </td>
              </tr>
              <tr v-else-if="tenants.length === 0">
                <td colspan="4" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có Tenant hoặc chưa chọn Network Server</td>
              </tr>
              <tr v-for="row in tenants" :key="row.id">
                <td class="font-medium text-base-content">
                  {{ row.name }}
                  <span v-if="row.id === activeServerTenantId" class="badge badge-success badge-xs font-mono ml-1.5">DEFAULT TENANT</span>
                </td>
                <td><code class="text-xs font-mono text-primary bg-base-300/60 px-1.5 py-0.5 rounded">{{ row.id }}</code></td>
                <td class="text-xs text-base-content/70">{{ row.description || '—' }}</td>
                <td class="text-right space-x-1">
                  <button
                    v-if="row.id !== activeServerTenantId"
                    type="button"
                    class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1 font-mono"
                    :disabled="settingDefaultTenantId === row.id"
                    @click="setDefaultTenant(row.id)"
                  >
                    <span v-if="settingDefaultTenantId === row.id" class="loading loading-spinner loading-xs"></span>
                    ⭐ Đặt làm Default
                  </button>
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                    @click="confirmRemoveTenant(row.id)"
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 2.5: Applications -->
    <div v-if="activeTab === 'applications'" class="space-y-3">
      <div class="flex justify-between items-center px-1">
        <span class="text-xs font-mono text-base-content/60">{{ applications.length }} application</span>
      </div>
      <div class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
              <tr>
                <th>Tên Application</th>
                <th>Application ID</th>
                <th>Mô tả</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="applicationsLoading">
                <td colspan="4" class="text-center py-8 text-base-content/50">
                  <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải applications...
                </td>
              </tr>
              <tr v-else-if="applications.length === 0">
                <td colspan="4" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có Application hoặc chưa kết nối được</td>
              </tr>
              <tr v-for="row in applications" :key="row.id">
                <td class="font-medium text-base-content">
                  {{ row.name }}
                  <span v-if="row.id === activeServerAppId" class="badge badge-primary badge-xs font-mono ml-1.5">DEFAULT APP</span>
                </td>
                <td><code class="text-xs font-mono text-primary bg-base-300/60 px-1.5 py-0.5 rounded">{{ row.id }}</code></td>
                <td class="text-xs text-base-content/70">{{ row.description || '—' }}</td>
                <td class="text-right space-x-1">
                  <button
                    v-if="row.id !== activeServerAppId"
                    type="button"
                    class="btn btn-ghost btn-xs text-primary hover:bg-primary/10 gap-1 font-mono"
                    :disabled="settingDefaultAppId === row.id"
                    @click="setDefaultApplication(row.id)"
                  >
                    <span v-if="settingDefaultAppId === row.id" class="loading loading-spinner loading-xs"></span>
                    ⭐ Đặt làm Default
                  </button>
                  <span v-else class="text-xs font-mono text-primary font-bold">Mặc định</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 3: Gateways -->
    <div v-if="activeTab === 'gateways'" class="space-y-3">
      <div class="flex justify-between items-center px-1">
        <span class="text-xs font-mono text-base-content/60">{{ gateways.length }} gateway đã đăng ký</span>
        <button type="button" class="btn btn-outline btn-primary btn-sm gap-1.5" @click="gatewayDialogVisible = true">
          <Plus class="w-4 h-4" /> Thêm Gateway
        </button>
      </div>
      <div class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
              <tr>
                <th>Gateway</th>
                <th>Gateway EUI</th>
                <th>Trạng thái</th>
                <th>Lưu lượng</th>
                <th>Tín hiệu</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading && gateways.length === 0">
                <td colspan="6" class="text-center py-8 text-base-content/50">
                  <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải gateways...
                </td>
              </tr>
              <tr v-else-if="gateways.length === 0">
                <td colspan="6" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có Gateway</td>
              </tr>
              <tr v-for="row in gateways" :key="row.gatewayId">
                <td>
                  <div class="font-medium text-base-content">{{ row.name }}</div>
                  <div class="text-[11px] text-base-content/50 mt-0.5">{{ row.description || '—' }}</div>
                </td>
                <td><code class="text-xs font-mono text-primary bg-base-300/60 px-1.5 py-0.5 rounded">{{ row.gatewayId }}</code></td>
                <td>
                  <span class="badge badge-sm font-mono text-xs" :class="statusBadgeClass(row.status)">
                    {{ statusText(row.status) }}
                  </span>
                </td>
                <td class="font-mono text-xs text-base-content/80">Rx {{ row.rxPackets || 0 }} · Tx {{ row.txPackets || 0 }}</td>
                <td class="font-mono text-xs text-base-content/80">{{ row.rxPacketsPerMinute?.toFixed(1) || '0.0' }} pkt/phút</td>
                <td class="text-right">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                    @click="confirmRemoveGateway(row.gatewayId, row.networkServerId)"
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 4: Devices -->
    <div v-if="activeTab === 'devices'" class="space-y-3">
      <div class="flex justify-between items-center px-1">
        <span class="text-xs font-mono text-base-content/60">{{ devices.length }} thiết bị đã cấu hình</span>
        <button type="button" class="btn btn-outline btn-primary btn-sm gap-1.5" @click="deviceDialogVisible = true">
          <Plus class="w-4 h-4" /> Thêm Thiết bị
        </button>
      </div>
      <div class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
              <tr>
                <th>Thiết bị</th>
                <th>DevEUI</th>
                <th>Trạng thái</th>
                <th>Lưu lượng</th>
                <th>Telemetry gần nhất</th>
                <th class="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading && devices.length === 0">
                <td colspan="6" class="text-center py-8 text-base-content/50">
                  <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải thiết bị...
                </td>
              </tr>
              <tr v-else-if="devices.length === 0">
                <td colspan="6" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có thiết bị</td>
              </tr>
              <tr v-for="row in devices" :key="row.devEui">
                <td>
                  <div class="font-medium text-base-content">{{ row.name }}</div>
                  <div class="text-[11px] text-base-content/50 mt-0.5">{{ row.description || '—' }}</div>
                </td>
                <td><code class="text-xs font-mono text-primary bg-base-300/60 px-1.5 py-0.5 rounded">{{ row.devEui }}</code></td>
                <td>
                  <span class="badge badge-sm font-mono text-xs" :class="statusBadgeClass(row.status)">
                    {{ statusText(row.status) }}
                  </span>
                </td>
                <td class="font-mono text-xs text-base-content/80">Rx {{ row.rxPackets || 0 }} · Tx {{ row.txPackets || 0 }}</td>
                <td class="text-xs text-base-content/80">
                  <div v-if="row.lastTelemetry" class="space-y-0.5 font-mono text-[11px]">
                    <div>RSSI {{ row.lastTelemetry.rssi }} dBm · SNR {{ row.lastTelemetry.snr }} dB</div>
                    <div class="text-[10px] text-base-content/50">{{ formatTime(row.lastTelemetry.time) }}</div>
                  </div>
                  <span v-else class="text-base-content/40">Chưa có uplink</span>
                </td>
                <td class="text-right">
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs text-error hover:bg-error/10"
                    @click="confirmRemoveDevice(row.devEui, row.networkServerId)"
                  >
                    Xóa
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Tab 5: Uplink Telemetry -->
    <div v-if="activeTab === 'telemetry'" class="card bg-base-200/50 border border-base-content/10 shadow-sm overflow-hidden">
      <div class="p-4 border-b border-base-content/10 flex items-center justify-between">
        <div class="font-bold text-base flex items-baseline gap-2">
          Uplink Telemetry Gần Nhất
          <span class="text-xs font-normal text-base-content/60 font-mono">{{ uplinks.length }} bản ghi gần nhất</span>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="table table-zebra table-sm w-full">
          <thead class="bg-base-300/60 font-mono text-xs uppercase text-base-content/70">
            <tr>
              <th>Thời gian</th>
              <th>DevEUI</th>
              <th>Tần số</th>
              <th>DR</th>
              <th>RSSI / SNR</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading && uplinks.length === 0">
              <td colspan="6" class="text-center py-8 text-base-content/50">
                <span class="loading loading-spinner loading-md text-primary mr-2"></span> Đang tải uplink...
              </td>
            </tr>
            <tr v-else-if="uplinks.length === 0">
              <td colspan="6" class="text-center py-8 text-base-content/40 font-mono text-sm">Chưa có bản ghi uplink nào</td>
            </tr>
            <tr v-for="(row, idx) in uplinks" :key="idx">
              <td class="font-mono text-xs text-base-content/70">{{ formatTime(row.time) }}</td>
              <td><code class="text-xs font-mono text-primary bg-base-300/60 px-1.5 py-0.5 rounded">{{ row.devEui }}</code></td>
              <td class="font-mono text-xs">{{ row.frequency ? (row.frequency / 1000000).toFixed(1) + ' MHz' : '—' }}</td>
              <td class="font-mono text-xs">DR{{ row.dr ?? '—' }}</td>
              <td class="font-mono text-xs">{{ row.rssi }} dBm / {{ row.snr }} dB</td>
              <td>
                <span class="font-mono text-xs break-all select-all text-base-content/90">{{ row.payload || '—' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dialog: Server Modal -->
    <dialog class="modal" :class="{ 'modal-open': serverDialogVisible }">
      <div class="modal-box bg-base-200 border border-base-content/15 shadow-2xl max-w-lg">
        <h3 class="font-bold text-lg text-base-content mb-4 flex items-center gap-2">
          <Server class="w-5 h-5 text-primary" />
          {{ editingServerId ? 'Chỉnh sửa & Thiết lập Mặc định Network Server' : 'Thêm ChirpStack Network Server' }}
        </h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Tên hiển thị *</span></label>
            <input v-model="serverForm.name" type="text" placeholder="ChirpStack EU868 Production" class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">API URL (ChirpStack v4 gRPC-web / REST) *</span></label>
            <input v-model="serverForm.apiUrl" type="text" placeholder="http://192.168.1.100:8080" class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">API Token (JWT từ ChirpStack Console) *</span></label>
            <input v-model="serverForm.apiToken" type="password" placeholder="eyJhbGciOi..." class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs font-medium">Default Tenant ID *</span>
              <span class="label-text-alt text-[10px] text-success font-mono uppercase font-bold">Mặc định</span>
            </label>
            <input v-model="serverForm.tenantId" type="text" placeholder="UUID Tenant mặc định (ví dụ: 52f14fb4-c5a1-4566-9b57-69502b78a9c1)" class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1">
              <span class="label-text text-xs font-medium">Default Application ID *</span>
              <span class="label-text-alt text-[10px] text-primary font-mono uppercase font-bold">Mặc định</span>
            </label>
            <input v-model="serverForm.applicationId" type="text" placeholder="UUID hoặc ID Application mặc định (ví dụ: app-iot-monitoring)" class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="p-3 bg-base-300/40 rounded-lg border border-base-content/10 text-xs text-base-content/70 space-y-1">
            <div class="flex items-center gap-1.5 font-semibold text-info">
              <Cpu class="w-3.5 h-3.5" />
              <span>Device Profile (Tự động tra cứu theo Tenant)</span>
            </div>
            <p class="text-[11px] leading-relaxed text-base-content/60">
              Không gán cố định Device Profile. Hệ thống tự động gọi API <code class="text-primary font-mono text-[10px]">/api/device-profiles</code> theo Default Tenant ID và phân giải Profile tương thích với Region (Thanh ghi 69) và Class (Thanh ghi 85) khi tạo thiết bị test.
            </p>
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Mô tả</span></label>
            <input v-model="serverForm.description" type="text" placeholder="Mô tả server..." class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
        </div>
        <div class="modal-action mt-6">
          <button type="button" class="btn btn-sm btn-ghost" @click="closeServerModal">Hủy</button>
          <button type="button" class="btn btn-sm btn-primary" :disabled="submitting" @click="submitServer">
            <span v-if="submitting" class="loading loading-spinner loading-xs mr-1"></span>
            {{ editingServerId ? 'Lưu Thiết Lập Mặc Định' : 'Lưu Server' }}
          </button>
        </div>
      </div>
    </dialog>

    <!-- Dialog: Tenant Modal -->
    <dialog class="modal" :class="{ 'modal-open': tenantDialogVisible }">
      <div class="modal-box bg-base-200 border border-base-content/15 shadow-2xl max-w-md">
        <h3 class="font-bold text-lg text-base-content mb-4 flex items-center gap-2">
          <Users class="w-5 h-5 text-primary" />
          Thêm Tenant mới
        </h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Tên Tenant *</span></label>
            <input v-model="tenantForm.name" type="text" placeholder="Khách hàng A / Dự án Smart Farm" class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Mô tả</span></label>
            <input v-model="tenantForm.description" type="text" placeholder="Mô tả tenant..." class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
        </div>
        <div class="modal-action mt-6">
          <button type="button" class="btn btn-sm btn-ghost" @click="tenantDialogVisible = false">Hủy</button>
          <button type="button" class="btn btn-sm btn-primary" :disabled="submitting" @click="submitTenant">
            <span v-if="submitting" class="loading loading-spinner loading-xs mr-1"></span>
            Tạo Tenant
          </button>
        </div>
      </div>
    </dialog>

    <!-- Dialog: Gateway Modal -->
    <dialog class="modal" :class="{ 'modal-open': gatewayDialogVisible }">
      <div class="modal-box bg-base-200 border border-base-content/15 shadow-2xl max-w-lg">
        <h3 class="font-bold text-lg text-base-content mb-4 flex items-center gap-2">
          <Wifi class="w-5 h-5 text-primary" />
          Đăng ký Gateway vào ChirpStack
        </h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Tên Gateway *</span></label>
            <input v-model="gatewayForm.name" type="text" placeholder="GW-Outdoor-01" class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Gateway EUI (16 hex chars) *</span></label>
            <input v-model="gatewayForm.gatewayId" type="text" placeholder="a84041ffff1e2d3c" maxlength="16" class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Mô tả vị trí</span></label>
            <input v-model="gatewayForm.description" type="text" placeholder="Tầng thượng toà nhà B" class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
        </div>
        <div class="modal-action mt-6">
          <button type="button" class="btn btn-sm btn-ghost" @click="gatewayDialogVisible = false">Hủy</button>
          <button type="button" class="btn btn-sm btn-primary" :disabled="submitting" @click="submitGateway">
            <span v-if="submitting" class="loading loading-spinner loading-xs mr-1"></span>
            Đăng ký Gateway
          </button>
        </div>
      </div>
    </dialog>

    <!-- Dialog: Device Modal -->
    <dialog class="modal" :class="{ 'modal-open': deviceDialogVisible }">
      <div class="modal-box bg-base-200 border border-base-content/15 shadow-2xl max-w-lg">
        <h3 class="font-bold text-lg text-base-content mb-4 flex items-center gap-2">
          <Cpu class="w-5 h-5 text-primary" />
          Đăng ký Thiết bị LoRaWAN
        </h3>
        <div class="space-y-3">
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Tên Thiết bị *</span></label>
            <input v-model="deviceForm.name" type="text" placeholder="Cảm biến Nhiệt độ 01" class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">DevEUI (16 hex chars) *</span></label>
            <input v-model="deviceForm.devEui" type="text" placeholder="0004a30b001c2b3a" maxlength="16" class="input input-sm input-bordered bg-base-100 font-mono text-xs w-full" />
          </div>
          <div class="form-control">
            <label class="label py-1"><span class="label-text text-xs font-medium">Mô tả</span></label>
            <input v-model="deviceForm.description" type="text" placeholder="Vị trí phòng máy..." class="input input-sm input-bordered bg-base-100 w-full" />
          </div>
        </div>
        <div class="modal-action mt-6">
          <button type="button" class="btn btn-sm btn-ghost" @click="deviceDialogVisible = false">Hủy</button>
          <button type="button" class="btn btn-sm btn-primary" :disabled="submitting" @click="submitDevice">
            <span v-if="submitting" class="loading loading-spinner loading-xs mr-1"></span>
            Đăng ký Thiết bị
          </button>
        </div>
      </div>
    </dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  RefreshCw,
  Plus,
  Trash2,
  AlertTriangle,
  Server,
  Users,
  Wifi,
  Cpu,
  Radio,
  Activity,
  Layers
} from 'lucide-vue-next';
import { cyberToast, cyberConfirm } from '@/cyber/hud';

interface NetworkServer {
  id: string;
  name: string;
  apiUrl: string;
  apiToken?: string;
  tenantId?: string;
  applicationId?: string;
  deviceProfileId?: string;
  version?: string;
  status: 'online' | 'offline' | 'unknown';
  gatewayCount?: number;
  deviceCount?: number;
}

interface Tenant {
  id: string;
  name: string;
  description?: string;
}

interface Gateway {
  gatewayId: string;
  name: string;
  description?: string;
  status: 'online' | 'offline';
  rxPackets?: number;
  txPackets?: number;
  rxPacketsPerMinute?: number;
  networkServerId?: string;
}

interface Device {
  devEui: string;
  name: string;
  description?: string;
  status: 'active' | 'online' | 'inactive';
  rxPackets?: number;
  txPackets?: number;
  networkServerId?: string;
  lastTelemetry?: {
    rssi: number;
    snr: number;
    time: string;
  };
}

interface Uplink {
  time: string;
  devEui: string;
  frequency?: number;
  dr?: number;
  rssi?: number;
  snr?: number;
  payload?: string;
}

const API_BASE = '/api/plugins/lorawan-chirpstack';

const loading = ref(false);
const loadError = ref('');
const testingId = ref<string | null>(null);
const submitting = ref(false);
const tenantsLoading = ref(false);

const route = useRoute();
const isIsolatedView = computed(() => route.query.from === 'menu' || route.query.isolated === 'true');
const activeTab = ref('servers');
watch(() => route.query.tab, (value) => {
  const tab = value === 'overview' ? 'servers' : value;
  if (typeof tab === 'string' && ["servers","tenants","applications","gateways","devices","telemetry"].includes(tab)) activeTab.value = tab as typeof activeTab.value;
}, { immediate: true });

const tabList = [
  { name: 'servers', label: 'Network Servers', icon: Server },
  { name: 'tenants', label: 'Tenants', icon: Users },
  { name: 'applications', label: 'Applications', icon: Layers },
  { name: 'gateways', label: 'Gateways', icon: Wifi },
  { name: 'devices', label: 'Devices', icon: Cpu },
  { name: 'telemetry', label: 'Uplink Telemetry', icon: Activity },
];

const servers = ref<NetworkServer[]>([]);
const tenants = ref<Tenant[]>([]);
const applications = ref<any[]>([]);
const gateways = ref<Gateway[]>([]);
const devices = ref<Device[]>([]);
const uplinks = ref<Uplink[]>([]);

const serverDialogVisible = ref(false);
const tenantDialogVisible = ref(false);
const gatewayDialogVisible = ref(false);
const deviceDialogVisible = ref(false);
const editingServerId = ref<string | null>(null);
const settingDefaultTenantId = ref('');
const settingDefaultAppId = ref('');
const applicationsLoading = ref(false);

const activeServerTenantId = computed(() => {
  return servers.value[0]?.tenantId || null;
});

const activeServerAppId = computed(() => {
  return servers.value[0]?.applicationId || null;
});

const serverForm = reactive({
  name: '',
  apiUrl: '',
  apiToken: '',
  tenantId: '',
  applicationId: '',
  deviceProfileId: '',
  description: '',
});
const tenantForm = reactive({ name: '', description: '' });
const gatewayForm = reactive({ name: '', gatewayId: '', description: '' });
const deviceForm = reactive({ name: '', devEui: '', description: '' });

const summaryCards = computed(() => [
  {
    label: 'Network Server online',
    value: servers.value.filter((s) => s.status === 'online').length,
    hint: `${servers.value.length} server configured`,
    colorClass: 'text-emerald-400',
  },
  {
    label: 'Gateway đang hoạt động',
    value: gateways.value.filter((g) => g.status === 'online').length,
    hint: `${gateways.value.length} gateway registered`,
    colorClass: 'text-cyan-400',
  },
  {
    label: 'Thiết bị active',
    value: devices.value.filter((d) => d.status === 'active' || d.status === 'online').length,
    hint: `${devices.value.length} device provisioned`,
    colorClass: 'text-purple-400',
  },
  {
    label: 'Uplink đã nhận',
    value: uplinks.value.length,
    hint: uplinks.value[0] ? `Mới nhất ${formatTime(uplinks.value[0].time)}` : 'Chờ telemetry',
    colorClass: 'text-teal-400',
  },
]);

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`API trả về ${response.status}`);
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

async function refreshAll() {
  loading.value = true;
  loadError.value = '';
  try {
    const [serverData, gatewayData, deviceData, uplinkData] = await Promise.all([
      request<NetworkServer[]>('/servers'),
      request<Gateway[]>('/gateways'),
      request<Device[]>('/devices'),
      request<Uplink[]>('/uplinks?limit=50'),
    ]);
    servers.value = serverData;
    await fetchTenants();
    gateways.value = gatewayData;
    devices.value = deviceData;
    uplinks.value = uplinkData;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Lỗi không xác định khi tải dữ liệu ChirpStack.';
    cyberToast.warning('Không kết nối được ChirpStack backend');
  } finally {
    loading.value = false;
  }
}

async function fetchTenants() {
  const serverId = servers.value[0]?.id;
  if (!serverId) {
    tenants.value = [];
    return;
  }
  tenantsLoading.value = true;
  try {
    tenants.value = await request<Tenant[]>(`/tenants?serverId=${encodeURIComponent(serverId)}`);
  } catch (error) {
    tenants.value = [];
    loadError.value = error instanceof Error ? error.message : 'Không thể tải Tenant.';
  } finally {
    tenantsLoading.value = false;
  }
}

function resetTenantForm() {
  Object.assign(tenantForm, { name: '', description: '' });
}

async function submitTenant() {
  if (!tenantForm.name.trim()) {
    cyberToast.warning('Vui lòng nhập tên Tenant');
    return;
  }
  const serverId = servers.value[0]?.id;
  if (!serverId) {
    cyberToast.error('Hãy thêm Network Server trước');
    return;
  }
  submitting.value = true;
  try {
    await request('/tenants', { method: 'POST', body: JSON.stringify({ ...tenantForm, serverId }) });
    cyberToast.success('Đã tạo Tenant');
    tenantDialogVisible.value = false;
    resetTenantForm();
    await fetchTenants();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể tạo Tenant');
  } finally {
    submitting.value = false;
  }
}

async function confirmRemoveTenant(id: string) {
  const confirmed = await cyberConfirm('Bạn có chắc chắn muốn xóa Tenant này?');
  if (!confirmed) return;
  const serverId = servers.value[0]?.id;
  if (!serverId) return;
  try {
    await request(`/tenants/${id}?serverId=${encodeURIComponent(serverId)}`, { method: 'DELETE' });
    cyberToast.success('Đã xóa Tenant');
    await fetchTenants();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể xóa Tenant');
  }
}

function resetServerForm() {
  Object.assign(serverForm, {
    name: '',
    apiUrl: '',
    apiToken: '',
    tenantId: '',
    applicationId: '',
    deviceProfileId: '',
    description: '',
  });
}

function openEditServerModal(row: NetworkServer) {
  editingServerId.value = row.id;
  Object.assign(serverForm, {
    name: row.name || '',
    apiUrl: row.apiUrl || '',
    apiToken: row.apiToken || '',
    tenantId: row.tenantId || '',
    applicationId: row.applicationId || '',
    deviceProfileId: row.deviceProfileId || '',
    description: '',
  });
  serverDialogVisible.value = true;
}

function closeServerModal() {
  serverDialogVisible.value = false;
  editingServerId.value = null;
  resetServerForm();
}

async function setDefaultTenant(tenantId: string) {
  const targetServerId = servers.value[0]?.id;
  if (!targetServerId) {
    cyberToast.warning('Vui lòng chọn hoặc cấu hình Network Server trước');
    return;
  }
  settingDefaultTenantId.value = tenantId;
  try {
    await request(`/servers/${targetServerId}`, {
      method: 'PUT',
      body: JSON.stringify({ tenantId }),
    });
    cyberToast.success('Đã thiết lập Default Tenant ID thành công!');
    await refreshAll();
  } catch (err: any) {
    cyberToast.error(err instanceof Error ? err.message : 'Không thể thiết lập Default Tenant');
  } finally {
    settingDefaultTenantId.value = '';
  }
}

async function setDefaultApplication(applicationId: string) {
  const targetServerId = servers.value[0]?.id;
  if (!targetServerId) {
    cyberToast.warning('Vui lòng chọn hoặc cấu hình Network Server trước');
    return;
  }
  settingDefaultAppId.value = applicationId;
  try {
    await request(`/servers/${targetServerId}`, {
      method: 'PUT',
      body: JSON.stringify({ applicationId }),
    });
    cyberToast.success('Đã thiết lập Default Application ID thành công!');
    await refreshAll();
  } catch (err: any) {
    cyberToast.error(err instanceof Error ? err.message : 'Không thể thiết lập Default Application');
  } finally {
    settingDefaultAppId.value = '';
  }
}

async function submitServer() {
  if (
    !serverForm.name.trim() ||
    !serverForm.apiUrl.trim() ||
    !serverForm.apiToken.trim() ||
    !serverForm.tenantId.trim() ||
    !serverForm.applicationId.trim()
  ) {
    cyberToast.warning('Vui lòng điền đủ Tên, API URL, API Token, Default Tenant ID và Default Application ID');
    return;
  }
  submitting.value = true;
  try {
    if (editingServerId.value) {
      await request(`/servers/${editingServerId.value}`, {
        method: 'PUT',
        body: JSON.stringify(serverForm),
      });
      cyberToast.success('Đã cập nhật Network Server và thiết lập mặc định!');
    } else {
      await request('/servers', { method: 'POST', body: JSON.stringify(serverForm) });
      cyberToast.success('Đã lưu Network Server');
    }
    closeServerModal();
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể lưu Server');
  } finally {
    submitting.value = false;
  }
}

async function confirmRemoveServer(id: string) {
  const confirmed = await cyberConfirm('Bạn có chắc chắn muốn xóa Network Server này?');
  if (!confirmed) return;
  try {
    await request(`/servers/${id}`, { method: 'DELETE' });
    cyberToast.success('Đã xóa Server');
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể xóa Server');
  }
}

async function testServer(id: string) {
  testingId.value = id;
  try {
    const res = await request<{ ok: boolean; version?: string }>(`/servers/${id}/test`, { method: 'POST' });
    if (res.ok) {
      cyberToast.success(`Kết nối thành công! Phiên bản: ${res.version || 'v4'}`);
    } else {
      cyberToast.error('Kết nối thất bại');
    }
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không kiểm tra được');
  } finally {
    testingId.value = null;
  }
}

function resetGatewayForm() {
  Object.assign(gatewayForm, { name: '', gatewayId: '', description: '' });
}

async function submitGateway() {
  if (!gatewayForm.name.trim() || !gatewayForm.gatewayId.trim()) {
    cyberToast.warning('Vui lòng điền đủ tên và Gateway EUI');
    return;
  }
  submitting.value = true;
  try {
    await request('/gateways', { method: 'POST', body: JSON.stringify(gatewayForm) });
    cyberToast.success('Đã đăng ký Gateway');
    gatewayDialogVisible.value = false;
    resetGatewayForm();
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể đăng ký Gateway');
  } finally {
    submitting.value = false;
  }
}

async function confirmRemoveGateway(gatewayId: string, networkServerId?: string) {
  const confirmed = await cyberConfirm('Bạn có chắc chắn muốn xóa Gateway này?');
  if (!confirmed) return;
  try {
    await request(`/gateways/${gatewayId}`, {
      method: 'DELETE',
      body: JSON.stringify({ networkServerId }),
    });
    cyberToast.success('Đã xóa Gateway');
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể xóa Gateway');
  }
}

function resetDeviceForm() {
  Object.assign(deviceForm, { name: '', devEui: '', description: '' });
}

async function submitDevice() {
  if (!deviceForm.name.trim() || !deviceForm.devEui.trim()) {
    cyberToast.warning('Vui lòng điền đủ tên và DevEUI');
    return;
  }
  submitting.value = true;
  try {
    await request('/devices', { method: 'POST', body: JSON.stringify(deviceForm) });
    cyberToast.success('Đã đăng ký Thiết bị');
    deviceDialogVisible.value = false;
    resetDeviceForm();
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể đăng ký');
  } finally {
    submitting.value = false;
  }
}

async function confirmRemoveDevice(devEui: string, networkServerId?: string) {
  const confirmed = await cyberConfirm('Bạn có chắc chắn muốn xóa Thiết bị này?');
  if (!confirmed) return;
  try {
    await request(`/devices/${devEui}`, {
      method: 'DELETE',
      body: JSON.stringify({ networkServerId }),
    });
    cyberToast.success('Đã xóa Thiết bị');
    await refreshAll();
  } catch (error) {
    cyberToast.error(error instanceof Error ? error.message : 'Không thể xóa Thiết bị');
  }
}

function statusBadgeClass(status?: string): string {
  if (status === 'online' || status === 'active') return 'badge-success badge-outline';
  if (status === 'offline') return 'badge-error badge-outline';
  return 'badge-ghost text-base-content/60';
}

function statusText(status?: string): string {
  if (status === 'online') return 'Online';
  if (status === 'active') return 'Active';
  if (status === 'offline') return 'Offline';
  return 'Chưa rõ';
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

onMounted(() => {
  refreshAll();
});
</script>
