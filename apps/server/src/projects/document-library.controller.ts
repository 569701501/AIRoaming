import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ok } from "../http.js";
import { DocumentLibraryService } from "./document-library.service.js";

@Controller("documents")
export class DocumentLibraryController {
  constructor(@Inject(DocumentLibraryService) private readonly service: DocumentLibraryService) {}

  @Get()
  async list() {
    return ok({ items: await this.service.list() });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const detail = await this.service.getDetail(id);
    if (!detail) throw new NotFoundException("DOCUMENT_NOT_FOUND");
    return ok(detail);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 60 * 1024 * 1024 } }))
  async importSource(
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    if (!file) throw new NotFoundException("DOCUMENT_FILE_REQUIRED");
    return ok(await this.service.importSource(file.originalname, file.buffer));
  }

  @Patch(":id")
  async rename(@Param("id") id: string, @Body() body: { name?: string }) {
    return ok({ work: await this.service.rename(id, body?.name ?? "") });
  }

  @Delete(":id")
  @HttpCode(200)
  async remove(@Param("id") id: string) {
    await this.service.remove(id);
    return ok({ removed: true });
  }

  @Get(":id/chapters/:chapterId")
  async chapterText(
    @Param("id") id: string,
    @Param("chapterId") chapterId: string,
  ) {
    const text = await this.service.readChapterText(id, chapterId);
    if (text === null) throw new NotFoundException("DOCUMENT_CHAPTER_NOT_FOUND");
    return ok({ text });
  }
}
