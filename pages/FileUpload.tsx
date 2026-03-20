
import React, { useState, useRef } from 'react';
import { InventoryItem, MonthlyData } from '../types/inventory';
import { parseCSV, parseDealerStockCSV, parseBackorderCSV } from '../utils/csvParser';
import { useLanguage } from '../utils/i18n';


export const FileUpload = ({ onData, monthlyData }: {
    onData: (data: InventoryItem[], filename: string, sourceId: string) => void;
    monthlyData?: Record<string, MonthlyData> | null;
}) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [dealerFile, setDealerFile] = useState<File | null>(null);
    const [boFile, setBoFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);


    const mainInputRef = useRef<HTMLInputElement>(null);
    const dealerInputRef = useRef<HTMLInputElement>(null);
    const boInputRef = useRef<HTMLInputElement>(null);
    const { t } = useLanguage();

    const handleMainFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().endsWith('.csv')) setMainFile(file);
            else alert("Vui lòng chỉ chọn file .csv");
        }
    };

    const processFiles = async () => {
        if (!mainFile) return;
        setIsLoading(true);

        const readFile = (file: File) => new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsText(file, 'UTF-8');
        });

        try {
            const mainText = await readFile(mainFile);
            let inventoryData = parseCSV(mainText, monthlyData ?? undefined);

            // 1. Process Dealer File (Optional)
            if (dealerFile) {
                const dealerText = await readFile(dealerFile);
                const dealerMap = parseDealerStockCSV(dealerText);

                inventoryData = inventoryData.map(item => {
                    const details = dealerMap[item.ItemCode];
                    if (details) {
                        const totalDealer = details.reduce((sum, d) => sum + d.Qty, 0);
                        return { ...item, DealerInventory: totalDealer, DealerBreakdown: details };
                    }
                    return item;
                });
            }

            // 2. Process Backorder File (Optional)
            if (boFile) {
                const boText = await readFile(boFile);
                const boMap = parseBackorderCSV(boText);

                inventoryData = inventoryData.map(item => {
                    const details = boMap[item.ItemCode];
                    if (details && details.length > 0) {
                        const totalBO = details.reduce((sum, d) => sum + d.Qty, 0);

                        // CẢI TIẾN: Chỉ ghi đè số lượng kho nếu giá trị từ file Master là 0
                        // Nếu Master đã có số (vd: 20), chúng ta giữ 20 và chỉ thêm breakdown chi tiết.
                        const boNB = (item.Backorder_NB > 0) ? item.Backorder_NB : details.filter(d => d.Warehouse && (d.Warehouse.includes('NB') || d.Warehouse.includes('Nam'))).reduce((s, d) => s + d.Qty, 0);
                        const boBB = (item.Backorder_BB > 0) ? item.Backorder_BB : details.filter(d => d.Warehouse && (d.Warehouse.includes('BB') || d.Warehouse.includes('Bắc'))).reduce((s, d) => s + d.Qty, 0);

                        return {
                            ...item,
                            // Ưu tiên tổng từ file Master nếu nó lớn hơn 0
                            Backorder: item.Backorder > 0 ? item.Backorder : totalBO,
                            Backorder_NB: boNB,
                            Backorder_BB: boBB,
                            BackorderBreakdown: details
                        };
                    }
                    return item;
                });
            }

            if (inventoryData.length > 0) {
                onData(inventoryData, mainFile.name, '');
            } else {
                alert("Không tìm thấy dữ liệu hợp lệ trong file chính.");
            }

        } catch (error) {
            alert("Lỗi khi đọc file. Vui lòng kiểm tra định dạng CSV.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);

    return (
        <div className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-slate-900 font-sans selection:bg-blue-500/30">

            {/* 1. BACKGROUND IMAGE LAYER */}
            <div className="absolute inset-0 z-0">
                <img
                    src="https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?q=80&w=2832&auto=format&fit=crop"
                    alt="Auto Parts Background"
                    className="w-full h-full object-cover opacity-60 mix-blend-overlay"
                />
                {/* Enhanced Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-900/70"></div>
                {/* Subtle Grid Pattern Overlay */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px]"></div>
            </div>

            {/* 2. GLASS CONTENT LAYER */}
            <div className="relative z-10 w-full max-w-6xl p-6 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">

                {/* Left Column: Branding & Intro */}
                <div className="lg:col-span-7 text-white space-y-8 animate-fadeIn">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-2xs font-black uppercase tracking-widest mb-6 backdrop-blur-md shadow-glow-blue">
                            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shadow-[0_0_10px_#60a5fa]"></span>
                            Hệ thống Sẵn sàng
                        </div>
                        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] mb-6 drop-shadow-xl">
                            Auto Parts <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-rose-400 animate-gradient-x">
                                Governance
                            </span>
                        </h1>

                        <div className="flex items-center gap-3 mb-8 pl-1">
                            <div className="w-12 h-[3px] bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                            <p className="text-xs font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                                Procurement & Inventory <br />
                                <span className="text-slate-500">Premium Cars Spare Parts</span>
                            </p>
                        </div>

                        <p className="text-slate-300 text-lg font-medium max-w-lg leading-relaxed border-l-4 border-slate-700/50 pl-6">
                            Hệ thống phân tích tồn kho chuyên sâu. Tối ưu hóa mức tồn kho, phát hiện rủi ro và tự động hóa quy trình đặt hàng với độ chính xác cao.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-6 pt-6 border-t border-white/5">
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-blue flex items-center justify-center text-white shadow-lg shadow-blue-500/20"><i className="fas fa-chart-pie"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">Real-time</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Analytics</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-emerald flex items-center justify-center text-white shadow-lg shadow-emerald-500/20"><i className="fas fa-robot"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">AI Driven</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Forecast</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/5 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-lg bg-gradient-rose flex items-center justify-center text-white shadow-lg shadow-rose-500/20"><i className="fas fa-shield-halved"></i></div>
                            <div className="flex flex-col">
                                <span className="text-xs font-bold text-white">Risk Control</span>
                                <span className="text-2xs text-slate-400 font-bold uppercase tracking-wider">Governance</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Upload Card */}
                <div className="lg:col-span-5 animate-fadeIn" style={{ animationDelay: '0.2s' }}>
                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative overflow-hidden group">
                        {/* Decorative Glow */}
                        <div className="absolute -top-32 -right-32 w-80 h-80 bg-blue-500/20 rounded-full blur-[80px] group-hover:bg-blue-500/30 transition-all duration-1000 pointer-events-none"></div>
                        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-purple-500/20 rounded-full blur-[80px] group-hover:bg-purple-500/30 transition-all duration-1000 pointer-events-none"></div>

                        <div className="relative z-10 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <span className="w-1.5 h-6 bg-gradient-to-b from-blue-400 to-purple-400 rounded-full"></span>
                                        Nhập Dữ Liệu
                                    </h3>
                                    <p className="text-slate-400 text-xs font-medium mt-1 pl-3.5">Tải lên file snapshot tồn kho (.csv)</p>
                                </div>
                                {/* Monthly Data Badge */}
                                {monthlyData
                                    ? <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-bold">
                                        <i className="fas fa-calendar-check" />
                                        <span>D/L tháng: OK</span>
                                      </div>
                                    : <div title="Vào Settings → Hệ thống → Upload File Monthly để kích hoạt" className="flex items-center gap-1.5 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-lg text-xs font-bold cursor-help">
                                        <i className="fas fa-triangle-exclamation" />
                                        <span>Chưa có d/l tháng</span>
                                      </div>
                                }
                            </div>

                            <div className="space-y-4">
                                {/* Main Input Field */}
                                <div
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={handleMainFileDrop}
                                    onClick={() => mainInputRef.current?.click()}
                                    className={`
                                  relative w-full h-24 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex items-center px-6 group overflow-hidden
                                  ${isDragging
                                            ? 'bg-blue-500/20 border-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.3)] scale-[1.02]'
                                            : mainFile
                                                ? 'bg-emerald-500/10 border-emerald-500/50'
                                                : 'bg-black/20 border-white/10 hover:border-blue-400/50 hover:bg-black/30'}
                              `}
                                >
                                    <div className="flex-1 flex items-center gap-5 relative z-10">
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all shadow-lg ${mainFile ? 'bg-gradient-emerald text-white' : 'bg-white/10 border border-white/10 text-slate-400 group-hover:bg-gradient-blue group-hover:text-white'}`}>
                                            <i className={`fas ${mainFile ? 'fa-check text-2xl' : 'fa-cloud-arrow-up text-2xl'}`}></i>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-2xs font-black uppercase tracking-widest mb-1 ${mainFile ? 'text-emerald-400' : 'text-blue-300'}`}>
                                                {mainFile ? 'Sẵn sàng phân tích' : 'Dữ liệu chính'}
                                            </span>
                                            <span className={`text-sm font-bold truncate transition-colors ${mainFile ? 'text-white' : 'text-slate-300 group-hover:text-white'}`}>
                                                {mainFile ? mainFile.name : "Kéo thả file Inventory tại đây..."}
                                            </span>
                                        </div>
                                    </div>
                                    <input type="file" ref={mainInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && setMainFile(e.target.files[0])} />
                                </div>

                                {/* Optional Inputs Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Dealer Stock */}
                                    <div
                                        onClick={() => dealerInputRef.current?.click()}
                                        className={`h-16 rounded-xl border flex items-center px-4 cursor-pointer transition-all relative overflow-hidden group
                                      ${dealerFile
                                                ? 'bg-blue-500/10 border-blue-500/50'
                                                : 'bg-black/20 border-white/10 hover:border-blue-400/30 hover:bg-black/30'}
                                  `}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all ${dealerFile ? 'bg-blue-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white'}`}>
                                            <i className="fas fa-store"></i>
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-2xs font-black text-slate-500 uppercase tracking-widest">Tồn Đại Lý</span>
                                            <span className={`text-xs font-bold truncate ${dealerFile ? 'text-blue-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                {dealerFile ? dealerFile.name : "Tùy chọn"}
                                            </span>
                                        </div>
                                        <input type="file" ref={dealerInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && setDealerFile(e.target.files[0])} />
                                    </div>

                                    {/* Backorder */}
                                    <div
                                        onClick={() => boInputRef.current?.click()}
                                        className={`h-16 rounded-xl border flex items-center px-4 cursor-pointer transition-all relative overflow-hidden group
                                      ${boFile
                                                ? 'bg-rose-500/10 border-rose-500/50'
                                                : 'bg-black/20 border-white/10 hover:border-rose-400/30 hover:bg-black/30'}
                                  `}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mr-3 transition-all ${boFile ? 'bg-rose-500 text-white shadow-lg' : 'bg-white/5 text-slate-400 group-hover:bg-white/10 group-hover:text-white'}`}>
                                            <i className="fas fa-file-invoice"></i>
                                        </div>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-2xs font-black text-slate-500 uppercase tracking-widest">Đơn Nợ (BO)</span>
                                            <span className={`text-xs font-bold truncate ${boFile ? 'text-rose-200' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                                {boFile ? boFile.name : "Tùy chọn"}
                                            </span>
                                        </div>
                                        <input type="file" ref={boInputRef} className="hidden" accept=".csv" onChange={(e) => e.target.files && setBoFile(e.target.files[0])} />
                                    </div>
                                </div>



                                {/* Action Button */}
                                <button
                                    disabled={!mainFile || isLoading}
                                    onClick={processFiles}
                                    className={`
                                  w-full h-14 rounded-xl font-black uppercase tracking-[0.15em] shadow-lg transition-all flex items-center justify-center gap-3 mt-4 border border-white/10 group relative overflow-hidden
                                  ${!mainFile || isLoading
                                            ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                                            : 'bg-gradient-blue hover:shadow-glow-blue hover:scale-[1.02] text-white'}
                              `}
                                >
                                    {isLoading ? (
                                        <>
                                            <i className="fas fa-circle-notch animate-spin"></i>
                                            <span>Processing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="relative z-10">Bắt đầu Phân tích</span>
                                            <i className="fas fa-arrow-right group-hover:translate-x-1 transition-transform relative z-10"></i>
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
