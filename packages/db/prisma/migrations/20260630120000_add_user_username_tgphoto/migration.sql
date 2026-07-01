-- Telegram social-login identity: a display handle and the profile-photo file_id.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "tgPhotoFileId" TEXT;
