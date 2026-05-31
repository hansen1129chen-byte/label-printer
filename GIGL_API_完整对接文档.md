# GIGL API 完整对接文档

> 整合 GIGL API 调研 + 调试 + 踩坑，2026-05-30  
> 账号：pastordavid0011@gmail.com / Parfco2026@  
> 商户编码：IND882341

---

## 一、API 架构

| 用途 | Base URL |
|------|------|
| 业务（登录/创建/计价/国家列表） | `https://thirdpartynode.theagilitysystems.com` |
| 追踪（列表/详情） | `https://prod-giggo-app-revamp-api.theagilitysystems.com` |
| 开发环境 业务 | `https://dev-thirdpartynode.theagilitysystems.com` |
| 开发环境 追踪 | `https://dev-giggo-app-revamp-api.theagilitysystems.com` |
| 地址编码（外部） | `https://api.latlng.work/api` (X-Api-Key: latlng_5ylwu0sjwjyuzs3d59bhbq4p9wg1nl4x) |

---

## 二、认证

```
POST https://thirdpartynode.theagilitysystems.com/login
Content-Type: application/json

{
  "email": "pastordavid0011@gmail.com",
  "password": "Parfco2026@"
}

→ Response:
{
  "data": {
    "access-token": "eyJ...",       // 后续所有请求带这个
    "UserChannelCode": "IND882341"   // 列表查询客户编码
  }
}
```

| 注意 | 说明 |
|------|------|
| Token 有效期 | 约 10 分钟，建议缓存 8 分钟提前刷新 |
| Header 写法 | `access-token: {token}` **不是** `Authorization: Bearer` |
| 密码注意 | 含 `@`，bash curl 需用 `--data-raw`，代码里无所谓 |
| 安全 | 不传 customerCode 可查到全平台 54807 条数据，始终带商户编码 |

---

## 三、端点总览

| 端点 | 方法 | 基础 URL | 说明 |
|------|------|------|------|
| `/login` | POST | 业务 | 登录获取 token |
| `/shipments` | GET | 追踪 | 查询运单列表 |
| `/trackShipment?waybill=xxx` | GET | 追踪 | 追踪单个运单（含完整物流轨迹） |
| `/capture/preshipment` | POST | 业务 | 创建国内运单（❌ 无权限） |
| `/shipment/create` | POST | 追踪 | App 端创建运单（❌ 需要地址 ID） |
| `/price/v3` | POST | 业务 | 查国内运费 |
| `/country/get` | GET | 业务 | 获取国家列表 |
| `/intlShipment/create` | POST | 业务 | 创建国际运单 |
| `/intlShipment/price` | POST | 业务 | 查国际运费 |

---

## 四、查询运单列表

```
GET https://prod-giggo-app-revamp-api.theagilitysystems.com/shipments
    ?customerCode=IND882341
    &startDate=2026-05-01
    &endDate=2026-05-30
    &limit=100

access-token: {token}
```

### 支持的参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `customerCode` | **是** | 商户编码，不填返回全平台数据 |
| `startDate` | 否 | YYYY-MM-DD |
| `endDate` | 否 | YYYY-MM-DD |
| `limit` | 否 | 默认 50，最大 100 |
| `skip` | 否 | 分页偏移，配合 limit 翻页 |

### 不支持的参数

`requestNumber`、`waybill`、`search`、`CustomerId` 全部返回 400。

### 返回结构

```json
{
  "data": {
    "total": 60,
    "data": [
      {
        "waybill": "1026074816",
        "receiverName": "Favour Barth",
        "receiverPhoneNumber": "+234****9636",   // ⚠️ 注意：列表里是脱敏的
        "grandTotal": 5953.00,
        "paymentStatus": 1,                       // 1=已付
        "shipmentScanStatus": 0,
        "shipmentStatus": null,                   // ⚠️ 转正运单此字段为 null
        "isCancelled": false,                     // ⚠️ 永远是 false，别信
        "isInternational": false,
        "dateCreated": "2026-05-29T15:56:02.136Z",
        "dateModified": "2026-05-29T15:56:02.136Z",
        "customerCode": "IND882341",
        "preShipmentMobileId": null,
        "isExpressDropoff": true,
        "isFromMobile": false,
        "deliveryOptionId": 4,
        "requestNumber": null,                    // ⚠️ 转正后清空
        "shipmentSource": "shipment"
      }
    ]
  }
}
```

---

## 五、追踪单个运单

```
GET https://prod-giggo-app-revamp-api.theagilitysystems.com/trackShipment?waybill=1026074708

access-token: {token}
```

### 返回结构

```json
{
  "data": {
    "origin": null,
    "destination": "Hospital Rd, Owerri 460281, Imo, Nigeria",
    "amount": 8835,
    "dateCreated": "2026-05-26T13:52:18.230Z",
    "senderPhoneNumber": "+2348133375304",
    "receiverPhoneNumber": "+2347067148115",      // ✅ 完整号！
    "currentScanStatusDescription": "SHIPMENT CREATED",  // ⚠️ 经常过期
    "fullTrackHistory": [                         // ✅ 真相在这里
      {
        "dateTime": "2026-05-26T14:51:25.973Z",
        "location": "TRADE FAIR",
        "status": "CRT",
        "code": "CRT",
        "scanStatusIncident": "SHIPMENT CREATED",
        "scanStatusReason": "SHIPMENT CREATED AT SERVICE CENTER",
        "scanStatusComment": "1ST SCAN FOR EVERY SHIPMENT",
        "user": "Adeyemi Adeoba"
      }
      // ... 更多事件
    ]
  }
}
```

---

## 六、状态判断（核心） ⚠️

### ❌ 不可信字段清单

以下字段来自 GIGL API 返回，但**实际值不可用于业务判断**：

| # | 字段名 | 来源 | 返回示例 | 为什么不可信 | 正确做法 |
|------|------|------|------|------|------|
| 1 | `isCancelled` | 列表 API | `false` | **永远返回 `false`**，即使运单已在 GIGL 端取消 | 查 `fullTrackHistory` 里是否有 `SSC` 状态 |
| 2 | `shipmentStatus` | 列表 API | `null` | 运单转正后此字段**永远是 `null`** | 查 `fullTrackHistory` 最后一条的 `scanStatusIncident` |
| 3 | `currentScanStatusDescription` | tracking API | `"SHIPMENT CREATED"` | **经常停留在初始状态不更新**，比如已签收的运单这个字段还是 "SHIPMENT CREATED" | 取 `fullTrackHistory` 数组最后一条的 `scanStatusIncident` |
| 4 | `requestNumber` | 列表 API | `null` | 运单转正后**清空为 `null`**，不能用于关联 | 转正后改用 `waybill` 关联 |
| 5 | `receiverPhoneNumber` | 列表 API | `"+234****9636"` | **脱敏的**，中间 4 位被 `****` 替代 | 调 tracking API 拿完整号 `+2348028189636` |
| 6 | `preShipmentMobileId` | 列表 API | `null` | App 预下单才可能有值，网页下单全是 null | 非 App 托运单忽略此字段 |

### ✅ 可信字段

| 字段 | 来源 | 说明 |
|------|------|------|
| `waybill` | 列表 / tracking | 运单号，唯一标识 |
| `receiverName` | 列表 | 收件人姓名，可信 |
| `grandTotal` | 列表 | 金额，可信 |
| `paymentStatus` | 列表 | 支付状态：1=已付，其他=COD |
| `dateCreated` | 列表 | 创建时间 |
| `destination` | tracking | 收件地址 |
| `receiverPhoneNumber` | **tracking** | ✅ 完整手机号 |
| `senderPhoneNumber` | tracking | 发件人手机号 |
| `fullTrackHistory` | tracking | ✅ **所有状态判断的唯一真相来源** |

### 实际案例

```
运单 1026074708 (cedar):
  currentScanStatusDescription = "SHIPMENT CREATED"      ← 假的！
  fullTrackHistory 最后一条 = "SHIPMENT DELIVERED TO CUSTOMER AT TERMINAL"  ← 真的
  isCancelled = false                                     ← 数据上对，但不可靠

运单 1026074624 (Emmanuel Monday):
  isCancelled = false                                     ← 假的！
  fullTrackHistory 有 SSC = "SHIPMENT CANCELLED"         ← 真的，已取消
```

### 所有状态从 `fullTrackHistory` 里取！

```js
// ✅ 已送达
function isDelivered(trackData) {
  const history = trackData?.fullTrackHistory || [];
  return history.some(h => {
    const s = (h.status || '').toUpperCase();
    const d = (h.scanStatusIncident || '').toUpperCase();
    return s === 'DLV' || d.includes('DELIVERED');
  });
}

// ❌ 已取消
function isCancelled(trackData) {
  const history = trackData?.fullTrackHistory || [];
  return history.some(h => {
    const s = (h.status || '').toUpperCase();
    const d = (h.scanStatusIncident || '').toUpperCase();
    return s === 'SSC' || d.includes('CANCELLED');
  });
}
```

### 状态码速查表

| 码 | 含义 | 归类 | 阶段 |
|------|------|------|------|
| **CRT** | SHIPMENT CREATED / 已开单 | 运输中 | ① 开单 |
| **DSC** | DEPARTS SERVICE CENTER / 离开网点 | 运输中 | ② 发出 |
| **ACC** | ARRIVES COLLATION CENTER / 到集散点 | 运输中 | ③ 中转 |
| **DCC** | DEPARTS COLLATION CENTER / 离开集散点 | 运输中 | ③ 中转 |
| **APT** | ARRIVED PROCESSING HUB / 到中转中心 | 运输中 | ③ 中转 |
| **DPC** | DEPARTS PROCESSING CENTER / 离开中转中心 | 运输中 | ③ 中转 |
| **ARF** | ARRIVED FINAL DESTINATION / 到目的地 | 运输中 | ④ 到达 |
| **AST** | ARRIVED SATELLITE TERMINAL / 到卫星站 | 运输中 | ④ 到达 |
| **WC** | WITH DELIVERY COURIER / 快递员派送中 | 运输中 | ⑤ 派送 |
| **OKC** | DELIVERED TO CUSTOMER / 客户签收 | ✅ 已送达 | ⑥ 签收 |
| **OKT** | DELIVERED AT TERMINAL / 终端自提 | ✅ 已送达 | ⑥ 签收 |
| **DFA** | Delivery Unsuccessful / 派送失败 | ⚠️ 配送失败 | ❌ 异常 |
| **SSC** | SHIPMENT CANCELLED / 已取消 | ❌ 已取消 | ❌ 异常 |

---

## 七、tracking API 返回重复事件 ⚠️

`fullTrackHistory` 里每个事件重复约 **6 次**，内容完全一样。存库必须加唯一约束：

```sql
ALTER TABLE gigl_tracking_events 
  ADD UNIQUE INDEX uq_event (waybill, event_time, status_code);
```

插入时用 `INSERT IGNORE` 自动去重。

---

## 八、手机号匹配坑

| 来源 | 格式 | 示例 |
|------|------|------|
| 列表 API | 脱敏 | `+234****9636` |
| tracking API | 完整 | `+2348028189636` |
| 本地系统 | 11 位纯数字 | `08028189636` |

匹配策略：提取末 4 位数字做对比，同时搭配客户姓名 + 金额 + 日期做复合匹配。

---

## 九、不支持的功能

| 功能 | 状态 | 说明 |
|------|------|------|
| PRE 预订单查询 | ❌ 400 | `trackShipment?waybill=PRE2739791` 不存在 |
| requestNumber 过滤 | ❌ 400 | 列表 API 不接受此参数 |
| waybill 过滤列表 | ❌ 400 | 同上 |
| search 参数 | ❌ 400 | 同上 |
| 创建运单 (preshipment) | ❌ 401 | 需联系 GIGL 开通 Third Party Shipment 权限 |
| 创建运单 (create) | ❌ | 需要 SenderAddressId，但无地址管理 API |
| 地址 Crud | ❌ 404 | 只能通过 App，API 不暴露 |
| 国际件 | ❌ | 账号未开通 |
| 查运费 | ⚠️ 未测 | price/v3 需完整参数但未深入 |
| 查 4 月及更早数据 | 0 条 | 该账号 2026-05 才开始用 GIGL |

---

## 十、地址编码

```
GET https://api.latlng.work/api?q={urlencoded_address}
X-Api-Key: latlng_5ylwu0sjwjyuzs3d59bhbq4p9wg1nl4x

→ coordinates: [Longitude, Latitude]
→ features[0].geometry.coordinates[1] = Latitude
→ features[0].geometry.coordinates[0] = Longitude
```

---

## 十一、WordPress 插件关键发现

源码 `GIGL_Delivery_API.php` 中的端点映射：

| 方法 | 端点 | HTTP |
|------|------|------|
| 创建运单 | `capture/preshipment` | POST |
| 查单详情 | `trackShipment?waybill=...` | GET |
| 计价 | `price/v3` | POST |
| 国家列表 | `country/get` | GET |
| 国际计价 | `intlShipment/price` | POST |
| 国际创建 | `intlShipment/create` | POST |

被注释的旧版 payload 包含 `PreShipmentMobileId`、`PreShipmentItems`、`VehicleType: "BIKE"`（字符串不是数字），说明 GIGL 改过 API 格式。

---

## 十二、本地系统对接设计

### 数据库表

| 表 | 用途 |
|------|------|
| `gigl_shipments` | 运单主表，列表 API 数据 + tracking 关键字段 |
| `gigl_tracking_events` | 物流事件明细，每条事件一行（去重后约 330 条） |

### 同步调度

| 配置 | 值 |
|------|------|
| 执行窗口 | 尼日利亚时间 10:00–18:00（UTC+1） |
| 频率 | 每 ~2 小时，±5 分钟随机抖动 |
| 拉取范围 | 最早 pending 订单日期 - 7 天，最少 7 天 |
| 缓存 | 2 小时内同步过的不重复调 tracking API |
| 完结跳过 | delivered / returned 的运单不再更新事件 |

### 自动操作

| 操作 | 触发条件 | 动作 |
|------|------|------|
| 填充 tracking | 姓名+电话+金额+日期 匹配成功 | 自动填 `gig_tracking`，操作人 GIGL |
| 确认发货 | tracking 填入后 | pending → in_transit |
| 自动签收 | tracking 显示已送达 | in_transit → delivered |
| 所有操作 | — | 写入 `shipping_logs`，operator = "GIGL" |

### 前端页面

| 页面 | 功能 |
|------|------|
| GIGL Shipments | 运单列表 + 6 状态分页 + View 物流时间线 + 手动匹配 |
| Shipping View 弹窗 | GIG 运单底部展示物流时间线 |
| Orders 列表 | Shipping 列拆分 GIG/OWN 状态显示 |

---

## 十三、一句话总结

> **列表 API 看个大概，tracking API 的 `fullTrackHistory` 才是真相。**  
> **状态码从 JSON 历史里挖，别信 API 的布尔字段。**
