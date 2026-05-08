/**
 * SEARCH LOGIC UTILITIES - FIXED VERSION
 * Fix: Phát hiện danh sách mã code phân tách bằng dấu cách
 * VD: "YL000622ZD YL00539680" → CONTEXT_LIST thay vì TEXT_PHRASE
 */

export type SearchType = 'EMPTY' | 'CONTEXT_LIST' | 'TEXT_PHRASE' | 'CONTEXT_FRAGMENT';

export interface SearchResult {
  type: SearchType;
  tokens: string[];
  concatToken?: string;
  displayTokens: string[];
  raw: string;
  modeDescription?: string;
  confidence?: number;
}

// SearchableItem extends InventoryItem so search results carry the full item shape
// (including computed fields), avoiding casts in callers like Dashboard/BackorderAnalytics.
import type { InventoryItem } from '../types/inventory';

export interface SearchableItem extends InventoryItem {
  _searchCache?: {
    code: string;
    fullText: string;
  };
}

// --- HELPER FUNCTIONS ---

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

const levenshteinDistance = (str1: string, str2: string): number => {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
};

// --- NEW: CODE PATTERN DETECTOR ---

/**
 * Phát hiện xem token có phải mã code không
 * Dùng heuristic scoring
 */
const isLikelyCode = (token: string): boolean => {
  if (!token || token.length < 5) return false;
  
  const cleaned = cleanAlphaNumeric(token);
  if (cleaned.length < 5 || cleaned.length > 20) return false;
  
  let score = 0;
  
  // 1. Độ dài hợp lý cho mã code (6-15 chars)
  if (cleaned.length >= 6 && cleaned.length <= 15) score += 15;
  
  // 2. Có chữ số
  const digitCount = cleaned.replace(/[^0-9]/g, '').length;
  if (digitCount > 0) score += 20;
  
  // 3. Tỷ lệ chữ số cao (>30%)
  const digitRatio = digitCount / cleaned.length;
  if (digitRatio > 0.3) score += 15;
  
  // 3b. PENALTY: Mã thuần số quá ngắn (< 5 chars) thường là category/year/model số
  // Với 6 sốnumeric ròng rã, ở THACO thường là mã hàng hóa hoặc mã nhóm quan trọng -> Cho phép. 
  if (digitCount === cleaned.length && cleaned.length < 5) score -= 25;

  // 4. Có chữ cái (Case-insensitive)
  const letterCount = token.replace(/[^a-zA-Z]/g, '').length;
  if (letterCount > 0) score += 10;
  
  // 5. Mix số + chữ (pattern mã code)
  if (digitCount > 0 && letterCount > 0) score += 20;
  
  // 6. Bắt đầu hoặc kết thúc bằng số/chữ (Case-insensitive)
  if (/^[a-zA-Z0-9]/.test(token) && /[a-zA-Z0-9]$/.test(token)) score += 10;
  
  // 7. Ưu tiên mã có độ dài trung bình (10-12 số Toyota/etc)
  if (cleaned.length >= 10 && digitCount === cleaned.length) score += 20;

  // 8. PENALTY: Chứa từ tiếng Việt thường gặp
  const vietnameseWords = ['loc', 'phahn', 'gio', 'dau', 'nha', 'may', 'den', 'cua', 'banh', 'xe'];
  const lowerToken = cleaned.toLowerCase();
  for (const word of vietnameseWords) {
    if (lowerToken.includes(word) && lowerToken.length < 12) {
      score -= 30; // Penalty lớn nếu chứa từ Việt
      break;
    }
  }
  
  // Threshold: >= 40 điểm → Là mã code (Hạ xuống từ 50 để nhận diện mã thuần số 6-7 ký tự)
  return score >= 40;
};

/**
 * Phát hiện danh sách mã code phân tách bằng space
 * VD: "YL000622ZD YL00539680" → true
 */
const isSpaceSeparatedCodeList = (parts: string[]): boolean => {
  if (parts.length < 2 || parts.length > 50) return false;
  
  // Kiểm tra tỷ lệ tokens giống mã code
  const codeLikeCount = parts.filter(p => isLikelyCode(p)).length;
  const ratio = codeLikeCount / parts.length;
  
  // Nếu có 2 tokens -> Chỉ cần 1 trong 2 là mã code (ratio = 0.5) cũng cho phép list
  // Nếu > 2 tokens -> Cần tỷ lệ cao hơn (80%) để tránh nhiễu với phrase
  const requiredRatio = parts.length === 2 ? 0.49 : 0.8;
  
  return ratio >= requiredRatio;
};

// --- PRE-PROCESSING FUNCTION ---

export const prepareSearchCache = (items: SearchableItem[]): SearchableItem[] => {
  return items.map(item => {
    // Thu thập tất cả DocNo từ BackorderBreakdown
    const orderDocs = (item.BackorderBreakdown || [])
      .map(bo => bo.DocNo)
      .filter(doc => !!doc)
      .join(' ');

    return {
      ...item,
      _searchCache: {
        code: cleanAlphaNumeric(item.ItemCode || ''),
        fullText: removeAccents(
          `${item.ItemCode || ''} ${item.ItemName || ''} ${item.TypeCar || ''} ${item.BrandName || ''} ${item.SourceId || ''} ${orderDocs}`
        )
      }
    };
  });
};

// --- AUTO-BATCH ALGORITHM ---

interface ChunkResult {
  chunks: string[];
  chunkSize: number;
  confidence: number;
}

const autoBatchSplit = (cleanStr: string): ChunkResult | null => {
  const commonSizes = [13, 12, 11, 10, 7, 8, 9];
  let bestResult: ChunkResult | null = null;
  let bestScore = 0;

  for (const size of commonSizes) {
    if (cleanStr.length < size * 2) continue;

    const chunks: string[] = [];
    let pos = 0;
    let completeChunks = 0;

    while (pos + size <= cleanStr.length) {
      chunks.push(cleanStr.substring(pos, pos + size));
      pos += size;
      completeChunks++;
    }

    const remainder = cleanStr.length - pos;
    const remainderRatio = remainder / size;

    if (remainder > 0 && remainder < size / 2 && chunks.length > 0) {
      chunks[chunks.length - 1] += cleanStr.substring(pos);
    } else if (remainder >= size / 2) {
      chunks.push(cleanStr.substring(pos));
    }

    let score = completeChunks * 10;
    if (remainder === 0) score += 50;
    if ([11, 13, 10].includes(size)) score += 20;
    score -= remainderRatio * 10;

    if (score > bestScore && chunks.length >= 2) {
      bestScore = score;
      bestResult = {
        chunks,
        chunkSize: size,
        confidence: Math.min(95, 50 + score)
      };
    }
  }

  return bestResult;
};

// --- MAIN PARSING FUNCTION (FIXED) ---

export const parseInventorySearch = (input: string): SearchResult => {
  if (!input || !input.trim()) {
    return { type: 'EMPTY', tokens: [], displayTokens: [], raw: input };
  }

  const rawClean = input.trim();

  // ---------------------------------------------------------
  // MODE 1: HARD LIST (Excel / Dấu phẩy / Xuống dòng)
  // ---------------------------------------------------------
  if (/[\n\t;]/.test(rawClean) || (rawClean.includes(',') && rawClean.split(',').length > 1)) {
    const parts = rawClean.split(/[\n\t,;]+/);
    const validParts = parts.filter(p => p.trim().length > 0);
    const tokens = validParts.map(t => cleanAlphaNumeric(t)).filter(t => t.length > 0);
    
    return { 
      type: 'CONTEXT_LIST', 
      tokens: tokens, 
      displayTokens: validParts,
      raw: input,
      modeDescription: `Excel List (${tokens.length} SKU)`,
      confidence: 100
    };
  }

  // ---------------------------------------------------------
  // MODE 2: SPACE-SEPARATED CODE LIST
  // ---------------------------------------------------------
  const parts = rawClean.split(/\s+/).filter(p => p.length > 0);
  
  // ✅ KIỂM TRA TRƯỚC KHI QUA AUTO BATCH HOẶC TEXT_PHRASE
  if (parts.length >= 2 && isSpaceSeparatedCodeList(parts)) {
    const tokens = parts.map(t => cleanAlphaNumeric(t)).filter(t => t.length > 0);
    return {
      type: 'CONTEXT_LIST',
      tokens: tokens,
      displayTokens: parts,
      raw: input,
      modeDescription: `Space-Separated Codes (${tokens.length} SKU)`,
      confidence: 95
    };
  }

  // ---------------------------------------------------------
  // MODE 2.5: ENHANCED AUTO-BATCH (ONLY IF NOT EXPLICIT LIST)
  // ---------------------------------------------------------
  const cleanStr = cleanAlphaNumeric(rawClean);
  const digitCount = cleanStr.replace(/[^0-9]/g, '').length;
  const isNumberHeavy = cleanStr.length > 0 && (digitCount / cleanStr.length) > 0.75;

  if (cleanStr.length >= 12 && (!rawClean.includes(' ') || isNumberHeavy)) {
    const batchResult = autoBatchSplit(cleanStr);
    
    if (batchResult && batchResult.chunks.length >= 2) {
      return {
        type: 'CONTEXT_LIST',
        tokens: batchResult.chunks,
        displayTokens: batchResult.chunks,
        raw: input,
        modeDescription: `Auto-Batch (${batchResult.chunks.length} SKU × ${batchResult.chunkSize})`,
        confidence: batchResult.confidence
      };
    }
  }

  // ---------------------------------------------------------
  // MODE 3: SMART CONTEXT
  // ---------------------------------------------------------
  const meaningfulTokens = parts.filter(p => p.length > 1);
  
  // CASE A: TEXT PHRASE
  if (meaningfulTokens.length > 1) {
    const textTokens = parts.map(t => removeAccents(t));
    return {
      type: 'TEXT_PHRASE',
      tokens: textTokens, 
      displayTokens: parts,
      raw: input,
      modeDescription: `Phrase Search (${textTokens.length} keywords)`,
      confidence: 90
    };
  } 
  
  // CASE B: FRAGMENT
  else {
    const concatToken = cleanAlphaNumeric(rawClean); 
    const searchTokens = parts.map(t => removeAccents(t));

    return {
      type: 'CONTEXT_FRAGMENT',
      tokens: searchTokens,
      concatToken: concatToken,
      displayTokens: parts,
      raw: input,
      modeDescription: 'Fragment / Code Search',
      confidence: 85
    };
  }
};

// --- MATCHING FUNCTION ---

export const matchSearch = (item: SearchableItem, result: SearchResult, useFuzzy = false): boolean => {
  if (result.type === 'EMPTY') return true;

  const itemCodeClean = item._searchCache?.code || cleanAlphaNumeric(item.ItemCode || '');
  const orderDocs = (item.BackorderBreakdown || [])
    .map(bo => bo.DocNo)
    .filter(doc => !!doc)
    .join(' ');

  const fullTextSearch = item._searchCache?.fullText || removeAccents(
    `${item.ItemCode || ''} ${item.ItemName || ''} ${item.TypeCar || ''} ${orderDocs}`
  );

  switch (result.type) {
    case 'CONTEXT_LIST': {
      // 1. Chuẩn hóa tokens sang chữ thường để so khớp (Case-insensitive Fix)
      const cleanTokens = result.tokens.map(t => cleanAlphaNumeric(t));
      
      // 2. Tìm kiếm Inclusive OR: Duyệt qua từng token và kiểm tra toàn bộ thông tin (Mã, Tên, Đời xe, Đơn hàng)
      for (const token of cleanTokens) {
        if (fullTextSearch.includes(token)) return true;
        
        // Luôn giữ Logic Fuzzy nếu cần (Dữ liệu ItemCode thường dài 7-13 ký tự)
        if (useFuzzy && token.length >= 7 && token.length <= 13) {
          const distance = levenshteinDistance(token, itemCodeClean.substring(0, token.length));
          if (distance <= 1) return true;
        }
      }
      return false;
    }

    case 'TEXT_PHRASE':
      return result.tokens.every(token => fullTextSearch.includes(token));

    case 'CONTEXT_FRAGMENT': {
      if (result.concatToken && result.concatToken.length >= 4) {
        if (itemCodeClean.startsWith(result.concatToken)) return true;
        if (itemCodeClean.includes(result.concatToken)) return true;
        
        if (useFuzzy && result.concatToken.length >= 6) {
          const itemPrefix = itemCodeClean.substring(0, result.concatToken.length);
          const distance = levenshteinDistance(result.concatToken, itemPrefix);
          if (distance <= 1) return true;
        }
      }
      
      return result.tokens.every(token => fullTextSearch.includes(token));
    }

    default:
      return true;
  }
};

// --- ANALYTICS ---

export const logSearchAnalytics = (result: SearchResult, matchCount: number): void => {
  if (typeof console !== 'undefined' && console.log) {
    console.log(`[Search Analytics]`, {
      mode: result.type,
      description: result.modeDescription,
      confidence: result.confidence,
      tokenCount: result.tokens.length,
      matchCount: matchCount,
      rawInput: result.raw.substring(0, 50)
    });
  }
};

// --- USAGE EXAMPLE ---

/*
// TEST CASE - Fix cho vấn đề "YL000622ZD YL00539680"
const testCases = [
  "YL000622ZD YL00539680",           // ✅ Space-Separated Codes (2 SKU)
  "YL000622ZD,YL00539680",           // ✅ Excel List (2 SKU)
  "lọc gió BMW",                     // ✅ Phrase Search (3 keywords)
  "52 10 7314",                      // ✅ Fragment / Code Search
  "52107314200521073142255210731426" // ✅ Auto-Batch
];

testCases.forEach(input => {
  const result = parseInventorySearch(input);
  console.log(`Input: "${input}"`);
  console.log(`→ ${result.modeDescription} (${result.type})`);
  console.log(`→ Tokens:`, result.tokens);
  console.log('---');
});
*/