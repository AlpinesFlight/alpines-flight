import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { safeUserSelect } from "@/lib/selects";
import { canManageSchool } from "@/lib/permissions";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedStudentId = searchParams.get("studentId");
  // Un élève ne voit que ses propres inscriptions.
  const studentId = session.user.role === "STUDENT" ? session.user.id : requestedStudentId;

  const enrollments = await prisma.enrollment.findMany({
    where: studentId ? { studentId } : undefined,
    include: {
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      program: { include: { phases: { include: { exercises: true } } } },
      progress: { orderBy: { date: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(enrollments);
}

const createSchema = z.object({
  studentId: z.string(),
  programId: z.string(),
  instructorId: z.string().optional().nullable(),
  targetExamDate: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !canManageSchool(session.user.role))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.enrollment.findUnique({
    where: {
      studentId_programId: {
        studentId: parsed.data.studentId,
        programId: parsed.data.programId,
      },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Cet élève est déjà inscrit à ce programme." },
      { status: 409 }
    );
  }

  const { targetExamDate, ...rest } = parsed.data;
  const enrollment = await prisma.enrollment.create({
    data: {
      ...rest,
      targetExamDate: targetExamDate ? new Date(targetExamDate) : null,
    },
    include: {
      student: { select: safeUserSelect },
      instructor: { select: safeUserSelect },
      program: true,
    },
  });
  return NextResponse.json(enrollment, { status: 201 });
}
