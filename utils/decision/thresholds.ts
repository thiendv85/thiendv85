// decision-thresholds.ts

export const THRESHOLDS = {
  // Below this OOS ratio, order is considered low-risk
  MAX_OOS_RATIO_FOR_APPROVE: 0.05,

  // Above this Risk ratio, recommendation shifts to "adjust first"
  MAX_RISK_RATIO_FOR_APPROVE: 0.15,

  // Minimum average MOS for an approved order to be considered healthy
  MIN_AVG_MOS_AFTER_APPROVE: 1.0,

  // If more than this share of SKUs have warnings, shift to "needs adjustment"
  MAX_WARNING_RATIO: 0.20,

  // Value threshold for "High Value Order" reason (VND)
  HIGH_VALUE_THRESHOLD: 1_000_000_000,

  // Confidence is "high" if both OOS and risk are below this ratio
  CONFIDENCE_HIGH_THRESHOLD: 0.05,

  // Confidence is "low" if there are any blockers from preApprovalResult
  CONFIDENCE_LOW_ON_BLOCKER: true,

  // MOS target (fallback if SKU doesn't have one)
  DEFAULT_MOS_TARGET: 2.0,
} as const;
