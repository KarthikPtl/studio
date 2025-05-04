'use server';

/**
 * @fileOverview A Genkit flow to solve a mathematical expression.
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
    .describe('The mathematical expression to be solved.'),
});
export type SolveMathExpressionInput = z.infer<typeof SolveMathExpressionInputSchema>;

const SolveMathExpressionOutputSchema = z.object({
  solution: z
    .string()
    .describe('The solution to the mathematical expression. Provide steps if applicable, clearly indicating the final answer.'),
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
        .describe('The mathematical expression to be solved.'),
    }),
  },
  output: {
    schema: z.object({
      solution: z
        .string()
        .describe('The solution to the mathematical expression. Provide steps if applicable, clearly indicating the final answer.'),
    }),
  },
  // Consider using a more capable model if complex math is expected
  // model: 'googleai/gemini-1.5-pro',
  prompt: `Solve the following mathematical expression. Show the key steps if necessary and clearly state the final answer.

Expression: {{{expression}}}

Solution:`,
});

const solveMathExpressionFlow = ai.defineFlow<
  typeof SolveMathExpressionInputSchema,
  typeof SolveMathExpressionOutputSchema
>({
  name: 'solveMathExpressionFlow',
  inputSchema: SolveMathExpressionInputSchema,
  outputSchema: SolveMathExpressionOutputSchema,
}, async input => {
  // Basic input validation/sanitization might be needed here depending on requirements
  if (!input.expression?.trim()) {
      throw new Error("Expression cannot be empty.");
  }

  const { output } = await prompt(input);
  return output!;
});
