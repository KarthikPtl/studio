
'use server';

/**
 * @fileOverview This file contains a Genkit flow that attempts to correct common OCR misreads in mathematical expressions and applies basic corrections to full text.
 *
 * - fixOcrErrors - A function that takes OCR-extracted full text and an optional math expression and returns corrected versions.
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

// List of messages that should bypass the correction flow for the 'fullText' field
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
    .describe('The full OCR-extracted text from the image, potentially including a word problem or general text.'),
  ocrExpression: z
    .string()
    .nullable() // Expression might not have been extracted
    .describe('The isolated mathematical expression extracted by OCR, if any. Null if none was found or if ocrText is an error message.'),
});
export type FixOcrErrorsInput = z.infer<typeof FixOcrErrorsInputSchema>;

const FixOcrErrorsOutputSchema = z.object({
  correctedText: z
    .string()
    .describe('The corrected full text. Returns the original ocrText if it was an error/bypass message or if no corrections are confidently identified.'),
  correctedExpression: z
    .string()
    .nullable() // Still nullable
    .describe('The corrected math expression, prioritizing mathematical validity and standard notation (superscripts, √). Returns the original ocrExpression (or null) if no corrections are confidently identified or if input was null/error.'),
});
export type FixOcrErrorsOutput = z.infer<typeof FixOcrErrorsOutputSchema>;

export async function fixOcrErrors(input: FixOcrErrorsInput): Promise<FixOcrErrorsOutput> {
   // If the main OCR text is an error message, bypass correction entirely
  if (!input.ocrText || BYPASS_CORRECTION_MESSAGES.includes(input.ocrText)) {
    console.warn(`Skipping correction for upstream status: "${input.ocrText}"`);
    return { correctedText: input.ocrText, correctedExpression: null }; // Return original message, null expression
  }

  // If there's no separate expression to correct, we might still correct the main text
  if (!input.ocrExpression) {
      console.log("No separate expression provided, attempting correction on full text only.");
      // Optionally, could just return the original text here if correction is only desired for expressions
      // return { correctedText: input.ocrText, correctedExpression: null };
  }

  return fixOcrErrorsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'fixOcrErrorsPrompt',
  input: {
    schema: z.object({
      ocrText: z
        .string()
        .describe('The full OCR-extracted text, potentially imperfect.'),
      ocrExpression: z
        .string()
        .nullable()
        .describe('The isolated OCR-extracted math expression, potentially imperfect, or null.'),
    }),
  },
  output: {
    schema: z.object({
      correctedText: z
        .string()
        .describe('The corrected full text, with basic OCR errors fixed (like l->1, O->0).'),
      correctedExpression: z
        .string()
        .nullable()
        .describe('The corrected math expression with higher focus on math validity and notation (superscripts, √), or null if input was null or uncorrectable.'),
    }),
  },
  model: 'googleai/gemini-1.5-flash', // Flash is likely sufficient
  prompt: `You are an expert in correcting Optical Character Recognition (OCR) errors, especially in text containing mathematical content (including handwritten).
Your task is to analyze the given OCR full text and the separately extracted mathematical expression (if provided). Correct common misinterpretations to produce the most likely intended text and expression. Apply *more rigorous* mathematical correction to the 'ocrExpression' if present.

Common OCR & Handwriting Errors to Look For:
- 'O' vs '0' (zero)
- 'l' (lowercase L) vs '1' (one) vs '|' (pipe)
- 'S' vs '5'
- 'B' vs '8'
- 'Z' vs '2'
- 'g' vs '9' vs 'q'
- 't' vs '+' (especially in math context)
- 'x' (variable) vs '*' (multiplication) vs '×' (times symbol) - Infer based on context. Aim for '×' or implicit multiplication in the expression. Avoid '*'.
- '/' (slash) vs '÷' (division symbol) - Aim for '÷' or fraction notation in the expression. Avoid '/'.
- '^' (caret) vs Superscript characters (e.g., ², ³) - Aim for superscripts (like x², 2³) in the expression for simple exponents. Use \`(base)^(exponent)\` only if complex.
- 'sqrt' vs '√' (square root symbol) - ALWAYS aim for '√' in the expression. Use √(...) for clarity if needed.
- Misplaced/missing math operators.
- Broken fractions.

Instructions:
1.  Analyze the input OCR Full Text: \`{{{ocrText}}}\`
2.  Analyze the input OCR Expression (if not null): \`{{{ocrExpression}}}\`
3.  **Correct the Full Text ('ocrText'):** Apply *basic, high-confidence* corrections for common misreads (O/0, l/1, S/5, B/8, Z/2). Preserve the overall structure and wording. Put this result in 'correctedText'.
4.  **Correct the Expression ('ocrExpression'):**
    *   If 'ocrExpression' is provided (not null), apply *more thorough corrections*, focusing on mathematical validity and standard notation (superscripts, √, ×, ÷). Use the common errors list. Aim for the most plausible intended mathematical expression. Put this result in 'correctedExpression'.
    *   If 'ocrExpression' is null or empty, the output 'correctedExpression' should also be null.
    *   If 'ocrExpression' is provided but uncorrectable or doesn't look like math, return the original 'ocrExpression' in 'correctedExpression'.
5.  **Maintain Consistency:** If the expression is part of the full text, ensure corrections are reflected reasonably in both outputs, but prioritize mathematical correctness in 'correctedExpression'.
6.  **Uncertainty:** If you are uncertain about a correction, especially in the full text, *do not change it*. Prioritize accuracy over forcing changes.
7.  **Output Format:** Return ONLY a JSON object with 'correctedText' and 'correctedExpression' keys. No extra explanations or markdown.

Input JSON:
\`\`\`json
{
  "ocrText": "{{{ocrText}}}",
  "ocrExpression": {{{json ocrExpression}}}
}
\`\`\`

Output JSON:`,
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
    console.log(`Calling correction model with text: "${input.ocrText}" and expression: "${input.ocrExpression}"`);
    const {output} = await prompt(input);

    // Basic fallback if AI fails unexpectedly
    if (!output || output.correctedText === null || output.correctedText === undefined) { // correctedExpression can be null
        console.warn("Correction flow returned null/undefined output for correctedText. Returning original inputs.");
        return { correctedText: input.ocrText, correctedExpression: input.ocrExpression };
    }

    // Trim potential whitespace from the model's response
    const trimmedCorrectedText = output.correctedText.trim();
    // Handle null expression possibility - trim if string, else keep null
    const trimmedCorrectedExpression = typeof output.correctedExpression === 'string'
        ? output.correctedExpression.trim() || null // Treat empty string correction as null
        : null;


    console.log(`Correction model returned text: "${trimmedCorrectedText}"`);
    console.log(`Correction model returned expression: "${trimmedCorrectedExpression}"`);

    // Return the trimmed corrected results
    return {
        correctedText: trimmedCorrectedText,
        correctedExpression: trimmedCorrectedExpression
    };

   } catch (error) {
      console.error("Error occurred during fixOcrErrorsFlow for:", input, error);
      // Fallback to the original text/expression if the correction flow itself fails
      console.error("Falling back to original OCR results due to correction error.");
      return { correctedText: input.ocrText, correctedExpression: input.ocrExpression };
  }
});
