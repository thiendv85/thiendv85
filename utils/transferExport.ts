import { FilteredTransferItem, TransferBatch } from './transferSmartFilter';

export interface TransferCSVOptions {
    nbToBb: TransferBatch;
    bbToNb: TransferBatch;
    selectedCodes?: Set<string>;
}

function escapeCSV(val: string): string {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
}

function formatRow(item: FilteredTransferItem): string[] {
    const i = item.item;
    const t = item.transfer;
    const tr = i.computed?.transfer;
    const khoGui = item.direction === 'NB_TO_BB' ? 'NB' : 'BB';
    const khoNhan = item.direction === 'NB_TO_BB' ? 'BB' : 'NB';

    return [
        i.ItemCode,
        escapeCSV(i.ItemName || ''),
        khoGui,
        khoNhan,
        item.roundedQty.toString(),
        Math.round(i.computed?.unitCost || i.UnitCost_PP || 0).toString(),
        Math.round(item.transferValue).toString(),
        tr ? tr.mosNB.toFixed(1) : '',
        t.donorMOSAfterGive !== null ? t.donorMOSAfterGive.toFixed(1) : '',
        tr ? tr.mosBB.toFixed(1) : '',
        t.receiverMOSAfterReceive !== null ? t.receiverMOSAfterReceive.toFixed(1) : '',
        Math.round(t.transferNetBenefit).toString(),
        escapeCSV(t.reasonText),
    ];
}

export function generateTransferCSV(opts: TransferCSVOptions): string {
    const { nbToBb, bbToNb, selectedCodes } = opts;

    const headers = [
        'MaHang', 'TenHang', 'KhoGui', 'KhoNhan', 'SoLuong', 'DonGia', 'GiaTri',
        'MOS_NB', 'MOS_NB_Sau', 'MOS_BB', 'MOS_BB_Sau',
        'LoiIch_Rong', 'LyDo',
    ];

    const lines: string[] = [];

    const filterItems = (batch: TransferBatch): FilteredTransferItem[] => {
        if (!selectedCodes || selectedCodes.size === 0) return batch.items;
        return batch.items.filter(fi => selectedCodes.has(fi.item.ItemCode));
    };

    const nbItems = filterItems(nbToBb);
    const bbItems = filterItems(bbToNb);

    if (nbItems.length > 0) {
        lines.push(`# NB → BB: ${nbItems.length} SKU | Qty: ${nbItems.reduce((s, i) => s + i.roundedQty, 0).toLocaleString()} | Value: ${Math.round(nbItems.reduce((s, i) => s + i.transferValue, 0)).toLocaleString()}đ`);
    }
    if (bbItems.length > 0) {
        lines.push(`# BB → NB: ${bbItems.length} SKU | Qty: ${bbItems.reduce((s, i) => s + i.roundedQty, 0).toLocaleString()} | Value: ${Math.round(bbItems.reduce((s, i) => s + i.transferValue, 0)).toLocaleString()}đ`);
    }
    lines.push(`# Exported: ${new Date().toLocaleString('vi-VN')}`);

    lines.push(headers.join(','));

    for (const item of nbItems) {
        lines.push(formatRow(item).join(','));
    }
    for (const item of bbItems) {
        lines.push(formatRow(item).join(','));
    }

    return '﻿' + lines.join('\n');
}

export function downloadTransferCSV(opts: TransferCSVOptions): void {
    const csv = generateTransferCSV(opts);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dieu_phoi_tonkho_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}
