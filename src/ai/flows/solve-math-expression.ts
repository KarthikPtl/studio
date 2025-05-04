'use server';

/**
 * @fileOverview A Genkit flow to solve a mathematical expression, providing step-by-step solutions.
 *
 * - solveMathExpression - A function that takes a math expression string and returns the solution.
 * - SolveMathExpressionInput - The input type for the solveMathExpression function.
 * - SolveMathExpressionOutput - The return type for the solveMathExpression function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';

const SolveMathExpressionInputSchema = z.object({
  expression: z
    .string()
    .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x^2 - 4 = 0", "sin(pi/2)"). Should not be "NO_TEXT_FOUND" or "OCR_PROCESSING_ERROR".'),
});
export type SolveMathExpressionInput = z.infer<typeof SolveMathExpressionInputSchema>;

const SolveMathExpressionOutputSchema = z.object({
  solution: z
    .string()
    .describe('A detailed, step-by-step solution to the mathematical expression, formatted in Markdown. Includes clear steps and the final answer(s), or a specific explanation if it cannot be solved.'),
});
export type SolveMathExpressionOutput = z.infer<typeof SolveMathExpressionOutputSchema>;

export async function solveMathExpression(input: SolveMathExpressionInput): Promise<SolveMathExpressionOutput> {
  return solveMathExpressionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'solveMathExpressionPrompt',
  input: {
    schema: z.object({
      expression: z
        .string()
        .describe('The corrected mathematical expression to be solved (e.g., "2x + 3 = 11", "x^2 - 4 = 0", "sin(pi/2)").'),
    }),
  },
  output: {
    schema: z.object({
      solution: z
        .string()
        .describe('A detailed, step-by-step solution to the mathematical expression, formatted in Markdown. Includes clear steps and the final answer(s), or a specific explanation if it cannot be solved. Use standard mathematical notation within the Markdown.'),
    }),
  },
  // Using a Pro model for potentially better mathematical reasoning
  model: 'googleai/gemini-1.5-pro',
  prompt: `You are a highly proficient and meticulous math solver AI. Your task is to provide a detailed, step-by-step solution for the given mathematical expression or equation, formatted clearly using Markdown.

Analyze the input expression: \`{{{expression}}}\`

Follow these instructions PRECISELY:

1.  **Identify Expression Type:** Determine if it's an arithmetic calculation, algebraic equation (linear, quadratic, polynomial, etc.), system of equations, trigonometric evaluation, calculus problem (if simple differentiation/integration), or other standard mathematical type.
2.  **Check Solvability & Solve:**
    *   If it's a calculation (e.g., "3 + 5 * 2"), perform it step-by-step respecting order of operations (PEMDAS/BODMAS).
    *   If it's a solvable equation (e.g., "2x + 3 = 11", "x^2 - 5x + 6 = 0"), find the value(s) of the variable(s). Show the main algebraic steps (isolating variable, factoring, using quadratic formula, simplifying radicals, etc.).
    *   If it's a simple system of linear equations (e.g., "x + y = 5, x - y = 1"), solve for all variables using methods like substitution or elimination, showing steps.
    *   If it involves standard functions (e.g., "sin(pi/2)", "log10(100)", "sqrt(16)"), evaluate them clearly. Use the actual square root symbol '√' instead of 'sqrt()'. For example, √16.
    *   If it requires basic calculus (e.g., derivative of x^2, integral of 2x), perform the operation and show steps if possible.
3.  **Format Output as Markdown:**
    *   Use Markdown headings (e.g., \`## Steps\`) or numbered lists (\`1. ...\`, \`2. ...\`) for clarity in showing steps.
    *   Use standard mathematical notation within the Markdown (e.g., use \`*\`, \`/\`, \`+\`, \`-\`, \`^\` for exponentiation, '√' for square root). Use fractions where appropriate (e.g., \`1/2\`). Use standard function names (\`sin\`, \`cos\`, \`log\`, \`ln\`). Render math inline using backticks (\`...\`) for simple expressions or use standard text.
    *   Explain the *method* being used briefly if complex (e.g., \`1. Apply quadratic formula: ...\`, \`2. Isolate x by subtracting 3 from both sides: ...\`).
4.  **State Final Answer(s):** Clearly label the final result(s) using Markdown emphasis like \`**Final Answer:** ...\` or \`**Solution:** ...\`. For equations, state all valid solutions (e.g., \`x = 4\`, or \`x = 2, x = 3\`). Simplify answers fully (e.g., \`x = √2\`, not \`x = √8/2\`).
5.  **Handle Unsolvable/Invalid Cases (Format as Error/Conclusion):**
    *   If the expression is mathematically invalid (e.g., "2 + = 5", division by zero like "1/(2-2)"), state clearly: \`**Error:** The expression is mathematically invalid because [specific reason].\`
    *   If the input string itself does not appear to be a parsable mathematical expression, state: \`**Error:** The input does not appear to be a valid mathematical expression.\`
    *   If the equation has no real solution (e.g., "x^2 = -1"), demonstrate the reasoning and state: \`**Conclusion:** The equation has no real solution.\` (Provide complex solutions like \`x = ±i\` if applicable).
    *   If the equation has infinitely many solutions (e.g., "x + 1 = x + 1"), demonstrate the identity and state: \`**Conclusion:** The equation is true for all valid values (infinite solutions).\`
    *   If it requires highly advanced math or is too ambiguous, state: \`**Error:** Solving this expression requires advanced techniques or clarification.\`
    *   Provide a specific reason; do not use generic placeholders. Be definitive.

Input Expression:
\`{{{expression}}}\`

Markdown Solution:`,
});


const solveMathExpressionFlow = ai.defineFlow<
  typeof SolveMathExpressionInputSchema,
  typeof SolveMathExpressionOutputSchema
>({
  name: 'solveMathExpressionFlow',
  inputSchema: SolveMathExpressionInputSchema,
  outputSchema: SolveMathExpressionOutputSchema,
}, async input => {
  // Constants defined in the component importing this flow
  const NO_TEXT_FOUND_MESSAGE = "NO_TEXT_FOUND";
  const OCR_PROCESSING_ERROR_MESSAGE = "OCR_PROCESSING_ERROR";
  const MATH_AI_ERROR_PREFIX = "**Error:**";

  // Basic input validation - Check against known upstream failure states
  const trimmedExpression = input.expression?.trim();
  if (!trimmedExpression || trimmedExpression === NO_TEXT_FOUND_MESSAGE || trimmedExpression === OCR_PROCESSING_ERROR_MESSAGE) {
      // Return a specific error message if the input is clearly unusable from upstream OCR
      const reason = !trimmedExpression ? "empty" :
                     trimmedExpression === NO_TEXT_FOUND_MESSAGE ? "indicates no text was found" :
                     "indicates an OCR processing error occurred";
      console.warn(`Solve flow received invalid input: ${reason}. Expression: "${input.expression}"`);
      return { solution: `${MATH_AI_ERROR_PREFIX} Cannot solve. The input expression ${reason}. Please provide a valid mathematical expression, possibly by correcting the OCR output.` };
  }

  try {
      console.log(`Calling solver model with expression: "${trimmedExpression}"`);
      const { output } = await prompt({ expression: trimmedExpression });

      // Ensure output is not null or undefined before returning
      if (!output || output.solution === null || output.solution === undefined) {
          // This indicates an unexpected failure in the AI generation itself
          console.error("AI failed to generate a solution for:", trimmedExpression);
          return { solution: `${MATH_AI_ERROR_PREFIX} The AI solver failed to generate a response. Please try again.` };
      }

      console.log("Solver returned (Markdown):", output.solution);
      // Basic check to ensure it looks somewhat like Markdown (weak check)
      if (!output.solution.includes('**') && !output.solution.includes('\n') && !/^\d+\./m.test(output.solution)) {
        console.warn("Solver output doesn't strongly resemble Markdown. Passing through anyway.");
      }
      return output;

  } catch (error) {
      console.error("Error occurred during solveMathExpressionFlow for:", trimmedExpression, error);
      // Handle potential errors thrown by the Genkit flow/prompt execution
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during solving.";
      return { solution: `${MATH_AI_ERROR_PREFIX} An unexpected error occurred while trying to solve the expression: ${errorMsg}` };
  }
});
