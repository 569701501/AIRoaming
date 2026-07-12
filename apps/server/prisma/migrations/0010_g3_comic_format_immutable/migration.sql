CREATE TRIGGER "trg_g3_projects_comic_format_immutable"
BEFORE UPDATE OF "comic_format" ON "projects"
BEGIN
  SELECT RAISE(ABORT, 'AIR_G3:COMIC_FORMAT_IMMUTABLE');
END;
