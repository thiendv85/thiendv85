import { useMemo } from 'react';

/**
 * Custom hook for reusable sales analytics logic.
 * Hook tùy chỉnh cho các logic phân tích doanh số có thể tái sử dụng.
 */
export function useSalesAnalytics(history: number[] = []) {
    return useMemo(() => {
        if (!history || history.length === 0) {
            return {
                adi: 0,
                cv2: 0,
                trend: 'STABLE',
                slope: 0,
                mean: 0,
                stdDev: 0,
            };
        }

        // 1. Mean (Trung bình)
        const sum = history.reduce((a, b) => a + b, 0);
        const mean = sum / history.length;

        // 2. ADI (Average Demand Interval - Khoảng cách nhu cầu trung bình)
        const demandPeriods = history.filter(v => v > 0).length;
        const adi = demandPeriods > 0 ? history.length / demandPeriods : 0;

        // 3. CV2 (Coefficient of Variation squared - Hệ số biến thiên bình phương)
        const variance = history.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / history.length;
        const stdDev = Math.sqrt(variance);
        const cv2 = mean > 0 ? Math.pow(stdDev / mean, 2) : 0;

        // 4. Trend Analysis (Simple Linear Regression - Hồi quy tuyến tính đơn giản)
        const n = history.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += history[i];
            sumXY += i * history[i];
            sumX2 += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
        const intercept = (sumY - slope * sumX) / n;

        // 5. R² (Coefficient of Determination - Hệ số xác định)
        const ssTotal = history.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
        const ssResidual = history.reduce((acc, val, i) => acc + Math.pow(val - (slope * i + intercept), 2), 0);
        const rSquared = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

        let trend: 'STABLE' | 'UP' | 'DOWN' = 'STABLE';
        const threshold = 0.1 * (mean || 1);
        if (slope > threshold) trend = 'UP';
        else if (slope < -threshold) trend = 'DOWN';

        return {
            adi,
            cv2,
            trend,
            slope,
            intercept,
            rSquared,
            mean,
            stdDev,
        };
    }, [history]);
}
