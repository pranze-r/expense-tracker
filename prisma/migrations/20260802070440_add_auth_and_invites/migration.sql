-- CreateTable
CREATE TABLE "BookInvite" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "bookId" TEXT NOT NULL,

    CONSTRAINT "BookInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookInvite_token_key" ON "BookInvite"("token");

-- AddForeignKey
ALTER TABLE "BookInvite" ADD CONSTRAINT "BookInvite_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;
