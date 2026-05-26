/**
 * VIETNAMESE CALENDAR — Working Days & Holidays
 * ===============================================
 * Calendar logic for Vietnamese business days, Tet holidays,
 * and public holiday exclusions.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Lịch nghỉ Tết Âm lịch - Ngày bắt đầu (Dương lịch)
 * Dùng để tính toán số ngày nghỉ trong tháng.
 */
export const TET_DATES: Record<number, { month: number; day: number; length: number }> = {
    2024: { month: 1, day: 8, length: 7 }, // Feb 8
    2025: { month: 0, day: 26, length: 7 }, // Jan 26
    2026: { month: 1, day: 16, length: 7 }, // Feb 16
    2027: { month: 1, day: 5, length: 7 }, // Feb 5
};

/** Các ngày lễ Dương lịch cố định tại VN */
export const PUBLIC_HOLIDAYS = [
    { m: 0, d: 1 }, // Tết Dương lịch
    { m: 3, d: 30 }, // Giải phóng Miền Nam
    { m: 4, d: 1 }, // Quốc tế Lao động
    { m: 8, d: 2 }, // Quốc khánh
];

/**
 * Tính số ngày làm việc thực tế tại VN cho một tháng cụ thể.
 * Loại trừ Chủ nhật và các ngày lễ/Tết.
 */
export function getVietnameseWorkingDays(month: number, year: number): number {
    const totalDays = new Date(year, month + 1, 0).getDate();
    let workingDays = 0;

    for (let day = 1; day <= totalDays; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay(); // 0 is Sunday

        // 1. Loại trừ Chủ nhật
        if (dayOfWeek === 0) continue;

        // 2. Loại trừ Lễ Dương lịch
        const isPublicHoliday = PUBLIC_HOLIDAYS.some(h => h.m === month && h.d === day);
        if (isPublicHoliday) continue;

        // 3. Loại trừ Tết Âm lịch (Lookup)
        const tet = TET_DATES[year];
        if (tet) {
            const dateTs = date.getTime();
            const tetStartTs = new Date(year, tet.month, tet.day).getTime();
            const tetEndTs = tetStartTs + tet.length * MS_PER_DAY;
            if (dateTs >= tetStartTs && dateTs < tetEndTs) continue;
        }

        workingDays++;
    }

    return workingDays || 26; // Fallback
}

/**
 * Tính số ngày làm việc (Mon-Sat, không lễ) trong một khoảng thời gian Lịch (Calendar Days).
 * Giúp khớp giữa Lead Time của NCC (Dương lịch) và Lịch bán hàng (Thứ 2 - Thứ 7).
 */
export function getWorkingDaysByLeadTime(calendarDays: number, startDate: Date): number {
    let workingDays = 0;

    for (let i = 0; i < calendarDays; i++) {
        const d = new Date(startDate.getTime() + i * MS_PER_DAY);
        const month = d.getMonth();
        const year = d.getFullYear();
        const mDay = d.getDate();
        const dayOfWeek = d.getDay();

        // 1. Chỉ tính Thứ 2 - Thứ 7
        if (dayOfWeek === 0) continue;

        // 2. Loại trừ Lễ Dương lịch
        if (PUBLIC_HOLIDAYS.some(h => h.m === month && h.d === mDay)) continue;

        // 3. Loại trừ Tết
        const tet = TET_DATES[year];
        if (tet) {
            const dateTs = d.getTime();
            const tetStartTs = new Date(year, tet.month, tet.day).getTime();
            const tetEndTs = tetStartTs + tet.length * MS_PER_DAY;
            if (dateTs >= tetStartTs && dateTs < tetEndTs) continue;
        }

        workingDays++;
    }
    return workingDays;
}

export function getDaysInMonth(m: number, y: number) {
    return new Date(y, m + 1, 0).getDate();
}

/**
 * Build a cache mapping calendar-day offset → cumulative working days.
 * Eliminates repeated Date allocations in the hot loop of computeInventory.
 */
export function buildWorkingDaysCache(startDate: Date, maxDays = 180): Map<number, number> {
    const cache = new Map<number, number>();
    cache.set(0, 0);
    let runningWorkingDays = 0;

    for (let i = 0; i < maxDays; i++) {
        const d = new Date(startDate.getTime() + i * MS_PER_DAY);
        const month = d.getMonth();
        const year = d.getFullYear();
        const mDay = d.getDate();
        const dayOfWeek = d.getDay();

        let isWorking = true;
        // 1. Exclude Sundays
        if (dayOfWeek === 0) isWorking = false;
        // 2. Exclude public holidays
        else if (PUBLIC_HOLIDAYS.some(h => h.m === month && h.d === mDay)) isWorking = false;
        // 3. Exclude Tet
        else {
            const tet = TET_DATES[year];
            if (tet) {
                const dateTs = d.getTime();
                const tetStartTs = new Date(year, tet.month, tet.day).getTime();
                const tetEndTs = tetStartTs + tet.length * MS_PER_DAY;
                if (dateTs >= tetStartTs && dateTs < tetEndTs) isWorking = false;
            }
        }

        if (isWorking) runningWorkingDays++;
        cache.set(i + 1, runningWorkingDays);
    }
    return cache;
}
