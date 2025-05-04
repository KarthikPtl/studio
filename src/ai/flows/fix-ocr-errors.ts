'use server';

/**
 * @fileOverview This file contains a Genkit flow that automatically corrects common OCR misread characters in a math expression, including those from handwritten sources.
 *
 * - fixOcrErrors - A function that takes an OCR-extracted math expression and returns a corrected version.
 * - FixOcrErrorsInput - The input type for the fixOcrErrors function.
 * - FixOcrErrorsOutput - The return type for the fixOcrErrors function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const FixOcrErrorsInputSchema = z.object({
  ocrText: z
    .string()
    .describe('The potentially imperfect OCR-extracted text from the math expression image (could be printed or handwritten). Should not be "NO_TEXT_FOUND" or "OCR_PROCESSING_ERROR".'),
});
export type FixOcrErrorsInput = z.infer<typeof FixOcrErrorsInputSchema>;

const FixOcrErrorsOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected math expression text, prioritizing mathematical validity and fixing common OCR/handwriting errors. Returns the original text if no corrections are confidently identified.'),
});
export type FixOcrErrorsOutput = z.infer<typeof FixOcrErrorsOutputSchema>;

export async function fixOcrErrors(input: FixOcrErrorsInput): Promise<FixOcrErrorsOutput> {
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
        .describe('The corrected math expression text, prioritizing mathematical validity and fixing common OCR/handwriting errors. Returns the original text if no corrections are confidently identified.'),
    }),
  },
  // Using a slightly more capable model might help with nuanced corrections
  // model: 'googleai/gemini-1.5-flash',
  prompt: `You are an expert in correcting Optical Character Recognition (OCR) errors in mathematical expressions, including those extracted from HANDWRITTEN sources.
Your task is to analyze the given OCR text and correct common misinterpretations to produce the most likely *intended*, mathematically plausible expression.

Common OCR & Handwriting Errors to Look For:
- 'O' vs '0' (zero)
- 'l' (lowercase L) vs '1' (one) vs '|' (pipe)
- 'S' vs '5'
- 'B' vs '8'
- 'Z' vs '2'
- 'g' vs '9' vs 'q'
- 't' vs '+'
- 'x' (variable) vs '*' (multiplication) - Infer based on context. Standard math often uses implicit multiplication (e.g., '2x') or a dot (·). If '*' appears, convert it to implicit or standard notation if it clearly represents multiplication between terms (e.g., '2*x' -> '2x'). Keep '*' if it's between numbers (e.g., '3 * 4').
- Misplaced or missing operators (+, -, =, etc.) - Add or correct operators *only* if the mathematical structure strongly implies it.
- Incorrectly recognized exponents (e.g., 'x^ 2' -> 'x^2') or subscripts.
- Confusion between similar symbols like '-' and '–' (en dash). Standardize to '-'.
- Broken fractions (e.g., '1 / 2' -> '1/2').

Instructions:
1.  Analyze the input OCR Text: \`{{{ocrText}}}\`
2.  Identify potential OCR or handwriting misreads based on the common errors and mathematical context.
3.  Correct ONLY the errors that you are reasonably confident about, aiming for a more mathematically valid or standard representation.
4.  If a character looks like a standard variable (like 'x', 'y', 'a', 'b'), KEEP it as a variable unless the context overwhelmingly suggests it's a number or operator (e.g., '2x' should remain '2x', not '2 * something').
5.  Prioritize making the expression mathematically plausible. If a correction makes the expression nonsensical, revert it.
6.  If the input text is already mathematically valid and clear, or if you are uncertain about potential corrections, return the ORIGINAL text unchanged. Do not force corrections.
7.  Output ONLY the corrected (or original) mathematical expression. Do not add explanations, introductions, or markdown formatting.

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
  // Constants defined in the component importing this flow
  const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
  const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";

  // Handle cases where OCR might have produced known failure states upstream
  if (!input.ocrText || input.ocrText === NO_TEXT_FOUND_MESSAGE || input.ocrText === OCR_PROCESSING_ERROR_MESSAGE) {
    console.warn(`Skipping correction for upstream status: "${input.ocrText}"`);
    // Return empty string as corrected text cannot be generated from these states.
    return { correctedText: "" };
  }

  try {
    console.log(`Calling correction model with text: "${input.ocrText}"`);
    const {output} = await prompt(input);

    // Basic fallback if AI fails unexpectedly
    if (!output || output.correctedText === null || output.correctedText === undefined) {
        console.warn("Correction flow returned null/undefined output. Returning original text.");
        return { correctedText: input.ocrText };
    }

    console.log(`Correction model returned: "${output.correctedText}"`);
    return output;

   } catch (error) {
      console.error("Error occurred during fixOcrErrorsFlow for:", input.ocrText, error);
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during correction.";
      // Fallback to the original text if the correction flow itself fails
      // Log the error but don't propagate it in the 'correctedText' field.
      // The UI should show the original OCR text in the editable field.
      return { correctedText: input.ocrText };
  }
});
