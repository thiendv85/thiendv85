
import { InventoryItem } from '../types/inventory';

/**
 * Represents a single directed relationship between an old part and a new part.
 * Defines how one SKU supersedes another.
 */
export interface SupersessionMapping {
  /** The obsolete/old part number (Source) */
  oldPart: string;
  /** The active/new part number (Target) */
  newPart: string;
  /** 
   * If true, the parts are two-way interchangeable (A <-> B).
   * If false, it is a one-way supersession (A -> B).
   */
  interchangeable: boolean;
}

/**
 * Represents the full history and lineage of a part within a supersession family.
 * Used to aggregate inventory and providing ordering advice.
 */
export interface SupersessionChain {
  /** The most current, active part number in the chain (Terminal Node) */
  currentPart: string;
  /** List of predecessor part numbers that are no longer active, sorted by age if possible */
  obsoleteParts: string[];
  /** The length of the chain from the oldest known ancestor to the current part */
  chainDepth: number;
  /** A set of all part numbers involved in this specific chain (Current + Obsolete) */
  allParts: string[];
}

/**
 * Core Graph Data Structure for managing Auto Parts Supersession Logic.
 * Utilizes a directed graph approach to track part evolution.
 */
export class SupersessionGraph {
  /** 
   * Forward Lookup: Maps an Old Part to its immediate New Part.
   * Key: Old Part Code -> Value: New Part Code
   * @note Assumes a primary linear progression for simplification (A -> B).
   */
  public graph: Map<string, string>;

  /**
   * Reverse Lookup: Maps a New Part to list of Old Parts that mapped to it.
   * Key: New Part Code -> Value: Array of Old Part Codes
   * Used for backtracking history.
   */
  public reverseGraph: Map<string, string[]>;

  /**
   * Caches the calculated chain data for fast retrieval during rendering.
   * Key: Any Part Code in the chain -> Value: The computed Chain object
   */
  public chains: Map<string, SupersessionChain>;

  /**
   * Stores the interchangeable status of the link starting from Key.
   * Key: Old Part Code -> Value: Boolean (True if Old <-> New, False if Old -> New)
   */
  public interchangeable: Map<string, boolean>;

  /** List of critical data integrity errors (e.g., circular dependencies A->B->A) */
  public validationErrors: string[];

  /** List of non-critical data warnings (e.g., disconnected nodes or ambiguous mappings) */
  public validationWarnings: string[];

  /**
   * Initializes the Graph structure and builds the graph if data is provided.
   * @param mappings Optional initial list of mappings.
   * @param itemCodes Optional list of valid Item Codes for validation.
   */
  constructor(mappings: SupersessionMapping[] = [], itemCodes: string[] = []) {
    this.graph = new Map<string, string>();
    this.reverseGraph = new Map<string, string[]>();
    this.chains = new Map<string, SupersessionChain>();
    this.interchangeable = new Map<string, boolean>();
    this.validationErrors = [];
    this.validationWarnings = [];

    if (mappings.length > 0) {
      this.buildGraph(mappings, itemCodes);
    }
  }

  /**
   * Resets the graph state. Useful when re-uploading data.
   */
  public clear(): void {
    this.graph.clear();
    this.reverseGraph.clear();
    this.chains.clear();
    this.interchangeable.clear();
    this.validationErrors = [];
    this.validationWarnings = [];
  }

  /**
   * Constructs the graph from a list of mappings.
   * Performs validation on the fly.
   * 
   * @param mappings The raw list of supersession relationships
   * @param itemCodes The list of all valid Item Codes currently in the system (for existence checks)
   */
  public buildGraph(mappings: SupersessionMapping[], itemCodes: string[]): void {
    this.clear();

    // Create a Set for O(1) existence checks. Normalize to Upper + Trim.
    const validCodes = new Set(itemCodes.map(c => c.trim().toUpperCase()));

    for (const mapping of mappings) {
      const oldPart = mapping.oldPart.trim().toUpperCase();
      const newPart = mapping.newPart.trim().toUpperCase();

      // Basic empty check
      if (!oldPart || !newPart) continue;

      // 1. Validate Self-Reference (A -> A)
      if (oldPart === newPart) {
        this.validationErrors.push(`Self-reference detected: SKU ${oldPart} cannot supersede itself.`);
        continue; // Critical error, skip mapping
      }

      // 2. Validate New Part Existence
      // If the target part doesn't exist in our inventory master data, we can't recommend it.
      if (!validCodes.has(newPart) && validCodes.size > 0) {
        // Only error if we actually have itemCodes to validate against
        this.validationErrors.push(`Broken Link: Target part ${newPart} (superseding ${oldPart}) does not exist in Item Master.`);
        continue; 
      }

      // 3. Validate Old Part Existence
      if (!validCodes.has(oldPart) && validCodes.size > 0) {
        this.validationWarnings.push(`Legacy Source: Old part ${oldPart} is not in current Item Master (Mapped to ${newPart}).`);
      }

      // 4. Build Forward Graph (Old -> New)
      // Check for multiple parents conflict (Forking): A -> B and A -> C
      if (this.graph.has(oldPart)) {
        const existingTarget = this.graph.get(oldPart);
        if (existingTarget !== newPart) {
          this.validationWarnings.push(`Ambiguous Mapping: ${oldPart} is mapped to both ${existingTarget} and ${newPart}. Using ${newPart}.`);
        }
      }
      this.graph.set(oldPart, newPart);
      this.interchangeable.set(oldPart, mapping.interchangeable);

      // 5. Build Reverse Graph (New -> [Old1, Old2...])
      if (!this.reverseGraph.has(newPart)) {
        this.reverseGraph.set(newPart, []);
      }
      const existingReverseList = this.reverseGraph.get(newPart)!;
      // Avoid duplicates in reverse list
      if (!existingReverseList.includes(oldPart)) {
        existingReverseList.push(oldPart);
      }
    }

    // 6. Post-Build Validation: Detect Cycles
    this.validateGraph();

    // 7. Build Full Chains (Flatten logic)
    this.buildChains();
  }

  /**
   * Safe method to retrieve a chain for any part number (Old or New).
   * Includes fallback logic to traverse the graph if the cache misses.
   * @param partNumber The SKU to query
   */
  public getChain(partNumber: string): SupersessionChain | undefined {
    if (!partNumber) return undefined;
    const code = partNumber.trim().toUpperCase();

    // 1. Direct Cache Hit (O(1))
    if (this.chains.has(code)) {
        return this.chains.get(code);
    }

    // 2. Forward Traversal Fallback
    // If the part isn't in the cache, it might be an intermediate node or
    // the graph build process missed indexing it.
    // We walk forward (Old -> New) until we hit a terminal node or end of path.
    let current = code;
    const visited = new Set<string>();
    
    // Safety break after 50 hops to prevent infinite loops in broken graphs
    let hops = 0;
    while(this.graph.has(current) && hops < 50) {
        if (visited.has(current)) break; // Cycle detected
        visited.add(current);
        current = this.graph.get(current)!;
        hops++;
    }

    // 3. Lookup Terminal Node
    // If 'current' is now a terminal node, it should have a chain.
    if (this.chains.has(current)) {
        const chain = this.chains.get(current);
        // Self-heal: Cache this result for the requested code to speed up next lookup
        if (chain) this.chains.set(code, chain);
        return chain;
    }

    return undefined;
  }

  /**
   * Validates the graph structure to ensure no circular dependencies exist.
   */
  private validateGraph(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detectCycle = (node: string, path: string[]): boolean => {
      if (recursionStack.has(node)) {
        const cyclePath = [...path, node].join(' → ');
        this.validationErrors.push(`Circular reference detected: ${cyclePath}`);
        return true;
      }
      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const nextNode = this.graph.get(node);
      if (nextNode) {
        if (detectCycle(nextNode, path)) return true;
      }

      recursionStack.delete(node);
      path.pop();
      return false;
    };

    for (const startNode of this.graph.keys()) {
      if (!visited.has(startNode)) {
        detectCycle(startNode, []);
      }
    }
  }

  /**
   * Analyzes the graph to build complete supersession chains.
   */
  private buildChains(): void {
    // 1. Identify Terminal Nodes (Leaf Nodes)
    const allTargets = new Set(this.graph.values());
    const allSources = new Set(this.graph.keys());
    
    const terminalNodes = new Set<string>();
    
    for (const target of allTargets) {
      if (!allSources.has(target)) {
        terminalNodes.add(target);
      }
    }

    // 2. Build chains for each terminal node
    for (const terminalNode of terminalNodes) {
      const chain = this.buildChainForPart(terminalNode);
      
      // Map EVERY part in the chain to this chain object for O(1) lookup
      for (const part of chain.allParts) {
        this.chains.set(part, chain);
      }
    }
  }

  /**
   * Traverses backwards from a current part to find all its ancestors.
   */
  private buildChainForPart(currentPart: string): SupersessionChain {
    const obsoleteParts: string[] = [];
    const visited = new Set<string>();

    const traverseBackwards = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);

      const predecessors = this.reverseGraph.get(node);
      if (predecessors && predecessors.length > 0) {
        for (const pred of predecessors) {
          traverseBackwards(pred);
          if (!obsoleteParts.includes(pred)) {
            obsoleteParts.push(pred);
          }
        }
      }
    };

    traverseBackwards(currentPart);

    // Filter out self if present (shouldn't be, but safety first)
    const filteredObsolete = obsoleteParts.filter(p => p !== currentPart);

    return {
      currentPart: currentPart,
      // Logic guarantees obsoleteParts are collected from oldest to newest relative to recursion stack, 
      // but let's trust the graph structure implicitly defines order.
      obsoleteParts: filteredObsolete,
      chainDepth: filteredObsolete.length,
      // Ensure topological order for rendering: [...Obsolete (Old->New), Current]
      allParts: [...filteredObsolete, currentPart]
    };
  }
}

/**
 * Calculates the consolidated inventory for a part and its supersession chain.
 * Aggregates stock and value across all related parts (Old + New).
 */
export function calculateConsolidatedInventory(
  partNumber: string,
  items: InventoryItem[],
  graph: SupersessionGraph
): {
  currentPart: string;
  totalStock: number;
  totalValue: number;
  breakdown: Array<{
      partNumber: string;
      isCurrent: boolean;
      stock: number;
      value: number;
  }>;
} {
  const code = partNumber.trim().toUpperCase();
  // Use the robust getter
  const chain = graph.getChain(code);
  
  // Determine the scope of parts to aggregate
  const partsToProcess = chain ? chain.allParts : [code];
  const currentPart = chain ? chain.currentPart : code;

  let totalStock = 0;
  let totalValue = 0;
  const breakdown: Array<{
      partNumber: string;
      isCurrent: boolean;
      stock: number;
      value: number;
  }> = [];

  partsToProcess.forEach(pCode => {
      const item = items.find(i => i.ItemCode === pCode);
      
      // Calculate stock strictly as requested (NB + BB)
      const stock = item ? (item.QuantityInventory_NB + item.QuantityInventory_BB) : 0;
      
      // Use UnitCost_PP for value calculation
      const unitCost = item ? item.UnitCost_PP : 0;
      const value = stock * unitCost;
      const isCurrent = pCode === currentPart;

      totalStock += stock;
      totalValue += value;

      breakdown.push({
          partNumber: pCode,
          isCurrent,
          stock,
          value
      });
  });

  return {
      currentPart,
      totalStock,
      totalValue,
      breakdown
  };
}
