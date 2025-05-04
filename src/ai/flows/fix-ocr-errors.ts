'use server';

/**
 * @fileOverview This file contains a Genkit flow that automatically corrects common OCR misread characters in a math expression.
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
    .describe('The OCR-extracted text from the math expression image.'),
});
export type FixOcrErrorsInput = z.infer<typeof FixOcrErrorsInputSchema>;

const FixOcrErrorsOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected math expression text with common OCR errors fixed.'),
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
        .describe('The OCR-extracted text from the math expression image.'),
    }),
  },
  output: {
    schema: z.object({
      correctedText: z
        .string()
        .describe('The corrected math expression text with common OCR errors fixed.'),
    }),
  },
  prompt: `You are an expert in correcting OCR misreads in math expressions. Given the following OCR-extracted text, identify and correct common errors such as confusing 'O' with '0', 'x' with '*', and other similar mistakes to produce a valid and accurate math expression.

OCR Text: {{{ocrText}}}

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
  const {output} = await prompt(input);
  return output!;
});

