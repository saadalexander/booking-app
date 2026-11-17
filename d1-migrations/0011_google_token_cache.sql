-- Keep the short-lived Google access token (encrypted) so every server can reuse it instead of refreshing on each request
ALTER TABLE "GoogleConnection" ADD COLUMN "accessToken" TEXT;
ALTER TABLE "GoogleConnection" ADD COLUMN "accessTokenExpires" DATETIME;
