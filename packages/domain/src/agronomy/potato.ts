import document from './coefficients/potato.v1.json' with { type: 'json' };
import { Coefficients } from './Coefficients.js';
import type { CoefficientDocument } from './Coefficients.js';

/**
 * The potato coefficients, validated at module load.
 *
 * One crop, one file (CLAUDE.md §2 and §8.2). Loading eagerly means a
 * malformed or unsourced coefficient file fails the build and the test suite,
 * not a farmer's phone halfway through a campaign.
 */
export const POTATO_COEFFICIENTS = Coefficients.fromDocument(document as CoefficientDocument);
