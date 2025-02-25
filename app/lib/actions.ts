'use server'; // 标记所有的导出函数都是 Server Action 函数

import { z } from 'zod';
import { db } from '@vercel/postgres';
import { revalidatePath } from "next/cache";
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Amount must be greater than $0' }),
  status: z.enum(['pending', 'paid'], { invalid_type_error: 'Please select an invoice status.', }),
  date: z.string(),
})

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Please fill out all required fields.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    const client = await db.connect();
    await client.sql`
      INSERT INTO invoices (customer_id, amount, status, date)
      VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    return {
      message: `Database Error: Failed to Create Invoice. ${error}`,
    };
  }

  // clear client cache and fetch data from server
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices'); // redirect works by throwing an error
}

export async function updateInvoice(id: string, preState: State, formData: FormData) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Please check your input fields.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  try {
    const client = await db.connect();
    await client.sql`
      UPDATE invoices
      SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
      WHERE id = ${id}
    `;
  } catch (error) {
    return {
      message: `Database Error: Failed to Update Invoice. ${error}`
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    const client = await db.connect();
    await client.sql`
      DELETE FROM invoices
      WHERE id = ${id}
    `;
    revalidatePath('/dashboard/invoices');
  } catch (error) {
    return {
      message: `Database Error: Failed to Delete Invoice. ${error}`
    };
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return `Something went wrong. ${error}`;
      }
    }
    throw error;
  }
}