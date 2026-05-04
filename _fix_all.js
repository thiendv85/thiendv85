const fs=require('fs'),path=require('path');
function fix(f,s,r){const p=path.join('d:/App/V16',f);let c=fs.readFileSync(p,'utf8');if(!c.includes(s)){console.log('  SKIP:'+f);return}c=c.replace(s,r);fs.writeFileSync(p,c,'utf8');console.log('  OK:'+f)}

// 1: approval.ts
fix('types/approval.ts',
"    returned:    ['pending'],  // submitter fixes and resubmits\r\n};",
"    returned:    ['pending'],  // submitter fixes and resubmits\r\n    cancelled:   [],           // terminal\r\n    archived:    [],           // terminal\r\n};");

fix('types/approval.ts',
"        textColor: 'text-purple-900',\r\n    },\r\n};\r\n\r\n// \u2500\u2500 Action Requirements",
"        textColor: 'text-purple-900',\r\n    },\r\n    cancelled: {\r\n        label: '\u0110\u00e3 h\u1ee7y',description: '\u0110\u01a1n \u0111\u00e3 b\u1ecb h\u1ee7y',icon: 'fa-ban',color: 'slate',bgColor: 'bg-slate-100',textColor: 'text-slate-900',\r\n    },\r\n    archived: {\r\n        label: '\u0110\u00e3 l\u01b0u tr\u1eef',description: '\u0110\u01a1n \u0111\u00e3 \u0111\u01b0\u1ee3c l\u01b0u tr\u1eef',icon: 'fa-box-archive',color: 'slate',bgColor: 'bg-slate-50',textColor: 'text-slate-700',\r\n    },\r\n};\r\n\r\n// \u2500\u2500 Action Requirements");

// 1b: ApprovalStatusBadge
fix('components/ApprovalStatusBadge.tsx',
"    cancelled:   { label: '\u0110\u00e3 h\u1ee7y',      icon: 'fa-ban',             cls: 'bg-slate-500/15 border-slate-400/40 text-slate-300' },\r\n};",
"    cancelled:   { label: '\u0110\u00e3 h\u1ee7y',      icon: 'fa-ban',             cls: 'bg-slate-500/15 border-slate-400/40 text-slate-300' },\r\n    archived:    { label: 'L\u01b0u tr\u1eef',     icon: 'fa-box-archive',     cls: 'bg-slate-500/15 border-slate-400/40 text-slate-300' },\r\n};");

// 2: FilterPanel
fix('components/FilterPanel.tsx',
"showBackorders: false, specialFilter: null, debtStatus: [], search: filters.search })",
"showBackorders: false, specialFilter: null, debtStatus: [], search: filters.search, onlyAdjusted: false })");

// 3: OrderReviewModal pagination
fix('components/OrderReviewModal.tsx',
"    const hasChanges = useMemo(() =>\r\n        rows.some(ctx => {",
"    const [currentPage, setCurrentPage] = useState(1);\r\n    const [pageSize, setPageSize] = useState(50);\r\n\r\n    const hasChanges = useMemo(() =>\r\n        rows.some(ctx => {");

// 4: OrderActionSidebar ACTION_STYLE
fix('components/OrderActionSidebar.tsx',
"export const OrderActionSidebar: React.FC<Props>",
"const ACTION_STYLE: Record<string, { icon: string; cls: string }> = {\r\n    approved: { icon: 'fa-circle-check', cls: 'text-emerald-600' },\r\n    rejected: { icon: 'fa-circle-xmark', cls: 'text-rose-500' },\r\n    returned: { icon: 'fa-rotate-left', cls: 'text-indigo-500' },\r\n    commented: { icon: 'fa-comment', cls: 'text-slate-400' },\r\n};\r\n\r\nexport const OrderActionSidebar: React.FC<Props>");

// 5: Dashboard
fix('pages/Dashboard.tsx',
"import { InventoryItem, DashboardSettings, InventoryFilters, DEFAULT_FILTERS, COST_RANGES, FOB_COST_RANGES, getDebtStatus, OrderingDraft } from '../types/inventory';",
"import { InventoryItem, DashboardSettings, InventoryFilters, DEFAULT_FILTERS, COST_RANGES, FOB_COST_RANGES, getDebtStatus, OrderingDraft, LoisProfile } from '../types/inventory';");

fix('pages/Dashboard.tsx',
"const formatPct = (val: number) =>",
"const DEFAULT_LOIS_PROFILES: LoisProfile[] = [];\r\nconst formatPct = (val: number) =>");

fix('pages/Dashboard.tsx','${dSOR}','${printData.deltaStockoutResolved}');
fix('pages/Dashboard.tsx','${formatCurrency(dSA)}','${formatCurrency(printData.deltaStockValAdded)}');
fix('pages/Dashboard.tsx','${formatCurrency(dEA)}','${formatCurrency(printData.deltaExcessAdded)}');

fix('pages/Dashboard.tsx',
"{ data, enrichedData, isEngineProcessing, onItemSelect, initialParams, initialState, onSaveState, draftData, graph, appSettings, supersessionProps }",
"{ data, enrichedData, isEngineProcessing, onItemSelect, initialParams, initialState, onSaveState, draftData, graph, appSettings, onUpdateSettings, supersessionProps }");

// 6: DemandIntelligence
fix('pages/DemandIntelligence.tsx',
"import { AppSettings } from '../types/inventory';",
"import { AppSettings } from './Settings';");

fix('pages/DemandIntelligence.tsx',
"interface DemandIntelligenceProps {",
"interface IntelResult { group: string; [key: string]: any; }\r\n\r\ninterface DemandIntelligenceProps {");

// 7: ApprovalQueue
fix('pages/ApprovalQueue.tsx',
"for (const id of ids) { if ((await processApprovalAction(id, user.id, action as 'approved' | 'rejected')).success) success++; }",
"for (const id of ids) { if ((await processApprovalAction(id as string, user.id, action as 'approved' | 'rejected')).success) success++; }");

fix('pages/ApprovalQueue.tsx',
"{selected && <OrderReviewModal request={selected.req} usersMap={usersMap} onClose={() => setSelected(null)} onRefresh={loadRequests} />}",
"{selected && <OrderReviewModal request={selected.req} actions={selected.actions} usersMap={usersMap} onClose={() => setSelected(null)} onRefresh={loadRequests} />}");

// 8a: ErrorBoundary
fix('App.tsx',
"class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {\r\n    constructor(props: any) { super(props); this.state = { hasError: false, error: null }; }",
"class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {\r\n    state = { hasError: false, error: null as any };\r\n    constructor(props: any) { super(props); }");

// 8b: ApprovalRequest import in App.tsx
{const p='d:/App/V16/App.tsx';let c=fs.readFileSync(p,'utf8');
if(c.includes('ApprovalRequest')&&!/import.*ApprovalRequest/.test(c)){
c=c.replace(/import \{([^}]*)\} from '\.\/types\/inventory'/,(m,i)=>i.includes('ApprovalRequest')?m:`import {${i}, ApprovalRequest } from './types/inventory'`);
fs.writeFileSync(p,c,'utf8');console.log('  OK: App.tsx ApprovalRequest import')}}

// 8c: Worker declaration
fs.writeFileSync('d:/App/V16/types/worker.d.ts',"declare module '*?worker' {\r\n    const w: new () => Worker;\r\n    export default w;\r\n}\r\n");
console.log('  OK: worker.d.ts');

// 8d: searchLogic CarModel
fix('utils/searchLogic.ts',"${item.CarModel || ''}","${item.TypeCar || ''}");

// 8e: supabase ThuongHieu
fix('utils/supabase.ts','data[0]?.ThuongHieu','(data[0] as any)?.ThuongHieu');

console.log('\nDONE!');
