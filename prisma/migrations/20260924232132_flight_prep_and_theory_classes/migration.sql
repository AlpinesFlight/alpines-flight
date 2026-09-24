-- CreateTable
CREATE TABLE "FlightPrepDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "FlightPrepDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheoryClass" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "roomSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TheoryClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TheoryClassDocument" (
    "id" TEXT NOT NULL,
    "theoryClassId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,

    CONSTRAINT "TheoryClassDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlightPrepDocument_category_idx" ON "FlightPrepDocument"("category");

-- CreateIndex
CREATE UNIQUE INDEX "TheoryClass_roomSlug_key" ON "TheoryClass"("roomSlug");

-- CreateIndex
CREATE INDEX "TheoryClassDocument_theoryClassId_idx" ON "TheoryClassDocument"("theoryClassId");

-- AddForeignKey
ALTER TABLE "FlightPrepDocument" ADD CONSTRAINT "FlightPrepDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheoryClass" ADD CONSTRAINT "TheoryClass_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheoryClassDocument" ADD CONSTRAINT "TheoryClassDocument_theoryClassId_fkey" FOREIGN KEY ("theoryClassId") REFERENCES "TheoryClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TheoryClassDocument" ADD CONSTRAINT "TheoryClassDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
