
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { DealerDetail } from '../types/inventory';

interface DealerStockPopupProps {
    items: DealerDetail[];
    children?: React.ReactNode;
}

export const DealerStockPopup = ({ items, children }: DealerStockPopupProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [arrowClass, setArrowClass] = useState('');

    const togglePopup = () => {
        if (isOpen) {
            setIsOpen(false);
            return;
        }
        if (items.length === 0 || !triggerRef.current) return;

        const rect = triggerRef.current.getBoundingClientRect();
        const POPUP_WIDTH = 300;
        const GAP = 10;
        const ESTIMATED_ROW_HEIGHT = 30;
        const POPUP_MAX_HEIGHT = 400;
        const contentHeight = Math.min(items.length * ESTIMATED_ROW_HEIGHT + 50, POPUP_MAX_HEIGHT);

        let left = rect.left;
        if (left + POPUP_WIDTH > window.innerWidth) {
            left = window.innerWidth - POPUP_WIDTH - 10;
        }

        let top = rect.top - contentHeight - GAP;
        let arrowStyle = 'absolute -bottom-2 left-6 w-4 h-4 bg-white border-b border-r border-slate-200 rotate-45';

        if (top < 10) {
            top = rect.bottom + GAP;
            arrowStyle = 'absolute -top-2 left-6 w-4 h-4 bg-white border-t border-l border-slate-200 rotate-45';
        }

        setPortalStyle({
            position: 'fixed',
            top: `${top}px`,
            left: `${left}px`,
            width: `${POPUP_WIDTH}px`,
            maxHeight: `${POPUP_MAX_HEIGHT}px`,
            zIndex: 9999
        });
        setArrowClass(arrowStyle);
        setIsOpen(true);
    };

    // Close when clicking outside
    useEffect(() => {
        if (!isOpen) return;
        const handleOutsideClick = (e: MouseEvent) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
                popupRef.current && !popupRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [isOpen]);

    return (
        <>
            <div
                ref={triggerRef}
                className="inline-block cursor-pointer"
                onClick={(e) => { e.stopPropagation(); togglePopup(); }}
            >
                {children}
            </div>

            {isOpen && items.length > 0 && createPortal(
                <div
                    ref={popupRef}
                    style={portalStyle}
                    className="animate-fadeIn flex flex-col pointer-events-auto"
                >
                    <div className="bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col relative">
                        <div className={arrowClass}></div>

                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                            <span className="text-2xs font-black text-slate-500 uppercase tracking-widest">Tồn Kho Đại Lý</span>
                            <span className="bg-blue-100 text-blue-700 text-2xs font-bold px-1.5 py-0.5 rounded-full">{items.length} SR</span>
                        </div>

                        <div className="overflow-y-auto custom-scrollbar flex-1 p-2 max-h-[300px]">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-slate-400 font-bold border-b border-slate-50">
                                        <th className="text-left pb-1 pl-2 text-2xs uppercase">Showroom</th>
                                        <th className="text-right pb-1 pr-2 text-2xs uppercase">SL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.sort((a, b) => b.Qty - a.Qty).map((d, i) => (
                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-1.5 pl-2 font-medium text-slate-700 truncate max-w-[200px]" title={d.Showroom}>{d.Showroom}</td>
                                            <td className="py-1.5 pr-2 text-right font-black text-slate-900">{d.Qty}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-slate-50 px-4 py-2 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-2xs font-bold text-slate-400 uppercase">Tổng cộng</span>
                            <span className="text-sm font-black text-blue-700">{items.reduce((s, c) => s + c.Qty, 0)}</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
