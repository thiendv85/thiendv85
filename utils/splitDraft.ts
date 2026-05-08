/**
 * splitDraftQty
 * ─────────────
 * Chia số lượng đặt hàng tổng (do planner quyết) thành 2 phần NB / BB sao cho:
 *   1. nb + bb LUÔN LUÔN bằng total (không bao giờ vượt / thiếu)
 *   2. Tỷ lệ chia bám sát gợi ý của engine (suggestedOrderNB / suggestedOrderBB)
 *   3. Trường hợp total quá nhỏ để chia đôi (vd total=1 nhưng cả 2 kho có nhu cầu)
 *      → ưu tiên kho có nhu cầu lớn hơn và trả note để planner cân nhắc
 *
 * Thuật toán: Largest-Remainder (Hamilton method) — phân bổ proportional rồi
 * dồn phần dư vào side có fractional remainder lớn nhất; tie-break ưu tiên NB.
 */
export interface SplitContextHints {
    backorderNB?: number;
    backorderBB?: number;
    availableNB?: number;
    availableBB?: number;
}

export interface SplitDraftResult {
    nb: number;
    bb: number;
    note?: string; // chỉ set khi planner cần biết để cân nhắc
}

const safeNum = (n: number | null | undefined) => (typeof n === 'number' && !Number.isNaN(n) ? n : 0);

/**
 * Quyết định bên nào ưu tiên khi không thể chia đều.
 *  - Backorder cao hơn → ưu tiên (vì có khách đang chờ)
 *  - Sau đó: available thấp hơn → ưu tiên (sắp hết)
 *  - Cuối cùng: NB-first (convention cho HQ)
 */
const pickPrioritySide = (
    sugNB: number,
    sugBB: number,
    hints?: SplitContextHints,
): 'NB' | 'BB' => {
    const boNB = safeNum(hints?.backorderNB);
    const boBB = safeNum(hints?.backorderBB);
    if (boNB !== boBB) return boNB > boBB ? 'NB' : 'BB';

    const avNB = safeNum(hints?.availableNB);
    const avBB = safeNum(hints?.availableBB);
    if (avNB !== avBB) return avNB < avBB ? 'NB' : 'BB';

    if (sugNB !== sugBB) return sugNB > sugBB ? 'NB' : 'BB';
    return 'NB';
};

export function splitDraftQty(
    total: number,
    sugNB: number,
    sugBB: number,
    hints?: SplitContextHints,
): SplitDraftResult {
    const T = Math.max(0, Math.round(safeNum(total)));
    const SN = Math.max(0, safeNum(sugNB));
    const SB = Math.max(0, safeNum(sugBB));

    if (T === 0) return { nb: 0, bb: 0 };

    const totalSug = SN + SB;

    // Không có dữ liệu gợi ý — mặc định dồn về NB và note để planner biết
    if (totalSug === 0) {
        return {
            nb: T,
            bb: 0,
            note: 'Không có dữ liệu gợi ý chia kho — mặc định dồn NB.',
        };
    }

    // Edge case: total = 1 (hoặc nhỏ hơn ngưỡng chia) nhưng cả 2 kho cùng có nhu cầu
    const bothNeed = SN > 0 && SB > 0;
    if (bothNeed && T === 1) {
        const side = pickPrioritySide(SN, SB, hints);
        return {
            nb: side === 'NB' ? 1 : 0,
            bb: side === 'BB' ? 1 : 0,
            note: `Đặt 1 đơn vị nhưng cả NB (${SN}) & BB (${SB}) đều có nhu cầu — ưu tiên ${side}. Planner cần cân nhắc.`,
        };
    }

    // Hamilton / largest-remainder
    const exactNB = (T * SN) / totalSug;
    const exactBB = (T * SB) / totalSug;
    let nb = Math.floor(exactNB);
    let bb = Math.floor(exactBB);
    let remaining = T - nb - bb; // 0, 1, hoặc 2 (rất hiếm)

    while (remaining > 0) {
        const fracNB = exactNB - Math.floor(exactNB);
        const fracBB = exactBB - Math.floor(exactBB);
        if (fracNB > fracBB) {
            nb++;
        } else if (fracBB > fracNB) {
            bb++;
        } else {
            // Tie — dùng priority logic
            const side = pickPrioritySide(SN, SB, hints);
            if (side === 'NB') nb++; else bb++;
        }
        remaining--;
    }

    // Sanity: nếu T < totalSug nghĩa là planner đặt ít hơn nhu cầu tổng → note để biết
    let note: string | undefined;
    if (T < totalSug && bothNeed) {
        note = `Đặt ${T} < tổng nhu cầu ${totalSug} (NB ${SN} / BB ${SB}). Đã chia tỷ lệ — planner xem có cần điều chỉnh.`;
    }

    return { nb, bb, note };
}
