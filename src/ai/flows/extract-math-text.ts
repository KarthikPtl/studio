'use server';

/**
 * @fileOverview A Genkit flow to extract text from an image, optimized for math expressions.
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
      "An image of a math expression, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractMathTextInput = z.infer<typeof ExtractMathTextInputSchema>;

const ExtractMathTextOutputSchema = z.object({
  extractedText: z
    .string()
    .describe('The text extracted from the math expression image, or "NO_TEXT_FOUND" if none could be reliably extracted.'),
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
          "An image of a math expression, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      extractedText: z
        .string()
        .describe('The text extracted from the math expression image, or "NO_TEXT_FOUND" if none could be reliably extracted.'),
    }),
  },
  model: 'googleai/gemini-pro-vision', // Use Vision model
  prompt: `Carefully analyze the provided image and extract any mathematical expression present.
Focus ONLY on the mathematical characters, symbols, numbers, and variables (like x, y, etc.).
Ignore any surrounding text, background elements, or handwriting that is not part of a clear mathematical expression.

Image: {{media url=imageDataUri}}

If a clear mathematical expression is found, output ONLY the extracted text.
If no mathematical expression can be reliably extracted (e.g., image is blurry, unclear, or contains no math), output the exact string "NO_TEXT_FOUND".

Extracted Text:`,
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

  return output;
});
