
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BackorderDetail } from '../types/inventory';
import { Typography } from './Typography';
import { useLanguage } from '../utils/i18n';

interface BackorderPopupProps {
    items: BackorderDetail[];
    children?: React.ReactNode;
}

// --- HELPER: ORDER CLASSIFICATION (synced with BackorderProcessing) ---
const ORDER_GROUP_DEFS = [
    { key: 'VOR', labelKey: 'bo_group_vor' as const, color: 'text-red-600 bg-red-50 border-red-100', icon: 'fa-truck-medical' },
    { key: 'WARRANTY', labelKey: 'bo_group_warranty' as const, color: 'text-orange-600 bg-orange-50 border-orange-100', icon: 'fa-shield-halved' },
    { key: 'URGENT', labelKey: 'bo_group_urgent' as const, color: 'text-rose-600 bg-rose-50 border-rose-100', icon: 'fa-bolt' },
    { key: 'CAMPAIGN', labelKey: 'bo_group_campaign' as const, color: 'text-blue-600 bg-blue-50 border-blue-100', icon: 'fa-bullhorn' },
    { key: 'STOCK', labelKey: 'bo_group_stock' as const, color: 'text-indigo-600 bg-indigo-50 border-indigo-100', icon: 'fa-cubes' },
    { key: 'OTHER', labelKey: 'bo_group_other' as const, color: 'text-slate-600 bg-slate-50 border-slate-100', icon: 'fa-box' },
] as const;

type OrderGroupKey = typeof ORDER_GROUP_DEFS[number]['key'];

const getOrderGroup = (bo: BackorderDetail): OrderGroupKey => {
    const doc = (bo.DocNo || '').trim().toUpperCase();
    const type = (bo.OrderType || '').toUpperCase();
    const prefix = doc.charAt(0);

    if (prefix === 'V' || type.includes('VOR')) return 'VOR';
    if (prefix === 'F' || type.includes('BẢO HÀNH') || type.includes('WARRANTY') || type.includes('BH')) return 'WARRANTY';
    if (prefix === 'E' || ['KHẨN', 'URGENT', 'EO', 'NHANH'].some(k => type.includes(k))) return 'URGENT';
    if (type.includes('CHIẾN DỊCH') || type.includes('CAMPAIGN')) return 'CAMPAIGN';
    if (prefix === 'S' || doc.startsWith('RO') || ['DỰ TRỮ', 'STOCK'].some(k => type.includes(k))) return 'STOCK';
    return 'OTHER';
};

export const BackorderPopup = ({ items, children }: BackorderPopupProps) => {
    const { t } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const [arrowClass, setArrowClass] = useState('');

    const orderGroups = useMemo(() => ORDER_GROUP_DEFS.map(g => ({ ...g, label: t(g.labelKey) })), [t]);

    const groupedItems = useMemo(() => {
        if (!items || items.length === 0) return {} as Record<OrderGroupKey, BackorderDetail[]>;

        const groups = { VOR: [], WARRANTY: [], URGENT: [], CAMPAIGN: [], STOCK: [], OTHER: [] } as Record<OrderGroupKey, BackorderDetail[]>;

        // Sắp xếp theo ngày trước khi đưa vào nhóm
        const sortedItems = [...items].sort((a, b) => (a.RawDate || 0) - (b.RawDate || 0));

        sortedItems.forEach(item => {
            const groupKey = getOrderGroup(item);
            groups[groupKey].push(item);
        });

        return groups;
    }, [items]);

    const togglePopup = () => {
        if (isOpen) {
            setIsOpen(false);
            return;
        }
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();

        const POPUP_WIDTH = 550;
        const GAP = 10;
        const POPUP_MAX_HEIGHT = 500;

        const activeGroupCount = ORDER_GROUP_DEFS.filter(g => groupedItems[g.key]?.length > 0).length;
        const contentHeight = Math.min((items.length * 45) + (activeGroupCount * 30) + 100, POPUP_MAX_HEIGHT);

        let left = rect.left;
        if (left + POPUP_WIDTH > window.innerWidth) left = window.innerWidth - POPUP_WIDTH - 20;
        if (left < 10) left = 10;

        let top = rect.top - contentHeight - GAP;
        let arrowStyle = 'absolute -bottom-2 w-4 h-4 bg-white border-b border-r border-blue-200 rotate-45';

        if (top < 10) {
            top = rect.bottom + GAP;
            arrowStyle = 'absolute -top-2 w-4 h-4 bg-white border-t border-l border-blue-200 rotate-45';
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

    const arrowInlineStyle = React.useMemo(() => {
        if (!triggerRef.current || !(portalStyle as any).left) return {};
        const rect = triggerRef.current.getBoundingClientRect();
        const popupLeft = parseFloat((portalStyle as any).left as string);
        const arrowLeft = rect.left - popupLeft + (rect.width / 2) - 8;
        return { left: `${Math.max(20, Math.min(510, arrowLeft))}px` };
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
                    <div className="bg-white rounded-2xl shadow-[0_20px_50px_-12px_rgba(30,58,138,0.3)] border border-blue-100 overflow-hidden flex flex-col relative">
                        <div className={arrowClass} style={arrowInlineStyle}></div>

                        {/* Header Popup */}
                        <div className="bg-gradient-blue px-5 py-3 flex justify-between items-center shadow-lg">
                            <Typography variant="label" className="text-white flex items-center gap-2">
                                <i className="fas fa-list-check"></i> {t('bo_popup_title')}
                            </Typography>
                            <Typography variant="label" className="bg-white/20 backdrop-blur-md text-white px-2 py-1 rounded-lg border border-white/20">
                                {items?.length || 0} {t('bo_popup_orders')}
                            </Typography>
                        </div>

                        {items && items.length > 0 ? (
                            <>
                                <div className="overflow-y-auto custom-scrollbar flex-1 p-0 max-h-[380px] bg-white">
                                    <table className="w-full text-xs border-collapse">
                                        <thead className="bg-slate-50 sticky top-0 z-20 border-b border-slate-100">
                                            <tr>
                                                <th className="px-4 py-2 text-left"><Typography variant="label-muted">{t('bo_col_date_doc')}</Typography></th>
                                                <th className="px-4 py-2 text-left"><Typography variant="label-muted">{t('bo_col_warehouse')}</Typography></th>
                                                <th className="px-4 py-2 text-center"><Typography variant="label" className="text-blue-600">{t('bo_col_eta')}</Typography></th>
                                                <th className="px-4 py-2 text-right"><Typography variant="label" className="text-rose-600">SL</Typography></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderGroups.map((group) => {
                                                const groupItems = groupedItems[group.key];
                                                if (!groupItems || groupItems.length === 0) return null;

                                                const groupTotalQty = groupItems.reduce((sum, i) => sum + i.Qty, 0);

                                                return (
                                                    <React.Fragment key={group.key}>
                                                        {/* Category Header Row */}
                                                        <tr className={`${group.color} border-y border-white/50 sticky top-[29px] z-10 shadow-sm`}>
                                                            <td colSpan={4} className="px-4 py-1.5 flex items-center gap-2">
                                                                <Typography variant="label" className="!font-bold flex items-center gap-2">
                                                                    <i className={`fas ${group.icon} opacity-70`}></i> {group.label}
                                                                </Typography>
                                                                <Typography variant="label" className="ml-auto opacity-70">
                                                                    ({groupItems.length} {t('bo_unit_orders')} - {groupTotalQty.toLocaleString()} units)
                                                                </Typography>
                                                            </td>
                                                        </tr>
                                                        {/* Items in Category */}
                                                        {groupItems.map((d, i) => (
                                                            <tr key={`${group.key}-${i}`} className="hover:bg-blue-50/40 transition-colors border-b border-slate-50 last:border-0 group/row">
                                                                <td className="px-4 py-2.5">
                                                                    <Typography variant="mono" className="text-slate-700 !font-bold">{d.DocDate}</Typography>
                                                                    <Typography variant="label" className="text-slate-400 group-hover/row:text-blue-600 transition-colors normal-case tracking-normal">{d.DocNo}</Typography>
                                                                    {d.Note && <Typography variant="body-sm" className="text-blue-400 italic mt-0.5 truncate max-w-[150px]">{d.Note}</Typography>}
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <Typography variant="label" className="text-slate-600 !font-bold shadow-none border-none">{d.Warehouse}</Typography>
                                                                    {d.Showroom && <Typography variant="body-sm" className="text-slate-400 font-medium">{d.Showroom}</Typography>}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-center">
                                                                    {d.ETA ? (
                                                                        <Typography variant="label" className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100 whitespace-nowrap !font-bold">
                                                                            {d.ETA}
                                                                        </Typography>
                                                                    ) : (
                                                                        <Typography variant="body-sm" className="text-slate-200 font-bold">-</Typography>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-right">
                                                                    <Typography variant="body-sm" className="font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-lg border border-rose-100 shadow-sm inline-block">{d.Qty}</Typography>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Footer Popup */}
                                <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                                    <div className="flex gap-3">
                                        {orderGroups.map(g => {
                                            const count = groupedItems[g.key]?.length || 0;
                                            if (count === 0) return null;
                                            return (
                                                <div key={g.key} className="flex items-center gap-1" title={g.label}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${g.color.split(' ')[1]}`}></div>
                                                    <Typography variant="label" className="text-slate-400 !font-bold">{count}</Typography>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Typography variant="label" className="text-slate-400">{t('bo_footer_total')}</Typography>
                                        <Typography variant="h3" className="text-rose-600 !font-bold">{items.reduce((s, c) => s + c.Qty, 0).toLocaleString()}</Typography>
                                        <Typography variant="label" className="text-rose-400">Units</Typography>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="p-10 text-center bg-slate-50/50">
                                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-200">
                                    <i className="fas fa-folder-open text-2xl"></i>
                                </div>
                                <Typography variant="label" className="text-slate-500 mb-1">{t('bo_empty_title')}</Typography>
                                <Typography variant="body-sm" className="text-slate-400 max-w-[200px] mx-auto">{t('bo_empty_desc')}</Typography>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
