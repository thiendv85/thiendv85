
// Inline search logic to avoid import issues
const removeAccents = (str: string): string => {
  if (!str) return '';
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
};

const cleanAlphaNumeric = (str: string): string => {
  if (!str) return '';
  return removeAccents(str).replace(/[^a-z0-9]/g, '');
};

const prepareSearchCache = (items: any[]): any[] => {
  return items.map(item => {
    const orderDocs = (item.BackorderBreakdown || [])
      .map((bo: any) => bo.DocNo)
      .filter((doc: any) => !!doc)
      .join(' ');

    return {
      ...item,
      _searchCache: {
        code: cleanAlphaNumeric(item.ItemCode || ''),
        fullText: removeAccents(
          `${item.ItemCode || ''} ${item.ItemName || ''} ${item.TypeCar || ''} ${orderDocs}`
        )
      }
    };
  });
};

const matchSearch = (item: any, tokens: string[]): boolean => {
  const fullTextSearch = item._searchCache?.fullText || '';
  return tokens.every(token => fullTextSearch.includes(token));
};

const mockItems = Array.from({ length: 50000 }, (_, i) => ({
    ItemCode: `ITEM-${i}`,
    ItemName: `Part Name ${i} with long description to simulate real data`,
    TypeCar: i % 2 === 0 ? 'KIA K3 / CERATO' : 'MAZDA CX-5 2024',
    BackorderBreakdown: [
        { DocNo: `SO-12345-${i}`, Qty: 1, OrderType: 'VOR', DocDate: '01/01/2024' },
        { DocNo: `SO-67890-${i}`, Qty: 2, OrderType: 'STOCK', DocDate: '01/01/2024' }
    ],
    Backorder: 3,
    QuantityInventory_NB: 1,
    QuantityInventory_BB: 0,
    QuantityDC_NB: 0,
    QuantityDC_BB: 0,
    SourceId: i % 5 === 0 ? 'HQ' : 'TL',
    BrandName: 'KIA',
    computed: {
        unitCost: 1000000,
        boAging: { totalQty: 3, totalValue: 3000000, qty30: 1, qty60: 0, qty90: 1, qtyOver90: 1 }
    }
}));

console.log('--- Starting Benchmark (Inlined) ---');
const startCache = Date.now();
const cached = prepareSearchCache(mockItems);
const endCache = Date.now();
const cacheTime = endCache - startCache;
console.log(`prepareSearchCache time: ${cacheTime}ms`);

const tokens = ['kia'];
const startFilter = Date.now();
const filtered = cached.filter(item => matchSearch(item, tokens));
const endFilter = Date.now();
const filterTime = endFilter - startFilter;
console.log(`Filtering time (50k items): ${filterTime}ms`);

console.log(`Total time: ${cacheTime + filterTime}ms`);
console.log('--- End Benchmark ---');
