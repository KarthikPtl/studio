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
    .describe('A detailed, step-by-step solution to the mathematical expression, clearly indicating the final answer(s), or a specific explanation if it cannot be solved.'),
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
        .describe('A detailed, step-by-step solution to the mathematical expression, clearly indicating the final answer(s), or a specific explanation if it cannot be solved. Use standard mathematical notation.'),
    }),
  },
  // Using a Pro model for potentially better mathematical reasoning
  model: 'googleai/gemini-1.5-pro',
  prompt: `You are a highly proficient and meticulous math solver AI. Your task is to provide a detailed, step-by-step solution for the given mathematical expression or equation.

Analyze the input expression: \`{{{expression}}}\`

Follow these instructions PRECISELY:

1.  **Identify Expression Type:** Determine if it's an arithmetic calculation, algebraic equation (linear, quadratic, polynomial, etc.), system of equations, trigonometric evaluation, calculus problem (if simple differentiation/integration), or other standard mathematical type.
2.  **Check Solvability & Solve:**
    *   If it's a calculation (e.g., "3 + 5 * 2"), perform it step-by-step respecting order of operations (PEMDAS/BODMAS).
    *   If it's a solvable equation (e.g., "2x + 3 = 11", "x^2 - 5x + 6 = 0"), find the value(s) of the variable(s). Show the main algebraic steps (isolating variable, factoring, using quadratic formula, simplifying radicals, etc.).
    *   If it's a simple system of linear equations (e.g., "x + y = 5, x - y = 1"), solve for all variables using methods like substitution or elimination, showing steps.
    *   If it involves standard functions (e.g., "sin(pi/2)", "log10(100)", "sqrt(16)"), evaluate them clearly.
    *   If it requires basic calculus (e.g., derivative of x^2, integral of 2x), perform the operation and show steps if possible.
3.  **Show Steps Clearly:**
    *   Use numbered steps for clarity.
    *   Use standard mathematical notation ONLY (e.g., use '*', '/', '+', '-', '^' for exponentiation, 'sqrt()' for square root). Use fractions where appropriate (e.g., 1/2 instead of 0.5 unless context demands decimal). Use standard function names (sin, cos, log, ln). Avoid verbose language like "multiplied by".
    *   Explain the *method* being used briefly if complex (e.g., "1. Apply quadratic formula:", "2. Isolate x by subtracting 3 from both sides:").
4.  **State Final Answer(s):** Clearly label the final result(s) using "**Final Answer:**" or "**Solution:**". For equations, state all valid solutions (e.g., "x = 4", or "x = 2, x = 3"). Simplify answers fully (e.g., "x = sqrt(2)", not "x = sqrt(8)/2").
5.  **Handle Unsolvable/Invalid Cases:**
    *   If the expression is mathematically invalid (e.g., "2 + = 5", division by zero within the expression like "1/(2-2)"), state clearly: "**Error:** The expression is mathematically invalid because [specific reason, e.g., contains division by zero]."
    *   If the input string itself does not appear to be a parsable mathematical expression (e.g., contains random non-math text), state: "**Error:** The input does not appear to be a valid mathematical expression."
    *   If the equation has no real solution (e.g., "x^2 = -1"), demonstrate the reasoning and state: "**Conclusion:** The equation has no real solution." (Provide complex solutions if applicable and seems intended, e.g., x = ±i).
    *   If the equation has infinitely many solutions (e.g., "x + 1 = x + 1" or "0 = 0"), demonstrate the identity and state: "**Conclusion:** The equation is true for all valid values of the variable(s) (infinite solutions)."
    *   If it requires highly advanced math beyond standard calculus or involves ambiguous notation you cannot confidently interpret, state: "**Error:** Solving this expression requires advanced mathematical techniques or clarification due to ambiguity."
    *   DO NOT output generic placeholders like "Cannot determine equation type". Provide a specific reason from the categories above. Be definitive.

Input Expression:
\`{{{expression}}}\`

Step-by-step Solution:`,
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

  // Basic input validation - Check against known upstream failure states
  const trimmedExpression = input.expression?.trim();
  if (!trimmedExpression || trimmedExpression === NO_TEXT_FOUND_MESSAGE || trimmedExpression === OCR_PROCESSING_ERROR_MESSAGE) {
      // Return a specific error message if the input is clearly unusable from upstream OCR
      const reason = !trimmedExpression ? "empty" :
                     trimmedExpression === NO_TEXT_FOUND_MESSAGE ? "indicates no text was found" :
                     "indicates an OCR processing error occurred";
      console.warn(`Solve flow received invalid input: ${reason}. Expression: "${input.expression}"`);
      return { solution: `Error: Cannot solve. The input expression ${reason}. Please provide a valid mathematical expression, possibly by correcting the OCR output.` };
  }

  try {
      console.log(`Calling solver model with expression: "${trimmedExpression}"`);
      const { output } = await prompt({ expression: trimmedExpression });

      // Ensure output is not null or undefined before returning
      if (!output || output.solution === null || output.solution === undefined) {
          // This indicates an unexpected failure in the AI generation itself
          console.error("AI failed to generate a solution for:", trimmedExpression);
          return { solution: "Error: The AI solver failed to generate a response. Please try again." };
      }

      console.log("Solver returned:", output.solution);
      return output;

  } catch (error) {
      console.error("Error occurred during solveMathExpressionFlow for:", trimmedExpression, error);
      // Handle potential errors thrown by the Genkit flow/prompt execution
      const errorMsg = error instanceof Error ? error.message : "An unknown error occurred during solving.";
      return { solution: `Error: An unexpected error occurred while trying to solve the expression: ${errorMsg}` };
  }
});
