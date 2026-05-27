import React from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem, KittingDefinition, MonthlyData, SourceProfile } from '../types/inventory';
import type { SupersessionGraph, SupersessionMapping } from '../utils/supersessionGraph';

const DataSelectionModal = React.lazy(() =>
    import('./DataSelectionModal').then(m => ({ default: m.DataSelectionModal })),
);
const SupersessionEditModal = React.lazy(() =>
    import('./SupersessionEditModal').then(m => ({ default: m.SupersessionEditModal })),
);
const SkuDetail = React.lazy(() => import('../pages/SkuDetail').then(m => ({ default: m.SkuDetail })));

export interface AppModalsProps {
    isDataModalOpen: boolean;
    onCloseData: () => void;
    monthlyDataDate: string | null;
    profile: { role?: string; department?: string } | null;
    onSelectInventory: (data: InventoryItem[], filename: string, sourceId?: string) => void;
    onSelectMonthly: (data: Record<string, MonthlyData>, monthDate: string, updatedAt: string) => Promise<void>;
    sourceProfiles: SourceProfile[];
    activeSourceId: string | undefined;

    isSsModalOpen: boolean;
    onCloseSs: () => void;
    onSaveSs: (oldPart: string, newPart: string, interchangeable: boolean) => void;
    editingSs: SupersessionMapping | null;
    ssMappings: SupersessionMapping[];
    data: InventoryItem[];

    selectedItem: InventoryItem | null;
    onCloseDetail: () => void;
    onItemSelect: (item: InventoryItem) => void;
    kittingDefs: KittingDefinition[];
    onNavigateToPackage: (code: string) => void;
    graph: SupersessionGraph;
}

export const AppModals = (p: AppModalsProps) => {
    return (
        <>
            <React.Suspense fallback={null}>
                <DataSelectionModal
                    isOpen={p.isDataModalOpen}
                    onClose={p.onCloseData}
                    currentMonthlyDate={p.monthlyDataDate}
                    userRole={p.profile?.role}
                    userDepartment={p.profile?.department}
                    onSelectInventory={p.onSelectInventory}
                    onSelectMonthly={p.onSelectMonthly}
                    sourceProfiles={p.sourceProfiles}
                    activeSourceId={p.activeSourceId ?? ''}
                />

                <SupersessionEditModal
                    isOpen={p.isSsModalOpen}
                    onClose={p.onCloseSs}
                    onSave={p.onSaveSs}
                    initialData={p.editingSs}
                    existingMappings={p.ssMappings}
                    items={p.data}
                />
            </React.Suspense>

            {p.selectedItem &&
                createPortal(
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-6 print:hidden overflow-hidden">
                        <div
                            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
                            onClick={p.onCloseDetail}
                        />
                        <div className="relative w-full max-w-[1500px] h-[90vh] bg-[#F8FAFC] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-fadeIn border border-white/20">
                            <React.Suspense fallback={null}>
                                <SkuDetail
                                    item={p.selectedItem}
                                    allData={p.data}
                                    onClose={p.onCloseDetail}
                                    onItemSelect={p.onItemSelect}
                                    kittingDefs={p.kittingDefs}
                                    onNavigateToPackage={p.onNavigateToPackage}
                                    graph={p.graph}
                                />
                            </React.Suspense>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
};
