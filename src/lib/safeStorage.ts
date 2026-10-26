import type { StateStorage } from 'zustand/middleware';

/** localStorage có thể ném lỗi (chế độ riêng tư, hết dung lượng) → mọi thao tác đều bọc try/catch. */
export const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      // hết dung lượng: bỏ qua, dữ liệu chỉ không được lưu lần này
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  },
};
