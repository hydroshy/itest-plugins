<template>
  <div class="cs-widget-card">
    <div class="cs-widget-stats">
      <div class="stat-cell">
        <span class="cell-label">Máy chủ</span>
        <span class="cell-value text-green">Online</span>
        <span class="cell-sub">ChirpStack v4</span>
      </div>
      <div class="stat-cell">
        <span class="cell-label">Gateways</span>
        <span class="cell-value text-blue">{{ gatewayCount }}</span>
        <span class="cell-sub">Đang đồng bộ</span>
      </div>
      <div class="stat-cell">
        <span class="cell-label">Thiết bị</span>
        <span class="cell-value text-purple">{{ deviceCount }}</span>
        <span class="cell-sub">OTAA / ABP</span>
      </div>
      <div class="stat-cell">
        <span class="cell-label">SNR TB</span>
        <span class="cell-value text-teal">+8.8 dB</span>
        <span class="cell-sub">RSSI: -78 dBm</span>
      </div>
    </div>

    <div class="cs-widget-footer">
      <span class="sync-time">Cập nhật: {{ lastSyncTime }}</span>
      <el-button link type="primary" size="small" @click="$router.push('/plugins/lorawan-chirpstack')">
        Mở Console ChirpStack →
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const gatewayCount = ref(2);
const deviceCount = ref(2);
const lastSyncTime = ref('Vừa xong');

onMounted(() => {
  lastSyncTime.value = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
});
</script>

<style scoped>
.cs-widget-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs-widget-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  background-color: #f8fafc;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
}

.cell-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.cell-value {
  font-size: 17px;
  font-weight: 700;
}

.cell-sub {
  font-size: 10px;
  color: #94a3b8;
}

.text-green { color: #10b981; }
.text-blue { color: #3b82f6; }
.text-purple { color: #8b5cf6; }
.text-teal { color: #0d9488; }

.cs-widget-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 4px;
}

.sync-time {
  font-size: 11px;
  color: #94a3b8;
}
</style>
