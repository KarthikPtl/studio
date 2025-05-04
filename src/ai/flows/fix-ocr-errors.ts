
'use server';

/**
 * @fileOverview This file contains a Genkit flow that automatically corrects common OCR misread characters in a math expression, including those from handwritten sources, aiming for standard mathematical notation.
 *
 * - fixOcrErrors - A function that takes an OCR-extracted math expression and returns a corrected version.
 * - FixOcrErrorsInput - The input type for the fixOcrErrors function.
 * - FixOcrErrorsOutput - The return type for the fixOcrErrors function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

// Constants for specific upstream messages passed to the component
const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
const PREPROCESSING_ERROR_MARKER = "PREPROCESSING_ERROR";
const API_ERROR_INVALID_KEY_MARKER = "API_ERROR_INVALID_KEY";
const API_ERROR_QUOTA_MARKER = "API_ERROR_QUOTA";
const GENERAL_API_ERROR_MARKER = "API_GENERAL_ERROR";
const OCR_BLOCKED_BY_SAFETY_MARKER = "OCR_BLOCKED_BY_SAFETY";

// List of messages that should bypass the correction flow
const BYPASS_CORRECTION_MESSAGES = [
    NO_TEXT_FOUND_MESSAGE,
    OCR_PROCESSING_ERROR_MESSAGE,
    PREPROCESSING_ERROR_MARKER,
    API_ERROR_INVALID_KEY_MARKER,
    API_ERROR_QUOTA_MARKER,
    GENERAL_API_ERROR_MARKER,
    OCR_BLOCKED_BY_SAFETY_MARKER
];


const FixOcrErrorsInputSchema = z.object({
  ocrText: z
    .string()
    .describe('The potentially imperfect OCR-extracted text from the math expression image (could be printed or handwritten). Should not be one of the known error/bypass messages.'),
});
export type FixOcrErrorsInput = z.infer<typeof FixOcrErrorsInputSchema>;

const FixOcrErrorsOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected math expression text, prioritizing mathematical validity and standard notation (superscripts, √, ×, ÷). Returns the original text if no corrections are confidently identified or if input was an error/bypass message.'),
});
export type FixOcrErrorsOutput = z.infer<typeof FixOcrErrorsOutputSchema>;

export async function fixOcrErrors(input: FixOcrErrorsInput): Promise<FixOcrErrorsOutput> {
   // Handle cases where OCR might have produced known failure/bypass states upstream
  if (!input.ocrText || BYPASS_CORRECTION_MESSAGES.includes(input.ocrText)) {
    console.warn(`Skipping correction for upstream status: "${input.ocrText}"`);
    // Return the original upstream message directly.
    return { correctedText: input.ocrText };
  }

  return fixOcrErrorsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'fixOcrErrorsPrompt',
  input: {
    schema: z.object({
      ocrText: z
        .string()
        .describe('The potentially imperfect OCR-extracted text from the math expression image (could be printed or handwritten).'),
    }),
  },
  output: {
    schema: z.object({
      correctedText: z
        .string()
        .describe('The corrected math expression text, prioritizing mathematical validity and standard notation (superscripts, √, ×, ÷). Returns the original text if no corrections are confidently identified.'),
    }),
  },
  model: 'googleai/gemini-1.5-flash', // Flash should be sufficient for correction
  prompt: `You are an expert in correcting Optical Character Recognition (OCR) errors in mathematical expressions, including those extracted from HANDWRITTEN sources.
Your task is to analyze the given OCR text and correct common misinterpretations to produce the most likely *intended*, mathematically plausible expression using **standard mathematical notation**.

Common OCR & Handwriting Errors to Look For:
- 'O' vs '0' (zero)
- 'l' (lowercase L) vs '1' (one) vs '|' (pipe)
- 'S' vs '5'
- 'B' vs '8'
- 'Z' vs '2'
- 'g' vs '9' vs 'q'
- 't' vs '+'
- 'x' (variable) vs '*' (multiplication) vs '×' (times symbol) - Infer based on context. Aim for implicit multiplication (e.g., '2x') or the '×' symbol. Avoid '*'.
- '/' (slash) vs '÷' (division symbol) - Aim for '÷' or fraction notation. Avoid '/'.
- '^' (caret) vs Superscript characters (e.g., ², ³) - Aim for superscripts for simple exponents. Use \\\`(base)^(exponent)\\\` only if the exponent is complex.
- 'sqrt' vs '√' (square root symbol) - ALWAYS aim for '√'.
- Misplaced or missing operators (+, -, =, etc.) - Add or correct operators *only* if the mathematical structure strongly implies it.
- Incorrectly recognized exponents (e.g., 'x ^ 2' -> 'x²') or subscripts.
- Confusion between similar symbols like '-' and '–' (en dash). Standardize to '-'.
- Broken fractions (e.g., '1 / 2' -> '1/2').

Instructions:
1.  Analyze the input OCR Text: \`{{{ocrText}}}\`
2.  Identify potential OCR or handwriting misreads based on the common errors and mathematical context.
3.  Correct ONLY the errors that you are reasonably confident about, aiming for a more mathematically valid or standard representation using the preferred notation:
    *   Use superscripts (², ³) for simple powers like x², y³, 2³.
    *   Use '√' for square roots (e.g., √16, √(x+1)).
    *   Use '×' for multiplication (e.g., 3 × 4) or implicit multiplication (e.g., 2x, ab). Avoid '*'.
    *   Use '÷' for division (e.g., 10 ÷ 2) or fraction notation (e.g., 1/2, (x+1)/(y-2)). Avoid '/'.
4.  If a character looks like a standard variable (like 'x', 'y', 'a', 'b'), KEEP it as a variable unless the context overwhelmingly suggests it's a number or operator (e.g., '2x' should remain '2x').
5.  Prioritize making the expression mathematically plausible. If a correction makes the expression nonsensical, revert it.
6.  If the input text is already mathematically valid and uses the preferred standard notation, or if you are uncertain about potential corrections, return the ORIGINAL text unchanged. Do not force corrections.
7.  Output ONLY the corrected (or original) mathematical expression. Do not add explanations, introductions, or markdown formatting like \`\`\`.

OCR Text:
\`{{{ocrText}}}\`

Corrected Text:`,
});

const fixOcrErrorsFlow = ai.defineFlow<
  typeof FixOcrErrorsInputSchema,
  typeof FixOcrErrorsOutputSchema
>({
  name: 'fixOcrErrorsFlow',
  inputSchema: FixOcrErrorsInputSchema,
  outputSchema: FixOcrErrorsOutputSchema,
}, async input => {

  try {
    console.log(`Calling correction model with text: "${input.ocrText}"`);
    const {output} = await prompt(input);

    // Basic fallback if AI fails unexpectedly
    if (!output || output.correctedText === null || output.correctedText === undefined) {
        console.warn("Correction flow returned null/undefined output. Returning original text.");
        return { correctedText: input.ocrText };
    }

    // Trim potential whitespace from the model's response
    const trimmedCorrectedText = output.correctedText.trim();

    console.log(`Correction model returned: "${trimmedCorrectedText}"`);
    // Return the trimmed corrected text
    return { correctedText: trimmedCorrectedText };

   } catch (error) {
      console.error("Error occurred during fixOcrErrorsFlow for:", input.ocrText, error);
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during correction.";
      // Fallback to the original text if the correction flow itself fails
      // Log the error but don't propagate it in the 'correctedText' field.
      // The UI should show the original OCR text in the editable field.
      return { correctedText: input.ocrText };
  }
});
