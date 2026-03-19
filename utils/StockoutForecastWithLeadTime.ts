
import { InventoryItem } from '../types/inventory';

export interface StockoutForecastResult {
  sku: string;
  name: string;
  currentStock: number;
  dailyDemand: number;
  daysUntilStockout: number;
  
  // Lead Time Analysis
  leadTimeAir: number; // 21
  leadTimeSea: number; // 45
  demandInLeadTimeAir: number;
  demandInLeadTimeSea: number;
  
  // Decision
  status: 'CRITICAL' | 'WARNING' | 'SAFE';
  shippingMethod: 'AIR' | 'SEA' | 'NONE';
  orderByDate: string; // Date string (YYYY-MM-DD)
  suggestedQty: number;
  
  // Message
  actionMessage: string; 
}

export class StockoutForecastWithLeadTimeService {
    private static LEAD_TIME_AIR = 21;
    private static LEAD_TIME_SEA = 45;
    private static SAFETY_FACTOR = 1.2; // 20% buffer

    /**
     * Analyze a single item to determine replenishment needs based on Lead Time
     */
    public static analyze(item: InventoryItem): StockoutForecastResult {
        // 1. Calculate Supply (OH + DC)
        // Note: Assuming QuantityInventory contains DC or we sum them up. 
        // Based on your types, it seems separated. Let's sum them.
        const currentStock = (item.QuantityInventory_NB || 0) + 
                             (item.QuantityInventory_BB || 0) + 
                             (item.QuantityDC_NB || 0) + 
                             (item.QuantityDC_BB || 0);

        // 2. Calculate Demand
        // Prioritize Forecast > Avg3M > Avg6M > Min 0.1
        // Using logic similar to other parts of the app
        const monthlyDemand = item.BaseForecast > 0 
            ? item.BaseForecast 
            : (item.AvgQty3M || item.AvgQty6M || 0.1);
        
        const dailyDemand = monthlyDemand / 30;

        // 3. Calculate Thresholds
        const demandInLeadTimeAir = dailyDemand * this.LEAD_TIME_AIR;
        const demandInLeadTimeSea = dailyDemand * this.LEAD_TIME_SEA;
        const daysUntilStockout = dailyDemand > 0 ? currentStock / dailyDemand : 999;

        // 4. Decision Logic
        let status: 'CRITICAL' | 'WARNING' | 'SAFE' = 'SAFE';
        let shippingMethod: 'AIR' | 'SEA' | 'NONE' = 'NONE';
        let actionMessage = 'Stock levels are healthy.';
        let suggestedQty = 0;
        let orderByDate = new Date().toISOString().split('T')[0]; // Default today

        // CRITICAL: Stock is NOT enough to cover AIR lead time
        // Meaning: Even if we ship Air today, we might stock out before it arrives.
        if (currentStock <= demandInLeadTimeAir) {
            status = 'CRITICAL';
            shippingMethod = 'AIR';
            const gapDays = Math.max(0, this.LEAD_TIME_AIR - daysUntilStockout);
            actionMessage = `🔴 Order Air immediately! (Late by ${gapDays.toFixed(0)} days)`;
            
            // Suggest quantity: Logic = Demand during Lead Time (Air) * Safety Buffer
            // We order enough to cover the Air shipment period + buffer. 
            // Or usually, we might want to order enough to reach safety stock?
            // The prompt requested: DemandDuringLeadTime * 1.2
            suggestedQty = (demandInLeadTimeAir * this.SAFETY_FACTOR);
            
            // Refinement: If we are already late, we might need MORE to cover the backlog + future?
            // For simplicity and adherence to prompt, strictly use lead time demand of the method.
            
        } 
        // WARNING: Stock is enough for Air, but NOT enough for Sea
        // Meaning: We have time to ship Sea if we act now. If we wait, we fall into Air zone.
        else if (currentStock <= demandInLeadTimeSea) {
            status = 'WARNING';
            shippingMethod = 'SEA';
            const daysToCritical = Math.max(0, daysUntilStockout - this.LEAD_TIME_AIR);
            actionMessage = `🟡 Order Sea Now. (${daysToCritical.toFixed(0)} days until Air required)`;
            suggestedQty = (demandInLeadTimeSea * this.SAFETY_FACTOR);
        } 
        // SAFE: Stock covers Sea lead time
        else {
            status = 'SAFE';
            shippingMethod = 'NONE';
            const safeDays = Math.max(0, daysUntilStockout - this.LEAD_TIME_SEA);
            actionMessage = `Safe. Reorder in ${safeDays.toFixed(0)} days.`;
            suggestedQty = 0;
        }

        return {
            sku: item.ItemCode,
            name: item.ItemName,
            currentStock,
            dailyDemand,
            daysUntilStockout,
            leadTimeAir: this.LEAD_TIME_AIR,
            leadTimeSea: this.LEAD_TIME_SEA,
            demandInLeadTimeAir,
            demandInLeadTimeSea,
            status,
            shippingMethod,
            orderByDate,
            suggestedQty: Math.max(0, Math.ceil(suggestedQty)),
            actionMessage
        };
    }

    /**
     * Batch analyze a list of items
     */
    public static analyzeBatch(items: InventoryItem[]): StockoutForecastResult[] {
        return items.map(item => this.analyze(item));
    }
}
