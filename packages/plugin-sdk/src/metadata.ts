/**
 * Plugin Metadata Catalog for Role Wizard & RBAC System
 * Declares Standardized Permissions & Navigation Views for all iTest Plugins
 */

export interface PermissionDefinition {
  id: string; // Identifier e.g. "memmap:profile:manage"
  name: string;
  description: string;
  module: string;
  action: string;
}

export interface PluginPermissionGroup {
  pluginId: string;
  pluginName: string;
  description: string;
  permissions: PermissionDefinition[];
}

export interface MenuViewDefinition {
  id: string; // e.g. "memmap-manager:list"
  title: string;
  description: string;
  icon: string;
  route: string;
  pluginId?: string;
  tab?: string;
  category: 'plugin' | 'system';
  order: number;
}

export const PLUGIN_PERMISSION_GROUPS: PluginPermissionGroup[] = [
  {
    pluginId: 'memmap-manager',
    pluginName: 'Memmap Payload',
    description: 'Bản đồ bộ nhớ thiết bị, định nghĩa thanh ghi và tải lên payload CSV/JSON',
    permissions: [
      {
        id: 'memmap:profile:manage',
        name: 'Quản lý Profile Memmap',
        description: 'Xem, tạo, sửa đổi và cấu hình bảng thanh ghi bản đồ bộ nhớ',
        module: 'memmap',
        action: 'manage',
      },
      {
        id: 'memmap:import:create',
        name: 'Tải lên Memmap Payload',
        description: 'Tải lên và phân tích cú pháp tệp CSV/JSON bản đồ bộ nhớ vào cơ sở dữ liệu',
        module: 'memmap',
        action: 'create',
      },
      {
        id: 'memmap:profile:read',
        name: 'Tra cứu Bản đồ bộ nhớ',
        description: 'Tra cứu layout thanh ghi, kiểu dữ liệu và mô tả thông số thanh ghi',
        module: 'memmap',
        action: 'read',
      },
    ],
  },
  {
    pluginId: 'final-config',
    pluginName: 'Final Config',
    description: 'Công cụ nạp cấu hình cuối, chạy kiểm thử 4 công đoạn và quản lý profile cấu hình',
    permissions: [
      {
        id: 'finalconfig:tool:execute',
        name: 'Thực thi Final Config Tool',
        description: 'Kết nối Web Serial, chạy quy trình 4 công đoạn nạp cấu hình và kiểm định thiết bị',
        module: 'finalconfig',
        action: 'execute',
      },
      {
        id: 'finalconfig:profile:manage',
        name: 'Quản lý hồ sơ Final Config',
        description: 'Tạo, sửa đổi và quản lý danh sách hồ sơ cấu hình hoàn thiện cho thiết bị',
        module: 'finalconfig',
        action: 'manage',
      },
      {
        id: 'finalconfig:profile:read',
        name: 'Xem hồ sơ Final Config',
        description: 'Tra cứu danh sách và xem chi tiết thông số hồ sơ cấu hình thiết bị',
        module: 'finalconfig',
        action: 'read',
      },
    ],
  },
  {
    pluginId: 'device-traceability',
    pluginName: 'Device Traceability',
    description: 'Truy xuất nguồn gốc thiết bị, lệnh sản xuất SO/WA và lịch sử kiểm định',
    permissions: [
      {
        id: 'traceability:order:manage',
        name: 'Quản lý Đơn hàng SO & WA',
        description: 'Xem và liên kết thiết bị theo đơn hàng sản xuất và chỉ thị xuất kho',
        module: 'traceability',
        action: 'manage',
      },
      {
        id: 'traceability:device:manage',
        name: 'Quản lý lịch sử thiết bị',
        description: 'Tra cứu thông số, lịch sử nạp cấu hình và kết quả kiểm định sản xuất',
        module: 'traceability',
        action: 'manage',
      },
      {
        id: 'traceability:device:read',
        name: 'Xem thông tin thiết bị',
        description: 'Tra cứu Serial Number, MAC, Hardware Version và nhật ký chạy thử',
        module: 'traceability',
        action: 'read',
      },
    ],
  },
  {
    pluginId: 'lorawan-chirpstack',
    pluginName: 'LoRaWAN ChirpStack',
    description: 'Quản trị mạng Network Server ChirpStack, quản lý trạm Gateway và Thiết bị',
    permissions: [
      {
        id: 'lorawan:server:manage',
        name: 'Quản lý Network Server',
        description: 'Cấu hình và kiểm tra kết nối tới máy chủ ChirpStack v4 / v3',
        module: 'lorawan',
        action: 'manage',
      },
      {
        id: 'lorawan:gateway:manage',
        name: 'Quản trị LoRaWAN Gateway',
        description: 'Khai báo, giám sát và quản lý trạng thái các trạm thu phát Gateway',
        module: 'lorawan',
        action: 'manage',
      },
      {
        id: 'lorawan:device:manage',
        name: 'Quản trị Thiết bị LoRaWAN',
        description: 'Đăng ký Device EUI, AppKey, Device Profile trên ChirpStack',
        module: 'lorawan',
        action: 'manage',
      },
      {
        id: 'lorawan:telemetry:read',
        name: 'Xem Telemetry & Live Frames',
        description: 'Theo dõi khung truyền uplink/downlink và giải mã telemetry thời gian thực',
        module: 'lorawan',
        action: 'read',
      },
    ],
  },
  {
    pluginId: 'dis-manager',
    pluginName: 'DIS Odoo Integration',
    description: 'Tích hợp hệ thống ERP DIS (Odoo), kiểm thử API và đồng bộ đơn hàng',
    permissions: [
      {
        id: 'dis:connection:manage',
        name: 'Cấu hình kết nối DIS API',
        description: 'Thiết lập endpoint, API Key và môi trường kiểm thử Sandbox của DIS Odoo',
        module: 'dis',
        action: 'manage',
      },
      {
        id: 'dis:orders:read',
        name: 'Xem đơn hàng từ DIS',
        description: 'Tra cứu danh sách Sales Orders từ hệ thống DIS ERP',
        module: 'dis',
        action: 'read',
      },
      {
        id: 'dis:sync:execute',
        name: 'Đồng bộ đơn hàng DIS',
        description: 'Thực thi lệnh kích hoạt kéo dữ liệu đơn hàng từ DIS về iTest Platform',
        module: 'dis',
        action: 'execute',
      },
    ],
  },
  {
    pluginId: 'system',
    pluginName: 'Hệ thống lõi (Core System)',
    description: 'Quản lý tài khoản, phân quyền, cấu hình hệ thống và thiết bị chung',
    permissions: [
      {
        id: 'system:users:read',
        name: 'Xem người dùng',
        description: 'Xem danh sách tài khoản người dùng và thông tin phân quyền',
        module: 'system',
        action: 'read',
      },
      {
        id: 'system:users:write',
        name: 'Quản lý người dùng',
        description: 'Tạo mới, chỉnh sửa thông tin, đặt lại mật khẩu và khóa tài khoản',
        module: 'system',
        action: 'write',
      },
      {
        id: 'system:roles:manage',
        name: 'Quản lý Phân quyền Role',
        description: 'Tạo, sửa vai trò người dùng và thực hiện quy trình Wizard phân quyền',
        module: 'system',
        action: 'manage',
      },
      {
        id: 'system:plugins:manage',
        name: 'Quản trị Plugin',
        description: 'Cài đặt, bật/tắt và cấu hình các plugin mở rộng của nền tảng',
        module: 'system',
        action: 'manage',
      },
      {
        id: 'system:devices:read',
        name: 'Xem thiết bị hệ thống',
        description: 'Xem danh sách thiết bị đăng ký trong kho hệ thống',
        module: 'system',
        action: 'read',
      },
      {
        id: 'system:devices:write',
        name: 'Quản lý thiết bị hệ thống',
        description: 'Đăng ký mới và sửa đổi thông tin thiết bị hệ thống',
        module: 'system',
        action: 'write',
      },
    ],
  },
];

export const PLUGIN_MENU_VIEWS: MenuViewDefinition[] = [
  {
    id: 'dashboard',
    title: 'Bảng điều khiển',
    description: 'Tổng quan hệ thống, trạng thái dịch vụ và phân quyền quản trị menu',
    icon: 'Odometer',
    route: '/dashboard',
    category: 'system',
    order: 1,
  },
  {
    id: 'final-config:tool',
    title: 'Final Config Tool',
    description: 'Nạp cấu hình thiết bị tự động qua Web Serial và kiểm thử 4 công đoạn',
    icon: 'Cpu',
    route: '/plugins/final-config?tab=tool',
    pluginId: 'final-config',
    tab: 'tool',
    category: 'plugin',
    order: 2,
  },
  {
    id: 'final-config:manager',
    title: 'Final Config Manager',
    description: 'Quản lý, tìm kiếm và tra cứu danh sách profile Final Config',
    icon: 'Document',
    route: '/plugins/final-config?tab=manager',
    pluginId: 'final-config',
    tab: 'manager',
    category: 'plugin',
    order: 3,
  },
  {
    id: 'final-config:create',
    title: 'Tạo Final Config',
    description: 'Tạo mới cấu hình thiết bị từ Memmap Payload template',
    icon: 'CirclePlus',
    route: '/plugins/final-config?tab=create',
    pluginId: 'final-config',
    tab: 'create',
    category: 'plugin',
    order: 4,
  },
  {
    id: 'device-traceability:so',
    title: 'Sales Orders & Work Authorizations',
    description: 'Quản lý cây đơn hàng SO, chỉ thị xuất kho WA và danh sách thiết bị',
    icon: 'List',
    route: '/plugins/device-traceability?tab=so',
    pluginId: 'device-traceability',
    tab: 'so',
    category: 'plugin',
    order: 5,
  },
  {
    id: 'device-traceability:devices',
    title: 'Device Inspection & History',
    description: 'Tra cứu chi tiết từng thiết bị, lịch sử nạp cấu hình và kết quả kiểm định',
    icon: 'Search',
    route: '/plugins/device-traceability?tab=devices',
    pluginId: 'device-traceability',
    tab: 'devices',
    category: 'plugin',
    order: 6,
  },
  {
    id: 'memmap-manager:list',
    title: 'MemMap Manager',
    description: 'Quản lý, tìm kiếm và tra cứu danh sách profile bản đồ bộ nhớ (Memmap Payload)',
    icon: 'FolderOpened',
    route: '/plugins/memmap-manager?tab=manager',
    pluginId: 'memmap-manager',
    tab: 'manager',
    category: 'plugin',
    order: 7,
  },
  {
    id: 'memmap-manager:upload',
    title: 'Memmap Upload',
    description: 'Tải lên và phân tích cú pháp bản đồ bộ nhớ thiết bị từ tệp tin JSON hoặc CSV',
    icon: 'Upload',
    route: '/plugins/memmap-manager?tab=upload',
    pluginId: 'memmap-manager',
    tab: 'upload',
    category: 'plugin',
    order: 8,
  },
  {
    id: 'dis-manager:dashboard',
    title: 'DIS Odoo Integration',
    description: 'Quản trị kết nối DIS API Odoo, kiểm thử API Sandbox và đồng bộ Sales Orders',
    icon: 'Link',
    route: '/plugins/dis-manager?tab=dashboard',
    pluginId: 'dis-manager',
    tab: 'dashboard',
    category: 'plugin',
    order: 9,
  },
  {
    id: 'lorawan-chirpstack:integration',
    title: 'LoRaWAN ChirpStack Integration',
    description: 'Đồng bộ Gateways, Applications và Live Frames từ Network Server ChirpStack',
    icon: 'Connection',
    route: '/plugins/lorawan-chirpstack?tab=overview',
    pluginId: 'lorawan-chirpstack',
    tab: 'overview',
    category: 'plugin',
    order: 10,
  },
];
