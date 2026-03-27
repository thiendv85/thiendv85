/**
 * Demand Forecasting Engine
 * SES, Holt (damped trend), Croston/SBA
 */

import { DemandPattern, avg } from './demandPattern';

export interface ForecastResult {
    value: number;          // forecasted demand for next period
    method: string;         // name of method used
    error: number;          // MAD (Mean Absolute Deviation)
    accuracy: number;       // 0-100%
    accuracyLabel: string;  // "85%" or "N/A"
}

/**
 * Simple Exponential Smoothing (SES)
 * α = smoothing factor (0.1 - 0.3 typical)
 */
function sesForecast(history: number[], alpha: number = 0.2): ForecastResult {
    if (history.length === 0) return { value: 0, method: 'SES', error: 0, accuracy: 0, accuracyLabel: 'N/A' };

    let forecast = history[0];
    const errors: number[] = [];

    for (let i = 1; i < history.length; i++) {
        errors.push(Math.abs(history[i] - forecast));
        forecast = alpha * history[i] + (1 - alpha) * forecast;
    }

    const nextForecast = alpha * history[history.length - 1] + (1 - alpha) * forecast;
    const mad = errors.length > 0 ? avg(errors) : 0;
    const accuracy = nextForecast > 0 ? Math.max(0, 100 - (mad / nextForecast) * 100) : 0;

    return {
        value: Math.max(0, nextForecast),
        method: 'SES',
        error: mad,
        accuracy,
        accuracyLabel: nextForecast > 0 ? `${Math.round(accuracy)}%` : 'N/A',
    };
}

/**
 * Holt's Linear Trend (damped)
 * Cho SKU có trend rõ (ERRATIC pattern)
 */
function holtForecast(history: number[], alpha: number = 0.2, beta: number = 0.1, phi: number = 0.9): ForecastResult {
    if (history.length < 3) return sesForecast(history, alpha);

    let level = history[0];
    let trend = history[1] - history[0];
    const errors: number[] = [];

    for (let i = 1; i < history.length; i++) {
        const forecast = level + phi * trend;
        errors.push(Math.abs(history[i] - forecast));

        const newLevel = alpha * history[i] + (1 - alpha) * (level + phi * trend);
        const newTrend = beta * (newLevel - level) + (1 - beta) * phi * trend;
        level = newLevel;
        trend = newTrend;
    }

    const nextForecast = Math.max(0, level + phi * trend);
    const mad = errors.length > 0 ? avg(errors) : 0;
    const accuracy = nextForecast > 0 ? Math.max(0, 100 - (mad / nextForecast) * 100) : 0;

    return {
        value: nextForecast,
        method: 'Holt',
        error: mad,
        accuracy,
        accuracyLabel: nextForecast > 0 ? `${Math.round(accuracy)}%` : 'N/A',
    };
}

/**
 * Croston's Method / SBA (Syntetos-Boylan Approximation)
 * Cho SKU intermittent/lumpy: tách SES trên demand size và interval
 */
function crostonSBA(history: number[], alpha: number = 0.15): ForecastResult {
    if (history.length === 0) return { value: 0, method: 'Croston', error: 0, accuracy: 0, accuracyLabel: 'N/A' };

    const nonZero = history.filter(x => x > 0);
    if (nonZero.length === 0) return { value: 0, method: 'Croston', error: 0, accuracy: 0, accuracyLabel: 'N/A' };

    // Extract demand sizes and intervals between demands
    const sizes: number[] = [];
    const intervals: number[] = [];
    let lastDemandIdx = -1;

    for (let i = 0; i < history.length; i++) {
        if (history[i] > 0) {
            sizes.push(history[i]);
            if (lastDemandIdx >= 0) {
                intervals.push(i - lastDemandIdx);
            }
            lastDemandIdx = i;
        }
    }

    if (sizes.length < 2 || intervals.length === 0) {
        // Not enough data for Croston, fallback to simple average
        const avgDemand = avg(nonZero);
        const avgInterval = history.length / Math.max(nonZero.length, 1);
        const forecast = avgDemand / avgInterval;
        return { value: Math.max(0, forecast), method: 'Croston', error: 0, accuracy: 0, accuracyLabel: 'N/A' };
    }

    // SES on demand sizes
    let smoothedSize = sizes[0];
    for (let i = 1; i < sizes.length; i++) {
        smoothedSize = alpha * sizes[i] + (1 - alpha) * smoothedSize;
    }

    // SES on intervals
    let smoothedInterval = intervals[0];
    for (let i = 1; i < intervals.length; i++) {
        smoothedInterval = alpha * intervals[i] + (1 - alpha) * smoothedInterval;
    }

    // SBA bias correction factor
    const sbaCorrection = 1 - alpha / 2;
    const forecast = (smoothedSize / smoothedInterval) * sbaCorrection;

    // MAD approximation
    const errors = history.map(actual => Math.abs(actual - forecast));
    const mad = avg(errors);
    const accuracy = forecast > 0 ? Math.max(0, 100 - (mad / forecast) * 100) : 0;

    return {
        value: Math.max(0, forecast),
        method: 'Croston/SBA',
        error: mad,
        accuracy: Math.max(0, accuracy),
        accuracyLabel: forecast > 0 ? `${Math.round(Math.max(0, accuracy))}%` : 'N/A',
    };
}

/**
 * Main forecast dispatcher — chọn method theo demand pattern
 */
export function forecastDemand(history: number[], pattern: DemandPattern): ForecastResult {
    if (!history || history.length === 0) {
        return { value: 0, method: 'None', error: 0, accuracy: 0, accuracyLabel: 'N/A' };
    }

    switch (pattern) {
        case 'INTERMITTENT':
        case 'LUMPY':
            return crostonSBA(history);
        case 'ERRATIC':
            return holtForecast(history);
        case 'SMOOTH':
        default:
            return sesForecast(history);
    }
}
