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
    .describe('The potentially imperfect OCR-extracted text from the math expression image (could be printed or handwritten).'),
});
export type FixOcrErrorsInput = z.infer<typeof FixOcrErrorsInputSchema>;

const FixOcrErrorsOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected math expression text, prioritizing mathematical validity and fixing common OCR/handwriting errors.'),
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
        .describe('The corrected math expression text, prioritizing mathematical validity and fixing common OCR/handwriting errors.'),
    }),
  },
  // Consider using a slightly more powerful model if simple correction fails often
  // model: 'googleai/gemini-1.5-flash',
  prompt: `You are an expert in correcting OCR errors in mathematical expressions, especially those extracted from HANDWRITTEN text.
Your task is to analyze the given OCR text and correct common misinterpretations to produce the most likely intended, mathematically valid expression.

Common OCR & Handwriting Errors to Look For:
- 'O' vs '0' (zero)
- 'l' (lowercase L) vs '1' (one) vs '|' (pipe)
- 'S' vs '5'
- 'B' vs '8'
- 'Z' vs '2'
- 'g' vs '9' vs 'q'
- 't' vs '+'
- 'x' (variable) vs '*' (multiplication) - infer based on context. Standard math usually uses implicit multiplication or a dot (·), but '*' might appear from OCR. Convert '*' to implicit or standard notation if appropriate.
- Misplaced or missing operators (+, -, =, etc.)
- Incorrectly recognized exponents or subscripts.
- Confusion between similar symbols like '-' and '–' (en dash). Standardize to '-'.

Instructions:
1.  Analyze the input OCR Text: \`{{{ocrText}}}\`
2.  Identify potential OCR or handwriting misreads based on the common errors listed above and mathematical context.
3.  Correct these errors to form a coherent and mathematically valid expression.
4.  If the input looks like a standard variable (like 'x' or 'y'), keep it as a variable unless it's clearly meant to be multiplication in context (e.g., "3 * 4" should remain, but "2x" should remain "2x", not "2*").
5.  Prioritize making the expression mathematically plausible. For example, if you see "2 + = 5", it's likely meant to be "2 + x = 5" or "2 + 3 = 5", infer based on visual similarity if possible, but prefer leaving a placeholder like 'x' if unsure. If it's completely nonsensical and cannot be reasonably corrected, return the original text.
6.  Output ONLY the corrected mathematical expression. Do not add explanations.

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
  // Handle cases where OCR might have produced "NO_TEXT_FOUND" or similar upstream
  if (!input.ocrText || input.ocrText === "NO_TEXT_FOUND" || input.ocrText === "OCR Error.") {
    return { correctedText: input.ocrText || "" }; // Pass through the upstream status/error
  }

  const {output} = await prompt(input);

  // Basic fallback if AI fails unexpectedly
  if (!output || !output.correctedText) {
      console.warn("Correction flow returned null/undefined output. Returning original text.");
      return { correctedText: input.ocrText };
  }

  return output;
});
