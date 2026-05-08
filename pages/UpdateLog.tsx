
import React from 'react';
import { useLanguage } from '../utils/i18n';
import { Typography } from '../components/Typography';

import { FaIcon } from '../components/Icon';
export const UpdateLog = () => {
    const { t } = useLanguage();

    const updates = [
        {
            ver: 'v1.3.4',
            date: '2026-04-24',
            title: 'Ordering Workbench Sync & Snapshot Persistence',
            items: [
                'Đồng bộ logic hiển thị mã hàng 0 SL trên cả Modal Duyệt và Workbench chính.',
                'Sửa lỗi mất context khi lưu snapshot: Đảm bảo các mã hàng đã bị xóa vẫn được lưu trữ để phục vụ hậu kiểm.',
                'Tối ưu hóa hiệu suất lọc "Chỉ Dự Thảo" trong điều kiện có điều chỉnh số lượng.'
            ]
        },
        {
            ver: 'v1.3.3',
            date: '2026-04-24',
            title: 'Approval Traceability & Zero-Qty Visibility',
            items: [
                'Duy trì hiển thị các mã hàng có số lượng bằng 0 trong bảng Phê duyệt nếu dự thảo ban đầu lớn hơn 0.',
                'Tự động nhận diện và làm mờ (grayscale) các mã hàng đã bị xóa để tối ưu không gian kiểm soát.',
                'Đảm bảo tính nhất quán của dữ liệu Snapshot khi luân chuyển qua nhiều cấp phê duyệt.'
            ]
        },
        {
            ver: 'v1.3.2',
            date: '2026-03-14',
            title: 'Smarter Rebalance & UI Densification',
            items: [
                'Nâng cấp logic điều phối thông minh: Tự động tính toán hàng đang về (Pipeline) và chốt chặn MOS > 1.5 để tránh điều chuyển dư thừa.',
                'Chuẩn hóa thứ tự cột metrics (OH-DC-BO-PO-FC-MOS) trên toàn ứng dụng.',
                'Thiết kế giao diện siêu gọn (High Density), loại bỏ nhãn địa điểm thừa để tăng mật độ thông tin.',
                'Đổi tên "Phân bổ SEA" thành "Đề xuất đặt hàng (SEA)" để phản ánh đúng bản chất mua hàng.',
                'Cải thiện hiệu ứng micro-animation và Typography cho các chỉ số quan trọng.'
            ]
        },
        {
            ver: 'v1.3.1',
            date: '2026-03-13',
            title: 'Regional Pipeline & Backup Optimization',
            items: [
                'Tách biệt thông tin hàng đang về (Pipeline) theo miền NB và BB.',
                'Thêm nhãn màu sắc nhận diện vùng miền (NB: Emerald, BB: Blue).',
                'Tự động tổng hợp stats PO theo từng kho trong trang chi tiết.',
                'Thay đổi vị trí lưu trữ backup mặc định sang D:\\App\\Backup.',
                'Di chuyển Nhật ký cập nhật vào Cài đặt hệ thống để tinh gọn Menu.'
            ]
        },
        {
            ver: 'v1.3.0',
            date: '2026-03-13',
            title: 'Version Management & Automation',
            items: [
                'Thêm section Phiên bản trong Cài đặt hệ thống.',
                'Tích hợp trang Nhật ký cập nhật.',
                'Tự động hóa quy trình đóng gói (Up Ver) và lưu trữ.',
                'Liên kết trực tiếp với Lark Wiki documentation.'
            ]
        },
        {
            ver: 'v1.2.0',
            date: '2026-03-05',
            title: 'Performance Optimization',
            items: [
                'Tối ưu hóa tốc độ xử lý dữ liệu lớn (>50,000 SKU).',
                'Cải thiện UI/UX cho bộ lọc thông minh.',
                'Sửa lỗi tính toán MOS trong điều kiện PO về chậm.'
            ]
        }
    ];

    return (
        <div className="animate-fadeIn max-w-4xl mx-auto space-y-8 pb-20">
            {/* Header */}
            <div className="text-center space-y-2">
                <Typography variant="h1" className="text-slate-900 uppercase tracking-tight">
                    {t('version_log')}
                </Typography>
                <Typography variant="body" className="text-slate-500">
                    Theo dõi các thay đổi và cải tiến của hệ thống Auto Parts Governance
                </Typography>
            </div>

            {/* Lark Wiki Button */}
            <div className="flex justify-center">
                <a 
                    href="https://nsglbc6iskyq.sg.larksuite.com/wiki/AYwiwnIqsi151wke1t8lWJTXg1f" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-bold shadow-lg hover:shadow-blue-500/30 hover:scale-105 transition-all group"
                >
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <FaIcon className="fas fa-book-open text-white"  />
                    </div>
                    <div className="text-left">
                        <div className="text-xs opacity-80 uppercase font-black tracking-widest">Documentation</div>
                        <div className="text-lg">{t('version_external_wiki')}</div>
                    </div>
                    <FaIcon className="fas fa-chevron-right ml-4 group-hover:translate-x-1 transition-transform"  />
                </a>
            </div>

            {/* Timeline */}
            <div className="relative space-y-12 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {updates.map((upd, idx) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                        {/* Icon */}
                        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 group-[.is-active]:bg-blue-600 text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 transition-colors">
                            <FaIcon className="fas fa-code-branch text-sm"  />
                        </div>
                        {/* Content */}
                        <div className="w-[calc(100%-4rem)] md:w-[45%] bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-blue-600 font-black text-xl">{upd.ver}</div>
                                <time className="text-xs font-bold text-slate-400 uppercase tracking-widest">{upd.date}</time>
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-4">{upd.title}</h3>
                            <ul className="space-y-2">
                                {upd.items.map((item, i) => (
                                    <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
                                        <FaIcon className="fas fa-check-circle text-blue-500 mt-1 shrink-0"  />
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
