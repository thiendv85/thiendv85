
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { DealerDetail } from '../types/inventory';
import { Typography } from './Typography';

import { FaIcon } from './Icon';
interface DealerInventoryPopupProps {
    items: DealerDetail[];
    children?: React.ReactNode;
}

export const DealerInventoryPopup = ({ items, children }: DealerInventoryPopupProps) => {
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
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        const POPUP_WIDTH = 400;
        const GAP = 10;
        const POPUP_MAX_HEIGHT = 400;

        const contentHeight = Math.min((items.length * 45) + 100, POPUP_MAX_HEIGHT);

        let left = rect.left;
        if (left + POPUP_WIDTH > window.innerWidth) left = window.innerWidth - POPUP_WIDTH - 20;
        if (left < 10) left = 10;

        let top = rect.top - contentHeight - GAP;
        let arrowStyle = 'absolute -bottom-2 w-4 h-4 bg-white border-b border-r border-slate-200 rotate-45';

        if (top < 10) {
            top = rect.bottom + GAP;
            arrowStyle = 'absolute -top-2 w-4 h-4 bg-white border-t border-l border-slate-200 rotate-45';
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

    const arrowInlineStyle = React.useMemo(() => {
        if (!triggerRef.current || !(portalStyle as any).left) return {};
        const rect = triggerRef.current.getBoundingClientRect();
        const popupLeft = parseFloat((portalStyle as any).left as string);
        const arrowLeft = rect.left - popupLeft + (rect.width / 2) - 8;
        return { left: `${Math.max(20, Math.min(360, arrowLeft))}px` };
    }, [isOpen, portalStyle]);

    return (
        <>
            <div
                ref={triggerRef}
                className="w-full h-full cursor-pointer"
                onClick={(e) => { e.stopPropagation(); togglePopup(); }}
            >
                {children}
            </div>

            {isOpen && createPortal(
                <div
                    ref={popupRef}
                    style={portalStyle}
                    className="animate-fadeIn flex flex-col pointer-events-auto"
                >
                    <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.2)] border border-slate-200 overflow-hidden flex flex-col relative">
                        <div className={arrowClass} style={arrowInlineStyle}></div>

                        <div className="bg-slate-900 px-5 py-3 flex justify-between items-center">
                            <Typography variant="label" className="text-white flex items-center gap-2">
                                <FaIcon className="fas fa-warehouse" /> Chi tiết tồn Đại lý
                            </Typography>
                            <Typography variant="label" className="bg-white/20 text-white px-2 py-1 rounded-lg">
                                {items?.length || 0} ĐƠN VỊ
                            </Typography>
                        </div>

                        {items && items.length > 0 ? (
                            <div className="overflow-y-auto custom-scrollbar flex-1 p-0 max-h-[300px] bg-white">
                                <table className="w-full text-xs border-collapse">
                                    <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left"><Typography variant="label-muted">Chi nhánh / Showroom</Typography></th>
                                            <th className="px-4 py-2 text-right"><Typography variant="label" className="text-blue-600">Tồn kho</Typography></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items.sort((a, b) => b.Qty - a.Qty).map((d, i) => (
                                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <Typography variant="label" className="text-slate-900 !font-bold block">{d.BranchName}</Typography>
                                                    <Typography variant="body-sm" className="text-slate-400">{d.Showroom}</Typography>
                                                </td>
                                                <td className="px-4 py-2.5 text-right">
                                                    <Typography variant="mono" className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg inline-block">
                                                        {d.Qty.toLocaleString()}
                                                    </Typography>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="p-10 text-center bg-slate-50/50">
                                <Typography variant="label" className="text-slate-500">Không có dữ liệu tồn đại lý</Typography>
                            </div>
                        )}
                        
                        <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                            <Typography variant="label" className="text-slate-400">Tổng tồn đại lý:</Typography>
                            <Typography variant="h3" className="text-blue-600 !font-bold">
                                {items.reduce((s, c) => s + c.Qty, 0).toLocaleString()}
                            </Typography>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
