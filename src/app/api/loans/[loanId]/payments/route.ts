import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ loanId: string }> };

// POST /api/loans/:loanId/payments -> record a repayment
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { loanId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const loan = await prisma.loan.findFirst({ where: { id: loanId, userId: user.id }, select: { id: true } });
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const body = await req.json();
  if (typeof body?.amount !== "number" || !(body.amount > 0)) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  const date = body.date ? new Date(body.date) : new Date();
  if (isNaN(date.getTime())) return NextResponse.json({ error: "Invalid date" }, { status: 400 });

  const data = { amount: body.amount, note: body.note ?? null, date, loanId };

  if (body.id) {
    // Don't let an id that belongs to some other loan be reused
    const existing = await prisma.loanPayment.findUnique({ where: { id: body.id }, select: { loanId: true } });
    if (existing && existing.loanId !== loanId) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
  }

  const payment = body.id
    ? await prisma.loanPayment.upsert({ where: { id: body.id }, update: {}, create: { id: body.id, ...data } })
    : await prisma.loanPayment.create({ data });

  return NextResponse.json(payment, { status: 201 });
}
