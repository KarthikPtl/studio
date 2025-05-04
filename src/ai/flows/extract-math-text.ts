'use server';

/**
 * @fileOverview A Genkit flow to extract text from an image, optimized for math expressions, including handwritten ones.
 *
 * - extractMathText - A function that takes an image data URI and returns the extracted text.
 * - ExtractMathTextInput - The input type for the extractMathText function.
 * - ExtractMathTextOutput - The return type for the extractMathText function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

const ExtractMathTextInputSchema = z.object({
  imageDataUri: z
    .string()
    .describe(
      "An image containing a math expression (printed or handwritten), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractMathTextInput = z.infer<typeof ExtractMathTextInputSchema>;

const ExtractMathTextOutputSchema = z.object({
  extractedText: z
    .string()
    .describe('The mathematical text extracted from the image, or "NO_TEXT_FOUND" if no clear mathematical expression could be reliably identified.'),
});
export type ExtractMathTextOutput = z.infer<typeof ExtractMathTextOutputSchema>;

export async function extractMathText(input: ExtractMathTextInput): Promise<ExtractMathTextOutput> {
  return extractMathTextFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractMathTextPrompt',
  input: {
    schema: z.object({
      imageDataUri: z
        .string()
        .describe(
          "An image containing a math expression (printed or handwritten), as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      extractedText: z
        .string()
        .describe('The mathematical text extracted from the image, or "NO_TEXT_FOUND" if no clear mathematical expression could be reliably identified.'),
    }),
  },
  model: 'googleai/gemini-pro-vision', // Use Vision model
  prompt: `Analyze the provided image VERY carefully to identify and extract ANY mathematical expression present. This includes printed text AND handwritten equations.

Prioritize extracting:
- Numbers (0-9)
- Mathematical operators (+, -, *, /, =, <, >, ≤, ≥, ±, etc.)
- Variables (x, y, z, a, b, c, etc.)
- Parentheses, brackets, braces ({}, [], ())
- Exponents and subscripts (e.g., x^2, y_1)
- Common mathematical functions (sin, cos, log, sqrt, etc.)
- Fraction bars

Your goal is to extract ONLY the core mathematical expression(s).
IGNORE everything else:
- Surrounding non-mathematical text (e.g., question numbers, instructions, names).
- Decorative elements, backgrounds, paper lines, shadows.
- Unclear or illegible scribbles that are not part of a recognizable math expression.

If the image contains a clear mathematical expression (even if messy handwriting or slightly blurry), output ONLY the extracted expression text. Be precise.
Example: If image shows "Solve: 2x + 5 = 15", output "2x + 5 = 15".
Example: If image shows a handwritten "y = mx + b", output "y = mx + b".

If NO clear mathematical expression can be reliably identified after thorough analysis (e.g., the image is completely blank, extremely blurry, or contains only non-math content), output the exact string "NO_TEXT_FOUND". Do not guess if uncertain.

Image: {{media url=imageDataUri}}

Extracted Mathematical Text:`,
});

const extractMathTextFlow = ai.defineFlow<
  typeof ExtractMathTextInputSchema,
  typeof ExtractMathTextOutputSchema
>({
  name: 'extractMathTextFlow',
  inputSchema: ExtractMathTextInputSchema,
  outputSchema: ExtractMathTextOutputSchema,
}, async input => {
  const { output } = await prompt(input);

  // Ensure output is not null/undefined, fallback if necessary
  if (!output || output.extractedText === null || output.extractedText === undefined) {
      console.warn("OCR flow returned null/undefined output. Defaulting to NO_TEXT_FOUND.");
      return { extractedText: "NO_TEXT_FOUND" };
  }
  // Trim whitespace just in case
  output.extractedText = output.extractedText.trim();

   // Add a check for empty string after trim
  if (output.extractedText === "") {
    console.warn("OCR flow returned an empty string after trimming. Defaulting to NO_TEXT_FOUND.");
    return { extractedText: "NO_TEXT_FOUND" };
  }

  return output;
});
