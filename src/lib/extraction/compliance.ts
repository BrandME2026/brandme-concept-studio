/**
 * ComplianceBoundaryChecker — núcleo puro (WO-13, AC-BEX-004.2): ninguna
 * secuencia verbatim de ≥6 palabras consecutivas del contenido fuente de la
 * marca puede aparecer en copy generado por IA, salvo bloques aprobados
 * explícitamente vía Brand Content Hub. El GATE sobre BrandMePageConfig llega
 * con WO-15 (Build 4) — aquí vive la función reutilizable + tests.
 */

const WINDOW = 6;

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function sequencesOf(words: string[], size: number): Set<string> {
  const seqs = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    seqs.add(words.slice(i, i + size).join(" "));
  }
  return seqs;
}

export interface ComplianceViolation {
  phrase: string;
}

/**
 * Devuelve las secuencias de ≥6 palabras del `sourceContent` presentes en
 * `generatedCopy` (excluyendo las contenidas en `approvedBlocks`).
 */
export function findVerbatimViolations(
  generatedCopy: string,
  sourceContent: string,
  approvedBlocks: string[] = [],
): ComplianceViolation[] {
  const sourceSeqs = sequencesOf(normalizeWords(sourceContent), WINDOW);
  if (sourceSeqs.size === 0) return [];

  const approvedSeqs = new Set<string>();
  for (const block of approvedBlocks) {
    for (const seq of sequencesOf(normalizeWords(block), WINDOW)) approvedSeqs.add(seq);
  }

  const copyWords = normalizeWords(generatedCopy);
  const violations = new Map<string, ComplianceViolation>();
  for (let i = 0; i + WINDOW <= copyWords.length; i++) {
    const seq = copyWords.slice(i, i + WINDOW).join(" ");
    if (sourceSeqs.has(seq) && !approvedSeqs.has(seq) && !violations.has(seq)) {
      violations.set(seq, { phrase: seq });
    }
  }
  return [...violations.values()];
}
