/*
  Warnings:

  - Added the required column `valor` to the `Imovel` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Imovel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "valor" REAL NOT NULL,
    "latitude" REAL NOT NULL DEFAULT 0.0,
    "longitude" REAL NOT NULL DEFAULT 0.0,
    CONSTRAINT "Imovel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Imovel" ("descricao", "id", "latitude", "longitude", "titulo", "userId") SELECT "descricao", "id", "latitude", "longitude", "titulo", "userId" FROM "Imovel";
DROP TABLE "Imovel";
ALTER TABLE "new_Imovel" RENAME TO "Imovel";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
