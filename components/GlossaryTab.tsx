import React from 'react';
import { Typography } from './Typography';

import { FaIcon } from './Icon';
export const GlossaryTab = () => {
    const formulas = [
        { name: 'ROP (Reorder Point)', formula: '(LT + SSP) × Demand_Daily', desc: 'Điểm đặt hàng. Khi lượng hàng Tồn ròng (Net Demand) giảm xuống dưới mức này, hệ thống sẽ gợi ý đặt hàng.' },
        { name: 'Stock Max', formula: 'ROP + (SP × Demand_Daily)', desc: 'Mức tồn kho tối đa (trần). Lượng gợi ý đặt hàng sẽ bằng khoảng cách từ tồn ròng hiện tại lên mức Stock Max này.' },
        { name: 'MOS (Months of Supply)', formula: 'Total Inventory ÷ Demand_Monthly', desc: 'Số tháng bán hàng còn lại dựa trên tồn kho hiện tại và nhu cầu trung bình.' },
        { name: 'Net Demand (Tồn ròng)', formula: 'Available - Backorder', desc: 'Lượng tồn kho thực tế có thể sử dụng sau khi đã trừ đi các đơn nợ (Backorder) của đại lý.' },
        { name: 'Total Inventory', formula: 'Stock NB + Stock BB + Dealer Inventory', desc: 'Tổng lượng tồn kho tính trên toàn hệ thống bao gồm cả kho tổng và kho đại lý.' },
        { name: 'Total Supply', formula: 'Total Inventory + Pipeline', desc: 'Tổng cung ứng toàn hệ thống (bao gồm cả hàng đã có và hàng đang trên đường về).' },
        { name: 'Pipeline', formula: 'Total PO (Đang đi đường)', desc: 'Lượng hàng đang trên đường về từ nhà cung cấp (chưa nhập kho).' },
        { name: 'Safety Stock', formula: 'SSP × Demand_Daily', desc: 'Tồn kho an toàn dự trữ để phòng ngừa rủi ro biến động nhu cầu hoặc chậm trễ giao hàng.' }
    ];

    const terms = [
        { term: 'LT', full: 'Lead Time', desc: 'Thời gian giao hàng (từ lúc đặt PO đến lúc nhập kho).' },
        { term: 'SP', full: 'Safety Period', desc: 'Chu kỳ đặt hàng an toàn.' },
        { term: 'SSP', full: 'Safety Stock Period', desc: 'Thời gian tồn kho an toàn.' },
        { term: 'BO', full: 'Backorder', desc: 'Nợ đơn đại lý (hàng đại lý đã đặt nhưng kho chưa có để giao).' },
        { term: 'DC', full: 'Distribution Center', desc: 'Kho phân phối trung tâm (Kho tổng).' },
        { term: 'PO', full: 'Purchase Order', desc: 'Đơn đặt hàng từ nhà cung cấp.' },
        { term: 'ETA', full: 'Estimated Time of Arrival', desc: 'Thời gian dự kiến hàng cập cảng / nhập kho.' },
        { term: 'VOR', full: 'Vehicle Off Road', desc: 'Tình trạng xe nằm xưởng chờ phụ tùng (rất khẩn cấp - P1).' },
        { term: 'DRP', full: 'Distribution Requirements Planning', desc: 'Quy trình hoạch định, phân bổ và điều chuyển hàng hoá giữa các miền.' },
        { term: 'SSI', full: 'Standardized Seasonal Index', desc: 'Chỉ số thời vụ chuẩn hóa (dùng để điều chỉnh lượng đặt hàng theo mùa).' },
        { term: 'CV', full: 'Coefficient of Variation', desc: 'Hệ số biến thiên nhu cầu bán hàng (đo lường rủi ro dao động).' },
        { term: 'MAD', full: 'Mean Absolute Deviation', desc: 'Chỉ số đo lường độ lệch chuẩn tuyệt đối của dự báo.' },
        { term: 'MAPE', full: 'Mean Absolute Percentage Error', desc: 'Sai số phần trăm tuyệt đối trung bình của dự báo.' },
        { term: 'LinReg', full: 'Linear Regression', desc: 'Hồi quy tuyến tính (Dùng để tính dự báo xu hướng).' },
        { term: 'NB', full: 'Nam Bộ (Miền Nam)', desc: 'Kho phụ tùng khu vực Miền Nam.' },
        { term: 'BB', full: 'Bắc Bộ (Miền Bắc)', desc: 'Kho phụ tùng khu vực Miền Bắc.' },
        { term: 'CST', full: 'Current Stock', desc: 'Tồn kho hiện tại.' },
        { term: 'FOB', full: 'Free On Board', desc: 'Đơn giá giao tại cảng xếp hàng (thường tính bằng EUR/USD).' },
        { term: 'PP', full: 'Purchase Price', desc: 'Đơn giá mua (thường tính bằng VND).' },
        { term: 'SNP', full: 'Standard Number of Packaging', desc: 'Quy cách đóng gói tối thiểu trong 1 hộp/kiện.' },
        { term: 'LOIS', full: 'Level of Inventory Service', desc: 'Phân hạng mã theo tốc độ luân chuyển.' },
        { term: 'Trend Flag', full: 'Xu hướng bán hàng', desc: 'Cờ đánh dấu xu hướng (UP, DOWN, STABLE) của mã hàng.' }
    ];

    const icons = [
        { icon: 'fa-boxes-stacked', color: 'text-blue-500', name: 'Kho hàng', desc: 'Biểu tượng đại diện cho thông tin tồn kho.' },
        { icon: 'fa-truck-fast', color: 'text-emerald-500', name: 'Pipeline / PO', desc: 'Hàng đang trên đường về (Pipeline).' },
        { icon: 'fa-triangle-exclamation', color: 'text-amber-500', name: 'Cảnh báo (Warning)', desc: 'Cảnh báo tồn kho thấp (MOS < Warning Threshold) hoặc nợ đơn.' },
        { icon: 'fa-circle-xmark', color: 'text-rose-500', name: 'Nguy hiểm (Critical)', desc: 'Tồn kho cạn kiệt (MOS < Critical Threshold) hoặc báo động.' },
        { icon: 'fa-circle-check', color: 'text-emerald-500', name: 'An toàn (Safe)', desc: 'Tồn kho ở mức an toàn, đủ đáp ứng nhu cầu.' },
        { icon: 'fa-chart-line', color: 'text-violet-500', name: 'Dự báo (Forecast)', desc: 'Nhu cầu dự báo và xu hướng bán hàng.' },
        { icon: 'fa-sitemap', color: 'text-blue-400', name: 'Phân bổ / Workflow', desc: 'Luồng phê duyệt hoặc phân bổ hàng hóa.' },
        { icon: 'fa-file-export', color: 'text-slate-500', name: 'Xuất dữ liệu', desc: 'Xuất dữ liệu ra file Excel/CSV.' }
    ];

    const filterGroups = [
        {
            name: 'Mức ưu tiên nợ (Debt Priority)',
            desc: 'Đánh giá mức độ khẩn cấp của việc trả nợ đơn cho đại lý.',
            items: [
                { term: 'P1', desc: 'Rất khẩn cấp (Xe nằm xưởng chờ phụ tùng, VOR).' },
                { term: 'P2', desc: 'Khẩn cấp (Xe đang sửa chữa cần thay thế nhanh).' },
                { term: 'P3', desc: 'Ưu tiên cao (Đơn hàng dự trữ đại lý sắp cạn).' },
                { term: 'P4', desc: 'Bình thường (Đơn hàng dự trữ định kỳ).' },
                { term: 'P5', desc: 'Thấp (Đơn hàng lưu kho dài hạn).' }
            ]
        },
        {
            name: 'Cảnh báo (Alert Type)',
            desc: 'Phân loại các rủi ro về tồn kho hiện hành.',
            items: [
                { term: 'Critical (Đỏ)', desc: 'Nguy hiểm - Tồn kho cạn kiệt, MOS ở mức rất thấp (thường < 0.5 tháng).' },
                { term: 'Warning (Vàng)', desc: 'Cảnh báo - Tồn kho đang thấp hơn mức an toàn (thường MOS < 1.5).' },
                { term: 'Excess (Tím)', desc: 'Dư thừa - Tồn kho vượt quá Stock Max, có nguy cơ đọng vốn.' },
                { term: 'Normal (Xanh lá)', desc: 'Bình thường - Tồn kho nằm trong mức an toàn.' }
            ]
        },
        {
            name: 'Nhóm luân chuyển (LOIS Group)',
            desc: 'Phân loại tốc độ luân chuyển theo hiệu suất bán hàng của mã.',
            items: [
                { term: 'L (Fast/Medium)', desc: 'Hàng luân chuyển nhanh hoặc trung bình, tần suất xuất kho cao, cần được ưu tiên duy trì tồn kho.' },
                { term: 'O (Obsolete)', desc: 'Hàng chậm luân chuyển hoặc đã lỗi thời, bán rất chậm, cần hạn chế nhập thêm.' },
                { term: 'I (Inactive)', desc: 'Hàng đã ngừng kinh doanh, hết vòng đời hoặc không còn hoạt động.' },
                { term: 'S (Seasonal)', desc: 'Hàng có tính thời vụ (thường phụ thuộc vào mùa hè/mùa đông hoặc mưa/nắng).' }
            ]
        },
        {
            name: 'Xu hướng (Trend Flag)',
            desc: 'Biến động bán hàng so với quá khứ (tính theo tháng).',
            items: [
                { term: 'UP (Tăng)', desc: 'Nhu cầu đang có xu hướng tăng mạnh so với trung bình các tháng trước.' },
                { term: 'DOWN (Giảm)', desc: 'Nhu cầu đang có xu hướng giảm sút.' },
                { term: 'STABLE (Ổn định)', desc: 'Nhu cầu bán ra đều đặn, không có biên độ dao động lớn.' }
            ]
        },
        {
            name: 'Nhóm kho / Nhóm miền (Warehouse Scope)',
            desc: 'Giới hạn góc nhìn tồn kho và tính toán số liệu.',
            items: [
                { term: 'All', desc: 'Góc nhìn toàn quốc: Tổng hợp dữ liệu tồn kho và doanh số ở mọi kho chi nhánh.' },
                { term: 'NB', desc: 'Chỉ giới hạn đánh giá dữ liệu và tính toán tồn kho ở khu vực Miền Nam.' },
                { term: 'BB', desc: 'Chỉ giới hạn đánh giá dữ liệu và tính toán tồn kho ở khu vực Miền Bắc.' }
            ]
        },
        {
            name: 'Nhóm Mẹ (Mother Group / Analytics Group)',
            desc: 'Cách hệ thống gom nhóm các Nguồn hàng (Source ID) đơn lẻ thành các khu vực hoặc thương hiệu chính để phân tích vĩ mô.',
            items: [
                { term: 'Cơ chế hoạt động', desc: 'Hệ thống tìm kiếm trong bảng cấu hình Nguồn hàng (Settings) để lấy Nhóm mẹ do người dùng định nghĩa. Nếu không có, hệ thống sẽ tự động nhận diện dựa trên mã (ví dụ: HQN, HQS -> HÀN QUỐC).' },
                { term: 'Ưu tiên', desc: 'Cấu hình thủ công trong Settings luôn có ưu tiên cao nhất, giúp người vận hành linh hoạt điều chỉnh báo cáo mà không cần can thiệp mã nguồn.' }
            ]
        }
    ];

    return (
        <div className="space-y-6 animate-fadeIn pb-24">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <FaIcon className="fas fa-calculator text-blue-600 text-sm"  />
                    </div>
                    <Typography variant="label" className="text-slate-900">Các Công Thức Toán Học</Typography>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {formulas.map((f, i) => (
                            <div key={i} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-blue-200 hover:shadow-md transition-all group">
                                <div className="text-sm font-black text-slate-800 mb-1">{f.name}</div>
                                <div className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md inline-block mb-2 group-hover:bg-blue-100 transition-colors">
                                    {f.formula}
                                </div>
                                <div className="text-xs text-slate-500 font-medium leading-relaxed">{f.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <FaIcon className="fas fa-spell-check text-emerald-600 text-sm"  />
                    </div>
                    <Typography variant="label" className="text-slate-900">Từ Viết Tắt (Abbreviations)</Typography>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {terms.map((t, i) => (
                            <div key={i} className="p-3 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all flex flex-col gap-1">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-sm font-black text-emerald-700">{t.term}</span>
                                    <span className="text-xs font-bold text-slate-400">{t.full}</span>
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">{t.desc}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                        <FaIcon className="fas fa-icons text-purple-600 text-sm"  />
                    </div>
                    <Typography variant="label" className="text-slate-900">Ý Nghĩa Các Biểu Tượng (Icons)</Typography>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                        {icons.map((ic, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className={`w-10 h-10 shrink-0 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center text-lg ${ic.color}`}>
                                    <FaIcon className={`fas ${ic.icon}`}  />
                                </div>
                                <div>
                                    <div className="text-xs font-black text-slate-700">{ic.name}</div>
                                    <div className="text-[11px] text-slate-500 font-medium mt-0.5 leading-tight">{ic.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                        <FaIcon className="fas fa-filter text-orange-600 text-sm"  />
                    </div>
                    <Typography variant="label" className="text-slate-900">Ý Nghĩa Các Bộ Lọc (Filters)</Typography>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filterGroups.map((g, i) => (
                            <div key={i} className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-orange-300 hover:shadow-lg transition-all group">
                                <div className="text-sm font-black text-slate-800 mb-1">{g.name}</div>
                                <div className="text-xs text-slate-500 font-medium mb-3">{g.desc}</div>
                                <div className="space-y-2">
                                    {g.items.map((item, idx) => (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-2.5 rounded-lg bg-slate-50 group-hover:bg-orange-50/50 transition-colors border border-transparent group-hover:border-orange-100">
                                            <span className="text-xs font-black text-orange-700 whitespace-nowrap min-w-[120px]">{item.term}</span>
                                            <span className="text-xs text-slate-600 font-medium leading-relaxed">{item.desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
