<template>
  <el-tooltip content="ChirpStack LoRaWAN Network Server v4" placement="bottom">
    <div class="header-cs-badge" @click="$router.push('/plugins/lorawan-chirpstack')">
      <el-tag type="success" size="small" effect="plain" class="badge-tag">
        <span class="dot"></span>
        ChirpStack: 2 GW | 2 Dev
      </el-tag>
    </div>
  </el-tooltip>
</template>

<style scoped>
.header-cs-badge {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  margin: 0 4px;
}

.badge-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  font-weight: 500;
  border-radius: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #10b981;
  display: inline-block;
  box-shadow: 0 0 4px rgba(16, 185, 129, 0.6);
}
</style>
