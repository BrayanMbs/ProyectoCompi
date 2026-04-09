import { Body, Controller, Post } from '@nestjs/common';
import { CompilerService } from './compiler.service';

@Controller('compiler')
export class CompilerController {
  constructor(private readonly compilerService: CompilerService) {}

  @Post('compile')
  compile(@Body('code') code: string) {
    return this.compilerService.compile(code);
  }

  @Post('run-java')
  runJava(@Body('java') java: string) {
    return this.compilerService.runJava(java);
  }
}
