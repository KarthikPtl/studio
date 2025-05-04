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
    .describe('The step-by-step solution to the mathematical expression, clearly indicating the final answer, or an explanation if unsolvable.'),
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
        .describe('The step-by-step solution to the mathematical expression, clearly indicating the final answer, or an explanation if unsolvable.'),
    }),
  },
  // Use a more capable model for better mathematical reasoning
  model: 'googleai/gemini-1.5-pro',
  prompt: `You are a highly proficient math solver. Your task is to solve the provided mathematical expression step-by-step and provide a clear final answer.

Follow these instructions precisely:
1.  Analyze the input expression: \`{{{expression}}}\`
2.  If the expression is solvable, show the key steps involved in reaching the solution using standard mathematical notation (e.g., use *, /, +, -).
3.  Clearly label the final answer (e.g., "Final Answer: ...").
4.  If the expression is ambiguous, invalid (e.g., contains non-math text), or cannot be solved (e.g., division by zero), state the reason clearly instead of attempting a solution. Do not output placeholder messages. Explain why it's unsolvable.

Input Expression:
\`{{{expression}}}\`

Step-by-step Solution and Final Answer:`,
});

const solveMathExpressionFlow = ai.defineFlow<
  typeof SolveMathExpressionInputSchema,
  typeof SolveMathExpressionOutputSchema
>({
  name: 'solveMathExpressionFlow',
  inputSchema: SolveMathExpressionInputSchema,
  outputSchema: SolveMathExpressionOutputSchema,
}, async input => {
  // Basic input validation
  if (!input.expression?.trim()) {
      throw new Error("Expression cannot be empty.");
  }

  // Optional: Add more sophisticated validation/sanitization here if needed
  // e.g., check for potentially harmful input, though the AI prompt also handles invalid math.

  const { output } = await prompt(input);

  // Ensure output is not null or undefined before returning
  if (!output) {
      throw new Error("AI failed to generate a solution.");
  }

  return output;
});

