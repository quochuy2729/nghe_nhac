import { useNavigate } from 'react-router-dom';

/** Quay lại trang trước; nếu mở thẳng (không có lịch sử) thì về Trang chủ. */
export function useGoBack() {
  const navigate = useNavigate();
  return () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };
}
