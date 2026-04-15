---
title: SAA Engine & Seasonality Filter
date: 2026-04-15
tags:
  - analytics-engine
  - seasonality
  - inventory-logic
  - supabase
  - rls
status: active
---

# 🚀 SAA Engine & Seasonality Implementation (Phase 5)

## 📌 Overview
Trong Phase 5, chúng ta đã chuyển đổi hệ thống tính toán tồn kho từ phương pháp Manual/Dynamic cũ sang hệ thống **Seasonal-Adaptive Anchor (SAA)** thống nhất. Đồng thời, giải quyết triệt để lỗi RLS trên Supabase Storage.

## 🛠️ Key Technical Changes

### 1. Unified SAA Engine
- **Stable Anchor**: Sử dụng 26 ngày làm việc cố định (Anchor) để tính ADS, loại bỏ nhiễu từ lịch (Calendar Noise) đặc biệt là trong tháng Tết.
- **SSI Multiplier**: Hệ số mùa vụ được tính toán tự động dựa trên MA3 Cluster và các yếu tố Causal (Tết, Thời tiết).
- **Formula**: $SPD = (Demand / 26) \times SSI$.

### 2. Smart Filter: "Mùa vụ"
- Đã thêm nút **Mùa vụ** vào Bộ lọc thông minh.
- Logic: Chỉ hiển thị các mặt hàng có hệ số SSI > 1.0 (những mã hàng đang trong chu kỳ cao điểm hoặc được booster mùa vụ).

### 3. Supabase RLS Fix
- Khắc phục lỗi "new row violates row-level security policy" khi upload snapshot.
- Cài đặt 6 policies quan trọng cho `storage.objects` và `snapshot_metadata`.
- Lưu trữ file dự phòng tại `supabase/rls_policies.sql`.

## 📂 Related Files
- [[inventoryEngine.ts]] (Logic core)
- [[FilterPanel.tsx]] (UI bộ lọc)
- [[rls_policies.sql]] (SQL khôi phục)

---
%% Created by Antigravity AI on 2026-04-15 %%
