
import { computeInventory } from './utils/inventoryEngine';
import { InventoryItem } from './types/inventory';

const mockItem: any = {
    ItemCode: 'TEST-SKU',
    ItemName: 'Test Seasonality',
    BaseForecast: 100, // 100 units / month
    QuantityInventory_NB: 50,
    QuantityInventory_BB: 50,
    Backorder: 0,
    TotalPO: 0,
    SalesHistory: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100],
    SeasonalityFactor: 1.5, // PEAK SEASON
    SNP: 1,
    UnitCost_PP: 1000
};

const params: any = {
    lt: 30,
    sp: 30,
    ssp: 15,
    demandSource: '12M',
    warehouseScope: 'All',
    costBasis: 'PP',
    snapshotYYMM: '2604'
};

const result = computeInventory(mockItem as any, params);

console.log('--- TEST PEAK SEASON (Factor 1.5) ---');
console.log('Demand Monthly:', result.demandMonthly); // Should be 150
console.log('ROP:', result.rop); // Should be higher
console.log('Warnings:', result.warnings.map(w => w.code));

const mockItemLow: any = { ...mockItem, SeasonalityFactor: 0.5 };
const resultLow = computeInventory(mockItemLow as any, params);

console.log('\n--- TEST LOW SEASON (Factor 0.5) ---');
console.log('Demand Monthly:', resultLow.demandMonthly); // Should be 50
console.log('ROP:', resultLow.rop); // Should be lower
console.log('Warnings:', resultLow.warnings.map(w => w.code));
