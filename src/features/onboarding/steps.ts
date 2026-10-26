/** Nội dung hướng dẫn lần đầu mở app, tách theo nền tảng (hàm thuần để test). */
export interface OnboardingStep {
  id: 'welcome' | 'add-music' | 'sync';
  title: string;
  body: string[];
  /** nút hành động chính của bước (nếu có) */
  action?: 'addFolder' | 'addFiles' | 'openSettings';
}

export function onboardingSteps(platform: 'web' | 'android', canAddFiles: boolean): OnboardingStep[] {
  const welcome: OnboardingStep = {
    id: 'welcome',
    title: 'Chào mừng đến Nghe Nhạc',
    body: [
      'App chỉ phát file nhạc có sẵn trong điện thoại này — không tìm nhạc online, không tải nhạc lên đâu cả.',
      'Gợi ý, thống kê, phân tích âm thanh đều chạy ngay trên máy bạn.',
    ],
  };
  const add: OnboardingStep =
    platform === 'android'
      ? {
          id: 'add-music',
          title: 'Chọn thư mục nhạc',
          body: [
            'Chọn thư mục chứa nhạc (vd Music). App đọc thẳng từ đó, không sao chép file nên không tốn thêm dung lượng.',
            'Bài mới tự xuất hiện mỗi lần bạn mở lại app. Hãy cho phép thông báo để điều khiển nhạc ở màn hình khóa.',
          ],
          action: 'addFolder',
        }
      : {
          id: 'add-music',
          title: 'Chép nhạc vào ứng dụng Tệp',
          body: [
            '1. Chép nhạc vào ứng dụng Tệp (iCloud Drive hoặc “Trên iPhone”) bằng cáp, AirDrop hay iCloud.',
            canAddFiles
              ? '2. Bấm “Thêm thư mục nhạc”, hoặc “Thêm file” để chọn nhiều bài nếu máy không cho chọn thư mục.'
              : '2. Bấm “Thêm thư mục nhạc” và chọn thư mục vừa chép.',
            'iPhone sẽ sao chép nhạc vào bộ nhớ của app (dùng thêm dung lượng). Lần phát đầu tiên cần bạn chạm.',
          ],
          action: 'addFolder',
        };
  const sync: OnboardingStep = {
    id: 'sync',
    title: 'Đồng bộ giữa hai điện thoại (không bắt buộc)',
    body: [
      'Đăng nhập để like, playlist, lịch sử nghe, tag đã sửa và cài đặt đồng bộ giữa Poco và iPhone.',
      'Chỉ dữ liệu thông tin được đồng bộ — file nhạc không bao giờ rời khỏi điện thoại. Không đăng nhập vẫn dùng đầy đủ trên từng máy.',
    ],
    action: 'openSettings',
  };
  return [welcome, add, sync];
}
