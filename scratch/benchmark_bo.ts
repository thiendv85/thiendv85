
import { prepareSearchCache, parseInventorySearch, matchSearch } from '../utils/searchLogic';

const mockItems = Array.from({ length: 50000 }, (_, i) => ({
    ItemCode: `ITEM-${i}`,
    ItemName: `Part Name ${i} with long description to simulate real data`,
    TypeCar: i % 2 === 0 ? 'KIA K3 / CERATO' : 'MAZDA CX-5 2024',
    BackorderBreakdown: [
        { DocNo: `SO-12345-${i}`, Qty: 1, OrderType: 'VOR', DocDate: '01/01/2024', RawDate: Date.now() - 1000 * 60 * 60 * 24 * 10 },
        { DocNo: `SO-67890-${i}`, Qty: 2, OrderType: 'STOCK', DocDate: '01/01/2024', RawDate: Date.now() - 1000 * 60 * 60 * 24 * 70 }
    ],
    Backorder: 3,
    Backorder_NB: 2,
    Backorder_BB: 1,
    QuantityInventory_NB: 1,
    QuantityInventory_BB: 0,
    QuantityDC_NB: 0,
    QuantityDC_BB: 0,
    SourceId: i % 5 === 0 ? 'HQ' : 'TL',
    BrandName: 'KIA',
    TotalPO: i % 10 === 0 ? 5 : 0,
    computed: {
        unitCost: 1000000,
        boAging: { totalQty: 3, totalValue: 3000000, qty30: 1, qty60: 0, qty90: 1, qtyOver90: 1 },
        incomingCurrentMonth: i % 20 === 0 ? 2 : 0
    }
}));

function resolveMotherGroup(item: any): string {
    if (item.SourceId === 'HQ') return 'HÀN QUỐC';
    if (item.SourceId === 'TL') return 'THÁI LAN';
    return 'KHÁC';
}

function getOrderTypeName(bo: any): string {
    const type = (bo.OrderType || '').toUpperCase();
    if (type.includes('VOR')) return '1. VOR (Xe nằm đường)';
    if (type.includes('STOCK')) return '5. Dự trữ (Stock)';
    return '6. Khác';
}

console.log('--- Starting Experiment Benchmark ---');
// Simulating data coming FROM WORKER (already cached)
const cached = prepareSearchCache(mockItems as any); 

const searchResult = parseInventorySearch('KIA');
const startFilter = Date.now();
const filtered = cached.filter(item => {
    const matchesSearch = matchSearch(item as any, searchResult);
    const matchesSource = true; 
    const matchesAging = true;
    const boQty = Math.max(item.Backorder || 0, (item.computed as any)?.boAging?.totalQty || 0);
    return boQty > 0 && matchesSearch;
});
const endFilter = Date.now();
const filterTime = endFilter - startFilter;
console.log(`Filtering time (50k items): ${filterTime}ms`);

const startMatrix = Date.now();
const matrix: Record<string, any> = {};
filtered.forEach(item => {
    const source = resolveMotherGroup(item);
    if (!matrix[source]) matrix[source] = { total: 0, types: {} };
    const cost = (item.computed as any).unitCost || 0;
    const boQty = Math.max(item.Backorder || 0, (item.computed as any).boAging.totalQty || 0);
    matrix[source].total += boQty;
    
    (item.BackorderBreakdown as any[]).forEach(bo => {
        const t = getOrderTypeName(bo);
        if (!matrix[source].types[t]) matrix[source].types[t] = { qty: 0 };
        matrix[source].types[t].qty += bo.Qty;
    });
});
const endMatrix = Date.now();
const matrixTime = endMatrix - startMatrix;
console.log(`Matrix calculation time: ${matrixTime}ms`);

// NOTE: prepareSearchCache time is now considered 0 for the UI thread
console.log(`Total Main Thread time: ${filterTime + matrixTime}ms`);
console.log('--- End Benchmark ---');
