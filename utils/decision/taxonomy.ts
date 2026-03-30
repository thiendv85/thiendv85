// decision-reason-taxonomy.ts

export const REASON_TAXONOMY = {
    rejected: [
        'Fundamental error in draft logic',
        'Budget cancellation/exceeded',
        'Duplicate of another order',
        'Strategy shift (Manual override)',
        'Data inconsistency or corruption',
        'Fundamentally incorrect forecast basis',
        'Strategic priority mismatch',
        'Requires full redraft'
    ],
    returned: [
        'Quantities require downward adjustment',
        'Missing justification for high-value items',
        'Review Air/Sea allocation split',
        'Forecast appears overly optimistic',
        'Dealer stock integration needed',
        'Stock already sufficient',
        'Overstock risk unacceptable',
        'Proposal lacks explanation'
    ]
};
