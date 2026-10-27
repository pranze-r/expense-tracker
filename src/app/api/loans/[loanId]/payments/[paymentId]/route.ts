import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ loanId: string; paymentId: string }> };

async function ownsLoan(userId: string, loanId: string) {
  return !!(await prisma.loan.findFirst({ where: { id: loanId, userId }, select: { id: true } }));
}

// PATCH /api/loans/:loanId/payments/:paymentId
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { loanId, paymentId } = await params;
  if (!loanId || !paymentId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await ownsLoan(user.id, loanId))) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const body = await req.json();
  const data: { amount?: number; note?: string | null; date?: Date } = {};
  if (typeof body.amount === "number") {
    if (!(body.amount > 0)) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    data.amount = body.amount;
  }
  if ("note" in body) data.note = body.note;
  if (typeof body.date === "string") {
    const d = new Date(body.date);
    if (isNaN(d.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    data.date = d;
  }

  const result = await prisma.loanPayment.updateMany({ where: { id: paymentId, loanId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  return NextResponse.json(await prisma.loanPayment.findUnique({ where: { id: paymentId } }));
}

// DELETE /api/loans/:loanId/payments/:paymentId
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { loanId, paymentId } = await params;
  if (!loanId || !paymentId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await ownsLoan(user.id, loanId))) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  await prisma.loanPayment.deleteMany({ where: { id: paymentId, loanId } });
  return NextResponse.json({ ok: true });
}
